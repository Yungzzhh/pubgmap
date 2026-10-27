import data from './data/secret-rooms.json' with { type: 'json' };
import { validateRoomPoint } from './rooms.ts';
import type { RoomPoint } from './rooms.ts';

if (data.schema !== 1 || !data.points.every(validateRoomPoint)) throw new Error('Invalid bundled room dataset');
export const roomDataset = { ...data, points: data.points as RoomPoint[] };
