import { MAPS } from './maps.ts';
import { mapToScreen } from './domain.ts';
import type { Point, View, Viewport } from './domain.ts';

export type VehicleKind = 'car' | 'aircraft';
export type SpawnCertainty = 'fixed' | 'possible';
export type VehiclePoint = { id: string; mapId: string; kind: VehicleKind; certainty: SpawnCertainty; position: Point; source: 'builtin' | 'user'; reference?: string };
export type VehicleFilters = { visible: boolean; car: boolean; aircraft: boolean; fixed: boolean; possible: boolean };
export type VehicleStore = { schema: 1; points: VehiclePoint[]; filters: VehicleFilters; readOnly: boolean };

export const defaultVehicleFilters: VehicleFilters = Object.freeze({ visible: true, car: true, aircraft: true, fixed: true, possible: true });
const mapIds = new Set(MAPS.map(map => map.id));

export function communityToMap(x: number, y: number): Point {
  if (![x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 8192)) throw new Error('Invalid source coordinate');
  const latitude = Math.max(-85.0511287798066, Math.min(85.0511287798066, 90 - y / 8192 * 180));
  const normalizedY = .5 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / (2 * Math.PI);
  return { x: x / 8192, y: Math.max(0, Math.min(1, normalizedY)) };
}

export function validateVehiclePoint(value: unknown): value is VehiclePoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as VehiclePoint;
  return typeof point.id === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(point.id) && mapIds.has(point.mapId) && ['car', 'aircraft'].includes(point.kind) && ['fixed', 'possible'].includes(point.certainty) && ['builtin', 'user'].includes(point.source) && !!point.position && [point.position.x, point.position.y].every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
}

export function filterVehiclePoints(points: readonly VehiclePoint[], mapId: string, filters: VehicleFilters): VehiclePoint[] {
  return filters.visible ? points.filter(point => point.mapId === mapId && filters[point.kind] && filters[point.certainty]) : [];
}

export function visibleVehiclePoints(points: readonly VehiclePoint[], view: View, viewport: Viewport): (VehiclePoint & { screen: Point })[] {
  return points.map(point => ({ ...point, screen: mapToScreen(point.position, view) })).filter(point => point.screen.x >= -20 && point.screen.y >= -20 && point.screen.x <= viewport.width + 20 && point.screen.y <= viewport.height + 20);
}

function validFilters(value: unknown): value is VehicleFilters {
  return !!value && typeof value === 'object' && Object.keys(defaultVehicleFilters).every(key => typeof (value as Record<string, unknown>)[key] === 'boolean');
}

export function readVehicleStore(raw: string | null): VehicleStore {
  const empty = { schema: 1 as const, points: [], filters: { ...defaultVehicleFilters }, readOnly: false };
  if (raw === null) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schema !== 1 || !Array.isArray(parsed.points) || parsed.points.length > 5000 || !parsed.points.every((point: unknown) => validateVehiclePoint(point) && point.source === 'user') || !validFilters(parsed.filters) || new Set(parsed.points.map((point: VehiclePoint) => point.id)).size !== parsed.points.length) throw new Error('Invalid vehicle store');
    return { schema: 1, points: parsed.points, filters: parsed.filters, readOnly: false };
  } catch { return { ...empty, readOnly: true }; }
}

export function writeVehicleStore(state: VehicleStore): string {
  if (state.readOnly) throw new Error('原载具记录无法读取，已保留原数据');
  return JSON.stringify({ schema: 1, points: state.points, filters: state.filters });
}

export function addVehiclePoint(state: VehicleStore, point: VehiclePoint): VehicleStore {
  if (state.readOnly) throw new Error('原载具记录无法读取，已保留原数据');
  if (!validateVehiclePoint(point) || point.source !== 'user') throw new Error('无效的自记点位');
  if (state.points.length >= 5000) throw new Error('最多保存 5000 个自记点');
  if (state.points.some(existing => existing.id === point.id)) throw new Error('点位编号重复');
  return { ...state, points: [...state.points, point] };
}

export function removeLastVehiclePoint(state: VehicleStore, mapId: string): VehicleStore {
  if (state.readOnly) throw new Error('原载具记录无法读取，已保留原数据');
  let index = state.points.length - 1;
  while (index >= 0 && state.points[index].mapId !== mapId) index--;
  return index < 0 ? state : { ...state, points: state.points.filter((_, i) => i !== index) };
}
