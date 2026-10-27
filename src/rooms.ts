import { MAPS } from './maps.ts';
import type { Point } from './domain.ts';

export type RoomKind = 'secret_room' | 'bunker';
export type RoomPoint = { id: string; mapId: string; kind: RoomKind; position: Point; reference: string };
export type RoomFilters = { visible: boolean; secret_room: boolean; bunker: boolean };
export type RoomPreferences = { schema: 1; filters: RoomFilters; readOnly: boolean };
export const defaultRoomFilters: RoomFilters = Object.freeze({ visible: true, secret_room: true, bunker: true });
const mapIds = new Set(MAPS.map(map => map.id));

export function validateRoomPoint(value: unknown): value is RoomPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as RoomPoint;
  return typeof point.id === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(point.id) && mapIds.has(point.mapId) && ['secret_room', 'bunker'].includes(point.kind) && typeof point.reference === 'string' && !!point.position && [point.position.x, point.position.y].every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
}

export function filterRoomPoints(points: readonly RoomPoint[], mapId: string, filters: RoomFilters): RoomPoint[] {
  return filters.visible ? points.filter(point => point.mapId === mapId && filters[point.kind]) : [];
}

export function readRoomPreferences(raw: string | null): RoomPreferences {
  const initial = { schema: 1 as const, filters: { ...defaultRoomFilters }, readOnly: false };
  if (raw === null) return initial;
  try {
    const data = JSON.parse(raw);
    if (data?.schema !== 1 || !data.filters || !Object.keys(defaultRoomFilters).every(key => typeof data.filters[key] === 'boolean')) throw new Error('Invalid room preferences');
    return { ...initial, filters: data.filters };
  } catch { return { ...initial, readOnly: true }; }
}

export function writeRoomPreferences(state: RoomPreferences): string {
  if (state.readOnly) throw new Error('原密室设置无法读取，已保留原数据');
  return JSON.stringify({ schema: 1, filters: state.filters });
}
