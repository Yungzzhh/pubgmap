import { zoomAt } from './domain.ts';
import type { Point, View } from './domain.ts';

type Options = {
  getView: () => View;
  setView: (view: View) => void;
  limits: () => { min: number; max: number };
  onTap: (point: Point) => void;
};
type Pointer = { start: Point; current: Point; dragged: boolean };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class MapGesture {
  private options: Options;
  private pointers = new Map<number, Pointer>();
  private blockedTap = false;

  constructor(options: Options) { this.options = options; }

  clear(): void {
    this.pointers.clear();
    this.blockedTap = false;
  }

  down(id: number, point: Point): void {
    this.pointers.set(id, { start: point, current: point, dragged: false });
    if (this.pointers.size > 1) this.blockedTap = true;
  }

  move(id: number, point: Point): void {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    const before = [...this.pointers.values()].slice(0, 2).map(item => item.current);
    const previous = pointer.current;
    pointer.current = point;
    if (distance(pointer.start, point) > 6) pointer.dragged = true;
    if (this.pointers.size >= 2) {
      const after = [...this.pointers.values()].slice(0, 2).map(item => item.current);
      const oldSpan = distance(before[0], before[1]);
      const newSpan = distance(after[0], after[1]);
      const oldCenter = midpoint(before[0], before[1]);
      const newCenter = midpoint(after[0], after[1]);
      const limits = this.options.limits();
      const zoomed = zoomAt(this.options.getView(), oldCenter, oldSpan > 1 ? newSpan / oldSpan : 1, limits.min, limits.max);
      this.options.setView({ ...zoomed, x: zoomed.x + newCenter.x - oldCenter.x, y: zoomed.y + newCenter.y - oldCenter.y });
    } else if (pointer.dragged || this.blockedTap) {
      const view = this.options.getView();
      this.options.setView({ ...view, x: view.x + point.x - previous.x, y: view.y + point.y - previous.y });
    }
  }

  up(id: number, point: Point): void {
    const pointer = this.pointers.get(id);
    if (pointer && this.pointers.size === 1 && !this.blockedTap && !pointer.dragged && distance(pointer.start, point) <= 6) this.options.onTap(point);
    this.pointers.delete(id);
    if (this.pointers.size === 0) this.blockedTap = false;
  }

  cancel(id: number): void {
    this.blockedTap = true;
    this.pointers.delete(id);
    if (this.pointers.size === 0) this.blockedTap = false;
  }
}
