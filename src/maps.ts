import { constrainView, fitView, resizeView } from './domain.ts';
import type { Measurement, Viewport } from './domain.ts';

export type GameMap = {
  id: string;
  name: string;
  english: string;
  terrain: string;
  nominalKm: number;
  meters: number;
  image: string;
};

export const MAPS: readonly GameMap[] = [
  { id: 'erangel', name: '艾伦格', english: 'ERANGEL', terrain: '经典海岛', nominalKm: 8, meters: 8192, image: './maps/erangel.webp' },
  { id: 'miramar', name: '米拉玛', english: 'MIRAMAR', terrain: '沙漠战场', nominalKm: 8, meters: 8192, image: './maps/miramar.webp' },
  { id: 'sanhok', name: '萨诺', english: 'SANHOK', terrain: '热带雨林', nominalKm: 4, meters: 4096, image: './maps/sanhok.webp' },
  { id: 'vikendi', name: '维寒迪', english: 'VIKENDI', terrain: '冰雪战场', nominalKm: 8, meters: 8192, image: './maps/vikendi.webp' },
  { id: 'taego', name: '泰戈', english: 'TAEGO', terrain: '田野城镇', nominalKm: 8, meters: 8192, image: './maps/taego.webp' },
  { id: 'deston', name: '帝斯顿', english: 'DESTON', terrain: '都市湿地', nominalKm: 8, meters: 8192, image: './maps/deston.webp' },
];

export function getMap(id: string | null): GameMap {
  return MAPS.find(map => map.id === id) ?? MAPS[0];
}

export function mapGrid(meters: number): { position: number; major: boolean }[] {
  const lines = [];
  for (let position = 100; position < meters; position += 100) lines.push({ position, major: position % 1000 === 0 });
  return lines;
}

export class MapSessions {
  private entries = new Map<string, { state: Measurement; viewport: Viewport }>();

  save(id: string, state: Measurement, viewport: Viewport): void {
    this.entries.set(id, { state, viewport: { ...viewport } });
  }

  open(id: string, viewport: Viewport): Measurement {
    const entry = this.entries.get(id);
    if (!entry) return { view: fitView(viewport), origin: null, target: null };
    if (entry.viewport.width === viewport.width && entry.viewport.height === viewport.height) return entry.state;
    return { ...entry.state, view: constrainView(resizeView(entry.state.view, entry.viewport, viewport), viewport) };
  }
}
