import { test } from 'node:test';
import assert from 'node:assert/strict';
import { communityToMap, validateVehiclePoint, filterVehiclePoints, visibleVehiclePoints, readVehicleStore, writeVehicleStore, addVehiclePoint, removeLastVehiclePoint, defaultVehicleFilters } from '../src/vehicles.ts';

const car = { id: 'user-car-1', mapId: 'erangel', kind: 'car', certainty: 'fixed', position: { x: .5, y: .5 }, source: 'user' } as const;
const plane = { id: 'user-plane-1', mapId: 'erangel', kind: 'aircraft', certainty: 'possible', position: { x: .6, y: .4 }, source: 'user' } as const;

test('社区数据的纬度坐标须转为墨卡托底图比例，不能直接把 y 除以 8192', () => {
  assert.deepEqual(communityToMap(4096, 4096), { x: .5, y: .5 });
  const point = communityToMap(2048, 2048);
  assert.equal(point.x, .25);
  assert.ok(Math.abs(point.y - .359725036915205) < 1e-10);
  const northWest = communityToMap(902, 736);
  assert.ok(northWest.y > .18 && northWest.y < .20);
  assert.throws(() => communityToMap(-1, 4096));
  assert.throws(() => communityToMap(1, NaN));
});

test('点位只接受六张地图、汽车/飞机、固定/可能和有效归一化坐标', () => {
  assert.equal(validateVehiclePoint(car), true);
  for (const invalid of [{ ...car, mapId: 'fake-map' }, { ...car, kind: 'boat' }, { ...car, certainty: 'guaranteed' }, { ...car, position: { x: 1.1, y: .5 } }, { ...car, position: { x: NaN, y: .5 } }]) assert.equal(validateVehiclePoint(invalid), false);
});

test('汽车/飞机和固定/可能分别过滤，且不混入其他地图', () => {
  const points = [car, plane, { ...car, id: 'other-map', mapId: 'sanhok' }];
  assert.equal(filterVehiclePoints(points, 'erangel', defaultVehicleFilters).length, 2);
  assert.deepEqual(filterVehiclePoints(points, 'erangel', { ...defaultVehicleFilters, aircraft: false }).map(point => point.id), [car.id]);
  assert.deepEqual(filterVehiclePoints(points, 'erangel', { ...defaultVehicleFilters, fixed: false }).map(point => point.id), [plane.id]);
  assert.equal(filterVehiclePoints(points, 'erangel', { ...defaultVehicleFilters, visible: false }).length, 0);
});

test('点位随地图平移和缩放保持位置，视区外点不生成标记', () => {
  const points = [car, plane, { ...car, id: 'outside', position: { x: .95, y: .95 } }];
  const visible = visibleVehiclePoints(points, { x: -300, y: -400, size: 1000 }, { width: 400, height: 400 });
  assert.deepEqual(visible.find(point => point.id === car.id)?.screen, { x: 200, y: 100 });
  assert.equal(visible.some(point => point.id === 'outside'), false);
});

test('自记点和过滤设置可以写入并恢复，默认不修改其他存储数据', () => {
  let state = readVehicleStore(null);
  assert.equal(state.readOnly, false);
  state = addVehiclePoint(state, car);
  state = addVehiclePoint(state, plane);
  state = { ...state, filters: { ...state.filters, aircraft: false } };
  const serialized = writeVehicleStore(state);
  const restored = readVehicleStore(serialized);
  assert.deepEqual(restored.points, [car, plane]);
  assert.equal(restored.filters.aircraft, false);
});

test('无法识别的存储格式保持只读，不把损坏数据覆盖成空点位', () => {
  for (const raw of ['{bad', JSON.stringify({ schema: 99, points: [car] }), JSON.stringify({ schema: 1, points: [{ ...car, position: { x: -1, y: 0 } }], filters: defaultVehicleFilters })]) {
    const state = readVehicleStore(raw);
    assert.equal(state.readOnly, true);
    assert.throws(() => writeVehicleStore(state));
    assert.throws(() => addVehiclePoint(state, plane));
  }
});

test('撤销只移除当前地图最后一个自记点，保留其他地图记录', () => {
  let state = readVehicleStore(null);
  for (const point of [car, { ...car, id: 'sanhok-car', mapId: 'sanhok' }, plane]) state = addVehiclePoint(state, point);
  const next = removeLastVehiclePoint(state, 'erangel');
  assert.deepEqual(next.points.map(point => point.id), ['user-car-1', 'sanhok-car']);
  assert.equal(state.points.length, 3);
});
