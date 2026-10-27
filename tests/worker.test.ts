import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
// @ts-ignore 原生 Node 构建模块
import { buildServiceWorker } from '../scripts/build-sw.mjs';

async function workerHarness(network?: (request: any, options?: any) => Promise<Response>) {
  const dir = await mkdtemp(join(tmpdir(), 'pubgmap-worker-'));
  await writeFile(join(dir, 'index.html'), 'index');
  await writeFile(join(dir, 'map.webp'), 'map');
  await buildServiceWorker(dir);
  const code = await readFile(join(dir, 'sw.js'), 'utf8');
  await rm(dir, { recursive: true, force: true });
  const listeners: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, string>>();
  const messages: any[] = [];
  const scope = 'https://example.test/pubgmap/';
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (requests: Request[]) => { for (const req of requests) store.set(req.url, `cached:${new URL(req.url).pathname}`); },
      match: async (url: string) => store.has(String(url)) ? new Response(store.get(String(url))) : undefined,
    };
  };
  runInNewContext(code, {
    URL, Request, Response, AbortController, setTimeout, clearTimeout,
    self: { registration: { scope }, addEventListener: (type: string, callback: any) => { listeners[type] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async (name: string) => cache(name), keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
    fetch: network ?? (async () => { throw new Error('network is offline'); }),
  });
  async function emit(type: string, data: any = {}) {
    let work: Promise<any> | undefined;
    let response: Promise<Response> | undefined;
    listeners[type]({ ...data, ports: [{ postMessage: (value: any) => messages.push(value) }], waitUntil: (value: Promise<any>) => { work = value; }, respondWith: (value: Promise<Response>) => { response = value; } });
    await work;
    return response ? await response : undefined;
  }
  await emit('install');
  return { stores, messages, scope, emit };
}

test('断网时导航和静态资源从当前版本缓存读取', async () => {
  const w = await workerHarness();
  const page = await w.emit('fetch', { request: { url: w.scope, method: 'GET', mode: 'navigate' } });
  const map = await w.emit('fetch', { request: { url: w.scope + 'map.webp?retry=1', method: 'GET', mode: 'cors' } });
  assert.equal(await page!.text(), 'cached:/pubgmap/index.html');
  assert.equal(await map!.text(), 'cached:/pubgmap/map.webp');
});

test('联网导航优先取得新版页面，且不把新版 HTML 混入旧版本离线快照', async () => {
  const requests: any[] = [];
  const w = await workerHarness(async (request, options) => { requests.push({ request, options }); return new Response('new deployed page'); });
  const page = await w.emit('fetch', { request: { url: w.scope, method: 'GET', mode: 'navigate' } });
  assert.equal(await page!.text(), 'new deployed page');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.ok(requests[0].options.signal instanceof AbortSignal, '网络探测需有超时，弱网时仍能进入离线地图');
  assert.equal([...w.stores.values()][0].get(w.scope + 'index.html'), 'cached:/pubgmap/index.html');
});

test('线上临时返回错误页面时仍可打开完整离线版本', async () => {
  const w = await workerHarness(async () => new Response('unavailable', { status: 503 }));
  const page = await w.emit('fetch', { request: { url: w.scope, method: 'GET', mode: 'navigate' } });
  assert.equal(await page!.text(), 'cached:/pubgmap/index.html');
});

test('缓存状态同时说明当前页面脚本是否属于完整离线快照，兼容旧客户端', async () => {
  const w = await workerHarness();
  await w.emit('message', { data: { type: 'CACHE_STATUS', entryUrl: w.scope + 'map.webp' } });
  assert.equal(w.messages.at(-1).ready, true);
  assert.equal(w.messages.at(-1).pageCached, true);
  assert.equal(w.messages.at(-1).entryUrl, w.scope + 'map.webp');
  await w.emit('message', { data: { type: 'CACHE_STATUS', entryUrl: w.scope + 'new-entry.js' } });
  assert.equal(w.messages.at(-1).ready, true);
  assert.equal(w.messages.at(-1).pageCached, false);
  await w.emit('message', { data: { type: 'CACHE_STATUS' } });
  assert.equal(w.messages.at(-1).ready, true);
});

test('激活只清理本路径旧版本，不影响同域其他 PWA', async () => {
  const w = await workerHarness();
  w.stores.set('erangel-pwa:/pubgmap/:old', new Map());
  w.stores.set('erangel-pwa:/another-app/:old', new Map());
  w.stores.set('unrelated-user-data', new Map());
  await w.emit('activate');
  assert.equal(w.stores.has('erangel-pwa:/pubgmap/:old'), false);
  assert.equal(w.stores.has('erangel-pwa:/another-app/:old'), true);
  assert.equal(w.stores.has('unrelated-user-data'), true);
});

test('缓存缺失时如实报告，并支持重新准备离线缓存', async () => {
  const w = await workerHarness();
  const current = [...w.stores.values()][0];
  current.delete(w.scope + 'map.webp');
  await w.emit('message', { data: { type: 'CACHE_STATUS' } });
  assert.equal(w.messages.at(-1).ready, false);
  await w.emit('message', { data: { type: 'CACHE_REPAIR' } });
  assert.equal(w.messages.at(-1).ready, true);
  assert.equal(current.has(w.scope + 'map.webp'), true);
});
