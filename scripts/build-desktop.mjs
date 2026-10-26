import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../src/maps.ts';
import { verifyMapAssets } from './build-sw.mjs';

export async function prepareDesktopBuild(directory) {
  await verifyMapAssets(directory);
  const index = join(directory, 'index.html');
  const html = (await readFile(index, 'utf8')).replace(/\s*<link\b[^>]*\brel="manifest"[^>]*>/g, '').replace(/\s*<meta\b[^>]*\bname="apple-mobile-[^"]*"[^>]*>/g, '');
  await writeFile(index, html);
  for (const file of ['sw.js', 'manifest.webmanifest', '.nojekyll']) await rm(join(directory, file), { force: true });
  const assets = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name !== 'desktop-bundle.json') assets.push({ path: relative(directory, full).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(full)).digest('hex') });
    }
  }
  await walk(directory);
  assets.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { schema: 1, maps: MAPS.map(map => ({ id: map.id, meters: map.meters, image: map.image })), assets };
  await writeFile(join(directory, 'desktop-bundle.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareDesktopBuild(resolve('desktop/renderer'));
  console.log(`Desktop bundle: ${result.maps.length} maps, ${result.assets.length} verified assets`);
}
