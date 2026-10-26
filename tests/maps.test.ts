import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap, mapGrid, MapSessions } from '../src/maps.ts';
import { distanceMeters, resetPoints, fitView } from '../src/domain.ts';

test('包含原艾伦格和指定的五张地图，未知选项回退到艾伦格', () => {
  assert.deepEqual(MAPS.map(map => map.id), ['erangel', 'miramar', 'sanhok', 'vikendi', 'taego', 'deston']);
  assert.equal(getMap('invalid').id, 'erangel');
  assert.equal(getMap(null).id, 'erangel');
  assert.equal(getMap('sanhok').meters, 4096);
  assert.equal(getMap('vikendi').meters, 8192);
});

test('同样屏幕比例在萨诺和 8 km 地图上使用不同距离', () => {
  const a = { x: .4, y: .5 }, b = { x: .525, y: .5 };
  for (const map of MAPS) {
    const expected = map.id === 'sanhok' ? 512 : 1024;
    assert.equal(distanceMeters(a, b, map.meters), expected, map.name);
    assert.ok(Math.abs(distanceMeters(a, { x: a.x + 500 / map.meters, y: a.y }, map.meters) - 500) < 1e-7);
  }
});

test('一公里主网格随各地图边长生成，100 米细分不越界', () => {
  const sanhok = mapGrid(4096), erangel = mapGrid(8192);
  assert.deepEqual(sanhok.filter(line => line.major).map(line => line.position), [1000, 2000, 3000, 4000]);
  assert.equal(erangel.filter(line => line.major).length, 8);
  assert.ok(sanhok.every(line => line.position > 0 && line.position < 4096));
  assert.equal(sanhok[0].position, 100);
});

test('切换地图隔离两点和视角，切回时恢复该地图会话', () => {
  const sessions = new MapSessions();
  const viewport = { width: 390, height: 500 };
  const original = sessions.open('erangel', viewport);
  const changed = { ...original, view: { x: -200, y: -300, size: 2000 }, origin: { x: .3, y: .4 }, target: { x: .4, y: .4 } };
  sessions.save('erangel', changed, viewport);
  const sanhok = sessions.open('sanhok', viewport);
  assert.equal(sanhok.origin, null);
  assert.equal(sanhok.target, null);
  assert.deepEqual(sanhok.view, fitView(viewport));
  const restored = sessions.open('erangel', viewport);
  assert.deepEqual(restored, changed);
  sessions.save('erangel', resetPoints(restored), viewport);
  assert.deepEqual(sessions.open('erangel', viewport).view, changed.view);
  assert.equal(sessions.open('sanhok', viewport).origin, null);
});

test('切换前后屏幕大小变化时，恢复同一地图的中心与缩放倍数', () => {
  const sessions = new MapSessions();
  const before = { width: 390, height: 500 }, after = { width: 500, height: 390 };
  const state = { view: { x: -537, y: -482, size: 1464 }, origin: { x: .3, y: .4 }, target: null };
  sessions.save('sanhok', state, before);
  const restored = sessions.open('sanhok', after);
  assert.equal(restored.view.size / fitView(after).size, state.view.size / fitView(before).size);
  assert.deepEqual(restored.origin, state.origin);
});
