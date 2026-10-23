import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapGesture } from '../src/gestures.ts';
import type { Point, View } from '../src/domain.ts';

function setup() {
  let view: View = { x: 0, y: 0, size: 400 };
  const taps: Point[] = [];
  const gesture = new MapGesture({ getView: () => view, setView: next => { view = next; }, limits: () => ({ min: 400, max: 6400 }), onTap: point => taps.push(point) });
  return { gesture, taps, view: () => view };
}

test('轻点触发一次定点，微小抖动不平移地图', () => {
  const s = setup();
  s.gesture.down(1, { x: 50, y: 50 });
  s.gesture.move(1, { x: 52, y: 51 });
  s.gesture.up(1, { x: 52, y: 51 });
  assert.equal(s.taps.length, 1);
  assert.deepEqual(s.view(), { x: 0, y: 0, size: 400 });
});

test('单指拖动产生平移，移回起点也不能误触定点', () => {
  const s = setup();
  s.gesture.down(1, { x: 50, y: 50 });
  s.gesture.move(1, { x: 90, y: 80 });
  assert.equal(s.view().x, 40);
  s.gesture.move(1, { x: 50, y: 50 });
  s.gesture.up(1, { x: 50, y: 50 });
  assert.equal(s.taps.length, 0);
});

test('双指拉开缩放，任意先后松手均不产生点', () => {
  const s = setup();
  s.gesture.down(1, { x: 100, y: 200 });
  s.gesture.down(2, { x: 200, y: 200 });
  s.gesture.move(2, { x: 300, y: 200 });
  assert.equal(s.view().size, 800);
  s.gesture.up(1, { x: 100, y: 200 });
  s.gesture.move(2, { x: 320, y: 200 });
  s.gesture.up(2, { x: 320, y: 200 });
  assert.equal(s.taps.length, 0);
  s.gesture.down(3, { x: 200, y: 200 });
  s.gesture.up(3, { x: 200, y: 200 });
  assert.equal(s.taps.length, 1);
});

test('系统取消触摸或丢失 pointer capture 不会定点', () => {
  const s = setup();
  s.gesture.down(1, { x: 100, y: 100 });
  s.gesture.cancel(1);
  s.gesture.up(1, { x: 100, y: 100 });
  assert.equal(s.taps.length, 0);
});
