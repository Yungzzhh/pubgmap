import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_METERS, distanceMeters, fitView, screenToMap, mapToScreen, zoomAt, resetPoints, selectPoint, resizeView, rangeStatus } from '../src/domain.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('地图采用 819200 厘米坐标边长，计算真实米数而非屏幕像素', () => {
  assert.equal(MAP_METERS, 8192);
  near(distanceMeters({ x: 0, y: 0 }, { x: 1000 / 8192, y: 0 }), 1000);
  near(distanceMeters({ x: 0, y: 0 }, { x: 300 / 8192, y: 400 / 8192 }), 500);
  assert.equal(distanceMeters({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }), 0);
});

test('缩放和平移后屏幕坐标可逆，地图范围外不能定点', () => {
  const view = { x: -200, y: -400, size: 2400 };
  const point = { x: 0.42, y: 0.68 };
  const roundtrip = screenToMap(mapToScreen(point, view), view)!;
  near(roundtrip.x, point.x);
  near(roundtrip.y, point.y);
  assert.equal(screenToMap({ x: -201, y: 0 }, view), null);
  assert.equal(screenToMap({ x: 2201, y: 0 }, view), null);
});

test('缩放以指尖为中心并限制最大最小比例', () => {
  const view = { x: 10, y: 20, size: 400 };
  const anchor = { x: 180, y: 230 };
  const before = screenToMap(anchor, view)!;
  const next = zoomAt(view, anchor, 3, 400, 6400);
  assert.deepEqual(screenToMap(anchor, next), before);
  assert.equal(zoomAt(view, anchor, 100, 400, 6400).size, 6400);
  assert.equal(zoomAt(view, anchor, 0.01, 400, 6400).size, 400);
});

test('Reset 仅清除两点，严格保留原视角', () => {
  const view = { x: -211.25, y: -400.5, size: 2800 };
  const state = { view, origin: { x: 0.4, y: 0.5 }, target: { x: 0.45, y: 0.55 } };
  const reset = resetPoints(state);
  assert.equal(reset.view, view);
  assert.equal(reset.origin, null);
  assert.equal(reset.target, null);
  assert.ok(state.origin);
});

test('连续轻点依次设置炮位、目标，后续仅更新目标', () => {
  const initial = { view: fitView({ width: 390, height: 500 }), origin: null, target: null };
  const a = { x: 0.4, y: 0.5 }, b = { x: 0.45, y: 0.5 }, c = { x: 0.46, y: 0.5 };
  const first = selectPoint(initial, a);
  assert.deepEqual(first.origin, a);
  assert.equal(first.target, null);
  const second = selectPoint(first, b);
  assert.deepEqual(second.target, b);
  const third = selectPoint(second, c);
  assert.deepEqual(third.origin, a);
  assert.deepEqual(third.target, c);
});

test('旋转屏幕保持地图中心和相对缩放倍率', () => {
  const before = { width: 390, height: 500 }, after = { width: 700, height: 330 };
  const fit = fitView(before);
  const view = zoomAt(fit, { x: 195, y: 250 }, 4, fit.size, fit.size * 16);
  const next = resizeView(view, before, after);
  near(next.size / fitView(after).size, 4);
  assert.deepEqual(screenToMap({ x: 350, y: 165 }, next), screenToMap({ x: 195, y: 250 }, view));
});

test('射程提示使用未舍入距离，包含 121 和 700 米边界', () => {
  assert.equal(rangeStatus(120.99), 'near');
  assert.equal(rangeStatus(121), 'in-range');
  assert.equal(rangeStatus(700), 'in-range');
  assert.equal(rangeStatus(700.01), 'far');
});
