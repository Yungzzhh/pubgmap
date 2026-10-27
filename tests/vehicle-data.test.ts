import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleDataset } from '../src/vehicle-data.ts';
import { validateVehiclePoint } from '../src/vehicles.ts';

test('预置资料有出处与许可，覆盖范围明确，点位编号唯一且坐标有效', () => {
  assert.equal(vehicleDataset.source.license, 'MIT');
  assert.equal(vehicleDataset.coverage.length, 6);
  assert.equal(vehicleDataset.coverage.find(map => map.mapId === 'sanhok')?.status, 'none');
  assert.ok(vehicleDataset.points.length > 200);
  assert.equal(new Set(vehicleDataset.points.map(point => point.id)).size, vehicleDataset.points.length);
  assert.ok(vehicleDataset.points.every(point => validateVehiclePoint(point) && point.source === 'builtin'));
  assert.ok(vehicleDataset.points.some(point => point.kind === 'car' && point.certainty === 'fixed'));
  assert.ok(vehicleDataset.points.some(point => point.kind === 'aircraft' && point.certainty === 'possible'));
});

test('飞机点保留动力滑翔机的可能刷新含义，首个艾伦格飞机点位于陆地区域', () => {
  const point = vehicleDataset.points.find(point => point.mapId === 'erangel' && point.reference === 'G101');
  assert.ok(point);
  assert.equal(point.kind, 'aircraft');
  assert.equal(point.certainty, 'possible');
  assert.ok(point.position.y > .18 && point.position.y < .20);
});
