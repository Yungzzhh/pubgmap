import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../src/maps.ts';

export async function verifyMapAssets(directory) {
  for (const map of MAPS) {
    const asset = join(directory, map.image);
    const info = await stat(asset).catch(() => null);
    if (!info?.isFile() || info.size === 0) throw new Error(`Missing map asset: ${map.id} (${map.image})`);
  }
}

export async function buildServiceWorker(directory) {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name !== 'sw.js' && entry.name !== '.nojekyll') files.push(full);
    }
  }
  await walk(directory);
  files.sort();
  const hash = createHash('sha256');
  const assets = [];
  for (const file of files) {
    const asset = './' + relative(directory, file).replaceAll('\\', '/');
    assets.push(asset);
    hash.update(asset).update(await readFile(file));
  }
  const version = hash.digest('hex').slice(0, 16);
  const worker = `// Generated from the complete production build. Do not edit.
const VERSION = ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(assets)};
const SCOPE = self.registration.scope;
const PREFIX = 'erangel-pwa:' + new URL(SCOPE).pathname + ':';
const CACHE_NAME = PREFIX + VERSION;
const ASSET_URLS = PRECACHE.map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSET_URLS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!['CACHE_STATUS', 'CACHE_REPAIR'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      if (event.data.type === 'CACHE_REPAIR') await cache.addAll(ASSET_URLS.map(url => new Request(url, { cache: 'reload' })));
      const entries = await Promise.all(ASSET_URLS.map(url => cache.match(url)));
      event.ports[0]?.postMessage({ type: 'CACHE_STATUS', ready: entries.every(Boolean), version: VERSION });
    } catch {
      event.ports[0]?.postMessage({ type: 'CACHE_STATUS', ready: false, version: VERSION });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(new URL('./index.html', SCOPE).href) || fetch(request);
    })());
    return;
  }
  url.search = '';
  if (!ASSET_URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(url.href) || fetch(request);
  })());
});
`;
  await writeFile(join(directory, 'sw.js'), worker);
  await writeFile(join(directory, '.nojekyll'), '');
  return { version, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyMapAssets(resolve('dist'));
  const result = await buildServiceWorker(resolve('dist'));
  console.log(`Offline cache ${result.version}: ${result.assets.length} local assets`);
}
