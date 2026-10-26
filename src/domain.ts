export type Point = { x: number; y: number };
export type View = { x: number; y: number; size: number };
export type Viewport = { width: number; height: number };
export type Measurement = { view: View; origin: Point | null; target: Point | null };

// Erangel telemetry coordinates span 819200 cm; image dimensions are 8192².
export const MAP_METERS = 8192;
export const MAX_ZOOM = 16;

export function distanceMeters(a: Point, b: Point, mapMeters: number = MAP_METERS): number {
  return Math.hypot(b.x - a.x, b.y - a.y) * mapMeters;
}

export function fitView(viewport: Viewport): View {
  const size = Math.max(1, Math.min(viewport.width, viewport.height) - 24);
  return { x: (viewport.width - size) / 2, y: (viewport.height - size) / 2, size };
}

export function mapToScreen(point: Point, view: View): Point {
  return { x: view.x + point.x * view.size, y: view.y + point.y * view.size };
}

export function screenToMap(point: Point, view: View): Point | null {
  const result = { x: (point.x - view.x) / view.size, y: (point.y - view.y) / view.size };
  return result.x < 0 || result.x > 1 || result.y < 0 || result.y > 1 ? null : result;
}

export function zoomAt(view: View, anchor: Point, factor: number, min: number, max: number): View {
  const size = Math.max(min, Math.min(max, view.size * factor));
  const ratio = size / view.size;
  return { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, size };
}

export function constrainView(view: View, viewport: Viewport): View {
  return {
    ...view,
    x: view.size <= viewport.width ? (viewport.width - view.size) / 2 : Math.max(viewport.width - view.size, Math.min(0, view.x)),
    y: view.size <= viewport.height ? (viewport.height - view.size) / 2 : Math.max(viewport.height - view.size, Math.min(0, view.y)),
  };
}

export function resizeView(view: View, previous: Viewport, next: Viewport): View {
  const center = { x: (previous.width / 2 - view.x) / view.size, y: (previous.height / 2 - view.y) / view.size };
  const size = fitView(next).size * view.size / fitView(previous).size;
  return { x: next.width / 2 - center.x * size, y: next.height / 2 - center.y * size, size };
}

export function resetPoints(state: Measurement): Measurement {
  return { ...state, origin: null, target: null };
}

export function selectPoint(state: Measurement, point: Point): Measurement {
  return state.origin ? { ...state, target: point } : { ...state, origin: point };
}

export function rangeStatus(distance: number): 'near' | 'in-range' | 'far' {
  return distance < 121 ? 'near' : distance > 700 ? 'far' : 'in-range';
}
