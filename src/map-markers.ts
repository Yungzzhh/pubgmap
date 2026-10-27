import { icon } from './icons.ts';
import type { Point } from './domain.ts';
import type { VehiclePoint } from './vehicles.ts';
import type { RoomPoint } from './rooms.ts';

// Scale the artwork around its local origin, leaving its map position unchanged.
const markerScale = .5;

export function renderVehicleMarkers(points: readonly (VehiclePoint & { screen: Point })[]): string {
  return points.map(point => `<g class="vehicle-point vehicle-${point.kind} vehicle-${point.certainty}${point.source === 'user' ? ' vehicle-user' : ''}" data-point-id="${point.id}" data-kind="${point.kind}" data-certainty="${point.certainty}" data-source="${point.source}" transform="translate(${point.screen.x} ${point.screen.y})"><g class="point-artwork" transform="scale(${markerScale})"><circle r="10"/><g transform="translate(-7 -7)">${icon(point.kind === 'car' ? 'car' : 'plane', 'vehicle-glyph', 14)}</g>${point.source === 'user' ? '<circle class="user-point-dot" cx="8" cy="-8" r="2.5"/>' : ''}</g></g>`).join('');
}

export function renderRoomMarkers(points: readonly (RoomPoint & { screen: Point })[]): string {
  return points.map(point => `<g class="room-point room-${point.kind}" data-point-id="${point.id}" data-kind="${point.kind}" transform="translate(${point.screen.x} ${point.screen.y})"><g class="point-artwork" transform="scale(${markerScale})"><circle r="10"/><g transform="translate(-7 -7)">${icon(point.kind === 'secret_room' ? 'key' : 'bunker', 'room-glyph', 14)}</g></g></g>`).join('');
}
