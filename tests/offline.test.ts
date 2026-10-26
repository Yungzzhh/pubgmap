import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore 构建脚本以原生 JavaScript 在 Node 中运行。
import { buildServiceWorker, verifyMapAssets } from '../scripts/build-sw.mjs';
import { MAPS } from '../src/maps.ts';

test('构建前检查全部地图存在，不能把缺失地图的包报告为离线就绪', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pubgmap-map-check-'));
  try {
    await mkdir(join(dir, 'maps'));
    await assert.rejects(() => verifyMapAssets(dir), /erangel/);
    for (const map of MAPS) await writeFile(join(dir, map.image), 'fixture');
    await verifyMapAssets(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('预缓存包括嵌套资源，所有路径相对，内容变化会产生新缓存版本', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pubgmap-sw-'));
  try {
    await mkdir(join(dir, 'maps'));
    await mkdir(join(dir, 'assets'));
    for (const [name, text] of Object.entries({ 'index.html': '<html></html>', 'maps/erangel.webp': 'map-bytes', 'maps/sanhok.webp': 'sanhok-bytes', 'maps/vikendi.webp': 'vikendi-bytes', 'assets/app.js': 'js', 'manifest.webmanifest': '{}' })) await writeFile(join(dir, name), text);
    const first = await buildServiceWorker(dir);
    const code = await readFile(join(dir, 'sw.js'), 'utf8');
    for (const path of ['./index.html', './maps/erangel.webp', './maps/sanhok.webp', './maps/vikendi.webp', './assets/app.js', './manifest.webmanifest']) assert.ok(first.assets.includes(path), path);
    assert.ok(first.assets.every((path: string) => path.startsWith('./')));
    assert.ok(!first.assets.includes('./sw.js'));
    assert.ok(code.includes('self.registration.scope'));
    assert.ok(code.includes('CACHE_STATUS'));
    const repeat = await buildServiceWorker(dir);
    assert.equal(repeat.version, first.version);
    await writeFile(join(dir, 'maps/erangel.webp'), 'updated-map');
    assert.notEqual((await buildServiceWorker(dir)).version, first.version);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
