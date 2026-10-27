import data from './data/vehicle-spawns.json' with { type: 'json' };
import { validateVehiclePoint } from './vehicles.ts';
import type { VehiclePoint } from './vehicles.ts';

if (data.schema !== 1 || !data.points.every(validateVehiclePoint)) throw new Error('Invalid bundled vehicle dataset');
export const vehicleDataset = { ...data, points: data.points as VehiclePoint[] };
