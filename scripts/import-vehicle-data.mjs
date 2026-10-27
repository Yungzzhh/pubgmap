import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MAPS } from '../src/maps.ts';
import { communityToMap, validateVehiclePoint } from '../src/vehicles.ts';

const directory = resolve(process.argv[2] ?? 'output/vehicle-research');
const tree = JSON.parse(await readFile(directory + '/JanJastrow-KampfKarten-tree.json', 'utf8'));
const points = [], files = [], seen = new Set(), skippedIncomplete = [];
let removedDuplicates = 0;
for (const map of MAPS.filter(map => map.id !== 'sanhok')) {
  const path = `maps/objects_${map.id}.json`;
  const bytes = await readFile(directory + '/kampfkarten-' + path.replaceAll('/', '-'));
  const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (gitBlob !== tree.tree.find(entry => entry.path === path).sha) throw new Error('Source blob mismatch: ' + path);
  files.push({ mapId: map.id, path, gitBlob: tree.tree.find(entry => entry.path === path).sha, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const row of JSON.parse(bytes).objects) {
    if (!['car_fixed', 'garage', 'glider'].includes(row.type)) continue;
    if (!Array.isArray(row.coordinates) || row.coordinates.length !== 2 || !row.coordinates.every(value => Number.isFinite(value) && value >= 0 && value <= 8192)) {
      skippedIncomplete.push({ mapId: map.id, reference: row.id, reason: 'invalid-coordinates' });
      continue;
    }
    const kind = row.type === 'glider' ? 'aircraft' : 'car';
    const certainty = row.type === 'car_fixed' ? 'fixed' : 'possible';
    const [x, y] = row.coordinates;
    const key = `${map.id}:${kind}:${certainty}:${x}:${y}`;
    if (seen.has(key)) { removedDuplicates++; continue; }
    seen.add(key);
    const point = { id: 'kk-' + createHash('sha256').update(key).digest('hex').slice(0, 20), mapId: map.id, kind, certainty, position: communityToMap(x, y), source: 'builtin', reference: row.id };
    if (!validateVehiclePoint(point)) throw new Error('Invalid source point ' + row.id);
    points.push(point);
  }
}
const source = { name: 'KampfKarten 社区资料', url: 'https://github.com/JanJastrow/KampfKarten', tree: tree.sha, snapshot: '2025-12', checkedAt: '2026-10-27', license: 'MIT', copyright: 'Copyright (c) 2025 Jan Jastrow', transform: 'source latitude grid 8192 -> EPSG:3857 normalized raster', files, removedExactDuplicates: removedDuplicates, skippedIncomplete };
const dataset = { schema: 1, source, coverage: MAPS.map(map => ({ mapId: map.id, status: map.id === 'sanhok' ? 'none' : 'partial' })), points };
await mkdir('src/data', { recursive: true });
await writeFile('src/data/vehicle-spawns.json', JSON.stringify(dataset, null, 2) + '\n');
await writeFile('public/maps/vehicle-data-LICENSE.txt', await readFile(directory + '/kampfkarten-LICENSE'));
await mkdir('docs/changes/vehicle-spawns', { recursive: true });
await writeFile('docs/changes/vehicle-spawns/data-sources.json', JSON.stringify({ ...source, coverage: dataset.coverage, counts: MAPS.map(map => ({ mapId: map.id, cars: points.filter(point => point.mapId === map.id && point.kind === 'car').length, aircraft: points.filter(point => point.mapId === map.id && point.kind === 'aircraft').length, fixed: points.filter(point => point.mapId === map.id && point.certainty === 'fixed').length, possible: points.filter(point => point.mapId === map.id && point.certainty === 'possible').length })) }, null, 2) + '\n');
console.log(JSON.stringify({ points: points.length, removedDuplicates, counts: MAPS.map(map => ({ mapId: map.id, points: points.filter(point => point.mapId === map.id).length })) }));
