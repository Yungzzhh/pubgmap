import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAPS } from '../src/maps.ts';
// @ts-ignore 原生 Node 桌面构建模块。
import { prepareDesktopBuild } from '../scripts/build-desktop.mjs';

test('桌面构建内置全部地图、输出完整性清单并移除 PWA 入口', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pubgmap-desktop-build-'));
  try {
    await mkdir(join(dir, 'maps'));
    await writeFile(join(dir, 'index.html'), '<html><head><link rel="manifest" href="./manifest.webmanifest" /></head><body>app</body></html>');
    await writeFile(join(dir, 'manifest.webmanifest'), '{}');
    await writeFile(join(dir, 'sw.js'), 'worker');
    for (const map of MAPS) await writeFile(join(dir, map.image), 'map-' + map.id);
    const manifest = await prepareDesktopBuild(dir);
    assert.equal(manifest.maps.length, 6);
    assert.equal(manifest.maps.find(map => map.id === 'sanhok').meters, 4096);
    assert.ok(manifest.assets.every(asset => !asset.path.includes('sw.js') && !asset.path.includes('manifest.webmanifest')));
    assert.doesNotMatch(await readFile(join(dir, 'index.html'), 'utf8'), /rel="manifest"/);
    assert.equal(JSON.parse(await readFile(join(dir, 'desktop-bundle.json'), 'utf8')).schema, 1);
    const repeated = await prepareDesktopBuild(dir);
    assert.deepEqual(repeated, manifest);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
