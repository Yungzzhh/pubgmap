import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomDataset } from '../src/room-data.ts';
import { defaultRoomFilters, filterRoomPoints, readRoomPreferences, writeRoomPreferences, validateRoomPoint } from '../src/rooms.ts';
import { renderVehicleMarkers, renderRoomMarkers } from '../src/map-markers.ts';
import { readVehicleStore } from '../src/vehicles.ts';

test('密室和掩体保留来源与原类型，60 个参考点坐标有效且编号唯一', () => {
  assert.equal(roomDataset.source.license, 'MIT');
  assert.equal(roomDataset.points.length, 60);
  assert.equal(roomDataset.points.filter(point => point.kind === 'secret_room').length, 43);
  assert.equal(roomDataset.points.filter(point => point.kind === 'bunker').length, 17);
  assert.ok(roomDataset.points.every(validateRoomPoint));
  assert.equal(new Set(roomDataset.points.map(point => point.id)).size, 60);
  assert.deepEqual(roomDataset.points.filter(point => point.mapId === 'sanhok'), []);
  const first = roomDataset.points.find(point => point.mapId === 'erangel' && point.reference === 'S101');
  assert.ok(first);
  assert.equal(first.position.x, 1380 / 8192);
  assert.ok(first.position.y > .22 && first.position.y < .24, '保留经纬网格转墨卡托后的 y，不直接除以8192');
});

test('密室与地下掩体独立筛选，地图隔离且不受汽车固定/可能筛选影响', () => {
  assert.equal(filterRoomPoints(roomDataset.points, 'erangel', defaultRoomFilters).length, 19);
  assert.equal(filterRoomPoints(roomDataset.points, 'erangel', { ...defaultRoomFilters, bunker: false }).length, 15);
  assert.equal(filterRoomPoints(roomDataset.points, 'erangel', { ...defaultRoomFilters, secret_room: false }).length, 4);
  assert.equal(filterRoomPoints(roomDataset.points, 'vikendi', defaultRoomFilters).length, 10);
  assert.equal(filterRoomPoints(roomDataset.points, 'taego', defaultRoomFilters).length, 15);
  assert.equal(filterRoomPoints(roomDataset.points, 'deston', defaultRoomFilters).length, 13);
  assert.equal(filterRoomPoints(roomDataset.points, 'miramar', defaultRoomFilters).length, 3);
  assert.deepEqual(filterRoomPoints(roomDataset.points, 'erangel', { ...defaultRoomFilters, visible: false }), []);
});

test('密室筛选可恢复，坏数据与未来版本只读且拒绝覆盖，原载具 schema 仍兼容', () => {
  const initial = readRoomPreferences(null);
  assert.equal(initial.readOnly, false);
  const changed = { ...initial, filters: { ...initial.filters, bunker: false } };
  assert.deepEqual(readRoomPreferences(writeRoomPreferences(changed)), changed);
  for (const raw of ['bad', '{"schema":2}', '{"schema":1,"filters":{"visible":true}}']) {
    const state = readRoomPreferences(raw);
    assert.equal(state.readOnly, true);
    assert.throws(() => writeRoomPreferences(state));
  }
  const old = readVehicleStore(JSON.stringify({ schema: 1, points: [{ id: 'old-car', mapId: 'erangel', kind: 'car', certainty: 'fixed', source: 'user', position: { x: .4, y: .5 } }], filters: { visible: true, car: true, aircraft: false, fixed: true, possible: true } }));
  assert.equal(old.readOnly, false);
  assert.equal(old.points[0].id, 'old-car');
});

test('汽车、飞机、密室和掩体图标整体缩小50%，保持屏幕定位与自记标识', () => {
  const common = { id: 'test', mapId: 'erangel', source: 'user' as const, position: { x: .4, y: .5 }, screen: { x: 123, y: 456 } };
  for (const kind of ['car', 'aircraft'] as const) {
    const markup = renderVehicleMarkers([{ ...common, kind, certainty: 'fixed' }]);
    assert.match(markup, /transform="translate\(123 456\)"/);
    assert.match(markup, /transform="scale\(0\.5\)"/);
    assert.match(markup, /user-point-dot/);
    assert.match(markup, /width="14" height="14"/);
  }
  for (const kind of ['secret_room', 'bunker'] as const) {
    const markup = renderRoomMarkers([{ ...common, kind }]);
    assert.match(markup, /transform="translate\(123 456\)"/);
    assert.match(markup, /transform="scale\(0\.5\)"/);
    assert.match(markup, new RegExp(`data-kind="${kind}"`));
    assert.match(markup, /room-glyph/);
  }
});
