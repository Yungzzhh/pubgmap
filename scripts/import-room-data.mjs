import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MAPS } from '../src/maps.ts';
import { communityToMap } from '../src/vehicles.ts';
import { validateRoomPoint } from '../src/rooms.ts';

const directory = resolve(process.argv[2] ?? 'output/vehicle-research');
const tree = JSON.parse(await readFile(directory + '/JanJastrow-KampfKarten-tree.json', 'utf8'));
const points = [], files = [], seen = new Set();
for (const map of MAPS.filter(map => map.id !== 'sanhok')) {
  const path = `maps/objects_${map.id}.json`;
  const bytes = await readFile(directory + '/kampfkarten-' + path.replaceAll('/', '-'));
  const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (gitBlob !== tree.tree.find(entry => entry.path === path)?.sha) throw new Error('Source blob mismatch: ' + path);
  files.push({ mapId: map.id, path, gitBlob, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const row of JSON.parse(bytes).objects) {
    if (!['secret_room', 'bunker'].includes(row.type)) continue;
    if (!Array.isArray(row.coordinates) || row.coordinates.length !== 2) throw new Error('Invalid source room ' + row.id);
    const [x, y] = row.coordinates;
    const key = `${map.id}:${row.type}:${x}:${y}`;
    if (seen.has(key)) throw new Error('Duplicate source room ' + key);
    seen.add(key);
    const point = { id: 'kk-room-' + createHash('sha256').update(key).digest('hex').slice(0, 20), mapId: map.id, kind: row.type, position: communityToMap(x, y), reference: row.id };
    if (!validateRoomPoint(point)) throw new Error('Invalid room ' + row.id);
    points.push(point);
  }
}
const source = { name: 'KampfKarten 社区资料', url: 'https://github.com/JanJastrow/KampfKarten', tree: tree.sha, snapshot: '2025-12', checkedAt: '2026-10-27', license: 'MIT', licenseFile: 'maps/vehicle-data-LICENSE.txt', transform: 'source latitude grid 8192 -> EPSG:3857 normalized raster', files };
const coverage = MAPS.map(map => ({ mapId: map.id, status: map.id === 'sanhok' ? 'none' : 'partial', secretRooms: points.filter(point => point.mapId === map.id && point.kind === 'secret_room').length, bunkers: points.filter(point => point.mapId === map.id && point.kind === 'bunker').length }));
await writeFile('src/data/secret-rooms.json', JSON.stringify({ schema: 1, source, coverage, points }, null, 2) + '\n');
await mkdir('docs/changes/secret-rooms', { recursive: true });
await writeFile('docs/changes/secret-rooms/data-sources.json', JSON.stringify({ ...source, coverage }, null, 2) + '\n');
console.log(JSON.stringify({ total: points.length, coverage }));
