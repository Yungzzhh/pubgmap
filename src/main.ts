import './style.css';
import { MAX_ZOOM, constrainView, distanceMeters, fitView, mapToScreen, rangeStatus, resetPoints, resizeView, screenToMap, selectPoint, zoomAt } from './domain.ts';
import type { Measurement, Point, View } from './domain.ts';
import { MapGesture } from './gestures.ts';
import { icon } from './icons.ts';
import { prepareOffline } from './offline.ts';
import type { OfflineStatus } from './offline.ts';
import { MAPS, MapSessions, getMap, mapGrid } from './maps.ts';

const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const desktopMode = import.meta.env.MODE === 'desktop';

$('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="PUBG 测距首页"><span class="brand-icon">${icon('target')}</span><span>PUBG MAP<span class="brand-sub">离线测距</span></span></a>
    <div class="header-divider"></div><span class="header-caption">让每一次瞄准，更有把握。</span>
    <div class="header-actions"><button class="offline-badge" id="offline-badge" aria-label="查看离线缓存状态"><span class="status-dot"></span><span id="offline-label">正在缓存</span></button><button class="install-button" id="install-button">${icon('download')}<span>安装到手机</span></button><button class="icon-button help-button" id="help-button" aria-label="使用与安装说明">${icon('info')}</button></div>
  </header>
  <main class="workspace">
    <section class="map-card" aria-label="艾伦格地图">
      <div id="map-viewport" class="map-viewport" role="application" aria-label="艾伦格交互地图：轻点设置炮位，再轻点设置目标；单指拖动，双指缩放" tabindex="0">
        <div id="map-world" class="map-world"><img id="map-image" src="./maps/erangel.webp" alt="PUBG 艾伦格完整地图" width="8192" height="8192" draggable="false" fetchpriority="high" /><svg id="grid-overlay" class="grid-overlay" viewBox="0 0 8192 8192" aria-hidden="true"></svg></div>
        <svg class="measurement-overlay" id="measurement-overlay" aria-hidden="true"><line id="range-line"/><circle id="range-ring"/></svg>
        <div class="map-marker marker-origin" id="origin-marker" hidden><span class="marker-label">炮位 A</span><span class="marker-ring"><i></i></span></div>
        <div class="map-marker marker-target" id="target-marker" hidden><span class="marker-label">目标 B</span><span class="marker-ring"><i></i></span></div>
        <div id="map-distance" class="map-distance" hidden></div>
      </div>
      <div class="map-heading"><span class="eyebrow">切换战场 · 6 张离线地图</span><div class="map-title-row"><h1><label class="map-picker"><select id="map-select" aria-label="选择地图">${MAPS.map(map => `<option value="${map.id}">${map.name}</option>`).join('')}</select><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></label></h1><span class="map-name-en" id="map-name-en">ERANGEL</span></div><span class="map-meta"><span class="tiny-square"></span><span id="map-meta-text">经典海岛 · 8 × 8 km</span></span></div>
      <div class="compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 24 30"><path d="m12 3 8 23-8-5-8 5Z" fill="currentColor"/><path d="M12 3v18l8 5Z" fill="#778183"/></svg></div>
      <div class="map-controls"><div class="zoom-control"><button class="icon-button" id="zoom-in" aria-label="放大地图">${icon('plus')}</button><span id="zoom-level">1.0×</span><button class="icon-button" id="zoom-out" aria-label="缩小地图">${icon('minus')}</button></div><button class="icon-button control-single" id="fit-map" aria-label="查看完整地图" title="查看完整地图">${icon('fit')}</button><button class="icon-button control-single" id="toggle-grid" aria-label="显示一公里网格" aria-pressed="false" title="一公里网格">${icon('grid')}</button></div>
      <div class="map-scale"><span id="scale-label">1 km</span><div id="scale-bar"></div></div>
      <div class="map-source">PUBG ORIGINAL MAP<span id="map-source-name">ERANGEL · NORTH UP</span></div>
      <div class="map-hint" id="map-hint">${icon('target')}<span id="hint-text">轻点地图，设置迫击炮位置</span></div>
      <div class="map-loading" id="map-loading"><span class="loading-cross">${icon('target')}</span><span id="map-loading-text">正在展开艾伦格地图…</span><button id="retry-map" class="secondary-button" hidden>重新加载地图</button></div>
    </section>
    <aside class="measurement-panel">
      <div class="panel-heading"><span class="eyebrow">PRECISION IN EVERY SHOT</span><h2>迫击炮测距</h2><p>定下炮位，让距离一目了然。</p></div>
      <section class="result-section" aria-label="测距结果"><div class="result-caption"><span class="tiny-square"></span>两点直线距离<span class="live-label">RANGE</span></div><div class="result-row"><div class="distance-output"><output id="distance-value" aria-live="polite">—</output><span>米</span></div><span id="range-status" class="range-status">等待定点</span></div><div class="range-reference"><div class="range-track"><span></span><i id="range-position" hidden></i></div><div><span>121 m</span><span>迫击炮参考射程</span><span>700 m</span></div></div></section>
      <div class="point-steps"><div class="point-step" id="origin-step"><span class="step-letter">A</span><div><strong>迫击炮位置</strong><span id="origin-detail">轻点地图设置炮位</span></div><span class="step-check">${icon('check')}</span></div><div class="point-step" id="target-step"><span class="step-letter">B</span><div><strong>目标位置</strong><span id="target-detail">再次轻点，计算距离</span></div><span class="step-check">${icon('check')}</span></div></div>
      <div class="reset-area"><button class="reset-button" id="reset-points" disabled>${icon('reset')}<span>重置定点</span><span class="reset-en">RESET</span></button><p>只清除定点，保留当前缩放与位置</p></div>
      <div class="quick-guide"><span class="eyebrow">操作指南</span><p>${icon('target')}<span>轻点两次，确定炮位与目标</span></p><p>${icon('hand')}<span>单指拖动地图，双指自由缩放</span></p><p>${icon('compass')}<span>保持炮位，继续轻点可更换目标</span></p></div>
      <div class="panel-footer"><span class="footer-dot"></span>为离线而设计<span>v1.1</span></div>
    </aside>
  </main>
  <dialog id="help-dialog"><div class="dialog-heading"><span class="eyebrow">READY WHEN YOU ARE</span><button class="icon-button" id="close-help" aria-label="关闭说明">${icon('close')}</button></div><h2>把战场地图，装进口袋。</h2><p class="dialog-intro">安装到主屏幕后，可以像 App 一样打开。</p><ol class="install-steps"><li><span>01</span><div><strong>联网打开，等待全部地图缓存完成</strong><p id="cache-description">六张地图与应用正在保存到这台设备。</p></div></li><li><span>02</span><div><strong>添加到手机主屏幕</strong><p>iPhone：用 Safari 打开，点分享 →「添加到主屏幕」。<br>Android：在 Chrome 菜单中选择「安装应用」或「添加到主屏幕」。</p></div></li><li><span>03</span><div><strong>打开一次，再安心离线</strong><p>从主屏幕启动，确认显示「离线就绪」后即可断网切换全部地图。浏览器数据被清理后，需要重新联网缓存。</p></div></li></ol><button class="primary-button" id="native-install" hidden>${icon('download')}安装应用</button><button class="secondary-button" id="retry-cache" hidden>重新准备离线缓存</button><div class="dialog-notes"><p>点击地图左上角名称切换战场。每张地图独立保留本次打开期间的定点和视角；下次打开会记住上次选择的地图。</p><p>轻点设置炮位 A，再点目标 B 即可测距。后续点击只调整目标；重置定点保留视角。地图可用方向键移动，按 + / − 缩放。</p><p>结果为地图水平直线距离，不含地形高差及弹道修正。参考射程 121–700 米。</p><p>地图来源：<a href="https://github.com/pubg/api-assets" target="_blank" rel="noreferrer">PUBG 官方 API 素材</a>。本工具为非官方玩家工具，地图版权归 KRAFTON 所有。</p></div></dialog>
`;

if (desktopMode) {
  document.body.classList.add('desktop-app');
  $('.brand').removeAttribute('href');
  $('.brand').setAttribute('aria-label', 'PUBG 桌面测距');
  $('.brand-sub').textContent = '桌面离线测距';
  $('#install-button').hidden = true;
  $('#native-install').hidden = true;
  $('#help-button').setAttribute('aria-label', '使用说明');
  $('#offline-badge').setAttribute('aria-label', '查看本地地图说明');
  $('#help-dialog h2').textContent = 'PUBG 迫击炮测距';
  $('.dialog-intro').textContent = '六张地图已内置，解压后即可离线使用。';
  $('.install-steps').innerHTML = '<li><span>01</span><div><strong>选择战场</strong><p id="cache-description">从左上角切换六张内置地图。</p></div></li><li><span>02</span><div><strong>点击两次，即可测距</strong><p>先选炮位，再选目标；按住拖动地图，滚轮或双指缩放。重置定点保留当前视角。</p></div></li><li><span>03</span><div><strong>随程序一起带走</strong><p>上次选择的地图保存在程序旁的 data 文件夹。移动或更新应用时，请一同保留这个文件夹。</p></div></li>';
  $('#help-dialog a').replaceWith(document.createTextNode('PUBG 官方 API 素材'));
  $('.quick-guide p:nth-of-type(2) span').textContent = '按住拖动地图，滚轮或双指缩放';
  $('.panel-footer > span:last-child').textContent = 'v1.2 桌面版';
}

const viewport = $('#map-viewport');
let dimensions = { width: viewport.clientWidth, height: viewport.clientHeight };
let savedMap: string | null = null;
try { savedMap = localStorage.getItem('pubgmap.selected-map'); } catch { /* Storage may be unavailable in private browsing. */ }
let activeMap = getMap(savedMap);
const sessions = new MapSessions();
let state: Measurement = sessions.open(activeMap.id, dimensions);
let mapLoaded = false;
const image = $<HTMLImageElement>('#map-image');
let gridEnabled = false;

function renderMapMetadata(): void {
  $<HTMLSelectElement>('#map-select').value = activeMap.id;
  $('#map-name-en').textContent = activeMap.english;
  $('#map-meta-text').textContent = `${activeMap.terrain} · ${activeMap.nominalKm} × ${activeMap.nominalKm} km`;
  $('#map-source-name').textContent = `${activeMap.english} · NORTH UP`;
  $('.map-card').setAttribute('aria-label', `${activeMap.name}地图`);
  viewport.setAttribute('aria-label', `${activeMap.name}交互地图：轻点设置炮位，再轻点设置目标；单指拖动，双指缩放`);
  image.alt = `PUBG ${activeMap.name}完整地图`;
  document.title = `${activeMap.name}测距 · PUBG MAP${desktopMode ? ' 桌面版' : ''}`;
  $('#grid-overlay').setAttribute('viewBox', `0 0 ${activeMap.meters} ${activeMap.meters}`);
  $('#grid-overlay').innerHTML = mapGrid(activeMap.meters).map(line => `<path class="${line.major ? 'grid-major' : 'grid-minor'}" d="M${line.position} 0V${activeMap.meters}M0 ${line.position}H${activeMap.meters}"/>`).join('');
}

function renderView(): void {
  const view = state.view;
  const zoom = view.size / fitView(dimensions).size;
  const world = $('#map-world');
  world.style.width = world.style.height = `${view.size}px`;
  world.style.transform = `translate3d(${view.x}px, ${view.y}px, 0)`;
  $('#zoom-level').textContent = `${zoom.toFixed(1)}×`;
  $<HTMLButtonElement>('#zoom-out').disabled = zoom <= 1.001;
  $<HTMLButtonElement>('#zoom-in').disabled = zoom >= MAX_ZOOM - 0.001;
  $('#grid-overlay').classList.toggle('visible', gridEnabled);
  $('#grid-overlay').classList.toggle('detailed', zoom >= 4);
  const maxMeters = 100 * activeMap.meters / view.size;
  const meters = [10, 20, 50, 100, 200, 500, 1000, 2000].filter(value => value <= maxMeters).at(-1) ?? 10;
  $('#scale-label').textContent = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
  $('#scale-bar').style.width = `${meters / activeMap.meters * view.size}px`;
  for (const [point, selector] of [[state.origin, '#origin-marker'], [state.target, '#target-marker']] as const) {
    const marker = $(selector);
    marker.hidden = !point;
    if (point) { const screen = mapToScreen(point, view); marker.style.left = `${screen.x}px`; marker.style.top = `${screen.y}px`; }
  }
  const line = $('#range-line');
  const ring = $('#range-ring');
  const distanceLabel = $('#map-distance');
  if (state.origin) {
    const origin = mapToScreen(state.origin, view);
    ring.setAttribute('cx', String(origin.x)); ring.setAttribute('cy', String(origin.y)); ring.setAttribute('r', String(700 / activeMap.meters * view.size));
  }
  ring.classList.toggle('visible', !!state.origin);
  line.classList.toggle('visible', !!state.target);
  distanceLabel.hidden = !state.target;
  if (state.origin && state.target) {
    const a = mapToScreen(state.origin, view), b = mapToScreen(state.target, view);
    for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) line.setAttribute(key, String(value));
    distanceLabel.style.left = `${(a.x + b.x) / 2}px`;
    distanceLabel.style.top = `${(a.y + b.y) / 2}px`;
    distanceLabel.textContent = `${Math.round(distanceMeters(state.origin, state.target, activeMap.meters)).toLocaleString('en-US')} m`;
  }
}

function renderMeasurement(): void {
  const distance = state.origin && state.target ? distanceMeters(state.origin, state.target, activeMap.meters) : null;
  $('#distance-value').textContent = distance === null ? '—' : Math.round(distance).toLocaleString('en-US');
  const status = $('#range-status');
  const range = distance === null ? '' : rangeStatus(distance);
  status.className = `range-status ${range}`;
  status.textContent = distance === null ? (state.origin ? '等待目标' : '等待定点') : range === 'in-range' ? '射程范围内' : range === 'near' ? '低于最小射程' : '超出最大射程';
  $('#origin-step').classList.toggle('selected', !!state.origin);
  $('#target-step').classList.toggle('selected', !!state.target);
  $('#origin-detail').textContent = state.origin ? '炮位已固定' : '轻点地图设置炮位';
  $('#target-detail').textContent = state.target ? '轻点地图可更换目标' : '再次轻点，计算距离';
  $<HTMLButtonElement>('#reset-points').disabled = !state.origin;
  $('#hint-text').textContent = !state.origin ? '轻点地图，设置迫击炮位置' : !state.target ? '再次轻点，选择目标位置' : desktopMode ? '点击更换目标 · 滚轮缩放地图' : '轻点更换目标 · 双指缩放地图';
  const indicator = $('#range-position');
  indicator.hidden = distance === null;
  if (distance !== null) indicator.style.left = `${Math.max(0, Math.min(100, (distance - 121) / (700 - 121) * 100))}%`;
  renderView();
}

function setView(view: View): void { state = { ...state, view: constrainView(view, dimensions) }; renderView(); }
function limits() { const min = fitView(dimensions).size; return { min, max: min * MAX_ZOOM }; }
function zoom(factor: number, point = { x: dimensions.width / 2, y: dimensions.height / 2 }): void { const { min, max } = limits(); setView(zoomAt(state.view, point, factor, min, max)); }
function localPoint(event: PointerEvent | WheelEvent): Point { const rect = viewport.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }

const gesture = new MapGesture({
  getView: () => state.view, setView, limits,
  onTap: point => {
    if (!mapLoaded) return;
    const position = screenToMap(point, state.view);
    if (position) { state = selectPoint(state, position); renderMeasurement(); }
  },
});
viewport.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && event.button !== 0) return; viewport.setPointerCapture(event.pointerId); gesture.down(event.pointerId, localPoint(event)); viewport.classList.add('is-touching'); });
viewport.addEventListener('pointermove', event => gesture.move(event.pointerId, localPoint(event)));
viewport.addEventListener('pointerup', event => { gesture.up(event.pointerId, localPoint(event)); viewport.classList.remove('is-touching'); });
for (const type of ['pointercancel', 'lostpointercapture']) viewport.addEventListener(type, event => { gesture.cancel((event as PointerEvent).pointerId); viewport.classList.remove('is-touching'); });
viewport.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-event.deltaY * 0.002), localPoint(event)); }, { passive: false });
viewport.addEventListener('contextmenu', event => event.preventDefault());
viewport.addEventListener('keydown', event => {
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.5); }
  else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.5); }
  else if (event.key.startsWith('Arrow')) { event.preventDefault(); setView({ ...state.view, x: state.view.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0), y: state.view.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0) }); }
});
$('#zoom-in').addEventListener('click', () => zoom(1.5));
$('#zoom-out').addEventListener('click', () => zoom(1 / 1.5));
$('#fit-map').addEventListener('click', () => setView(fitView(dimensions)));
$('#toggle-grid').addEventListener('click', () => { gridEnabled = !gridEnabled; $('#toggle-grid').setAttribute('aria-pressed', String(gridEnabled)); renderView(); });
$('#reset-points').addEventListener('click', () => { state = resetPoints(state); renderMeasurement(); });

new ResizeObserver(() => {
  const next = { width: viewport.clientWidth, height: viewport.clientHeight };
  if (next.width === dimensions.width && next.height === dimensions.height) return;
  const view = resizeView(state.view, dimensions, next);
  dimensions = next;
  setView(view);
}).observe(viewport);

const onMapLoad = () => {
  if (!image.complete || !image.naturalWidth || new URL(image.currentSrc).pathname !== new URL(activeMap.image, location.href).pathname) return;
  mapLoaded = true; $('#map-loading').hidden = true;
};
image.addEventListener('load', onMapLoad);
image.addEventListener('error', () => { mapLoaded = false; $('#map-loading').hidden = false; $('#map-loading-text').textContent = desktopMode ? '本地地图读取失败，请重新解压完整应用包' : '地图加载失败，请联网重试'; $('#retry-map').hidden = false; });
if (image.complete && image.naturalWidth > 0) onMapLoad();
function loadMap(): void {
  mapLoaded = false;
  $('#map-loading').hidden = false;
  $('#map-loading-text').textContent = `正在展开${activeMap.name}地图…`;
  $('#retry-map').hidden = true;
  image.src = activeMap.image;
  if (image.complete && image.naturalWidth > 0) onMapLoad();
}
$('#retry-map').addEventListener('click', () => { $('#map-loading-text').textContent = `正在重新加载${activeMap.name}地图…`; $('#retry-map').hidden = true; image.src = `${activeMap.image}?retry=${Date.now()}`; });
$('#map-select').addEventListener('change', event => {
  const next = getMap((event.target as HTMLSelectElement).value);
  if (next.id === activeMap.id) return;
  sessions.save(activeMap.id, state, dimensions);
  gesture.clear();
  viewport.classList.remove('is-touching');
  activeMap = next;
  state = sessions.open(activeMap.id, dimensions);
  try { localStorage.setItem('pubgmap.selected-map', activeMap.id); } catch { /* Keep working without storage. */ }
  renderMapMetadata();
  renderMeasurement();
  loadMap();
});

const dialog = $<HTMLDialogElement>('#help-dialog');
for (const selector of ['#install-button', '#help-button', '#offline-badge']) $(selector).addEventListener('click', () => dialog.showModal());
$('#close-help').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); });

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); if (desktopMode) return; deferredInstall = event as InstallEvent; $('#native-install').hidden = false; });
$('#native-install').addEventListener('click', async () => { if (!deferredInstall) return; await deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#native-install').hidden = true; });
window.addEventListener('appinstalled', () => { $('#install-button').hidden = true; $('#native-install').hidden = true; });
if (matchMedia('(display-mode: standalone)').matches) $('#install-button').hidden = true;

let offlineStatus: OfflineStatus = 'preparing';
function renderOffline(): void {
  if (offlineStatus === 'bundled') {
    $('#offline-badge').classList.add('ready');
    $('#offline-label').textContent = '地图已内置';
    $('#cache-description').textContent = '六张地图直接来自程序文件，可以立即离线切换和测距。';
    $('#retry-cache').hidden = true;
    return;
  }
  const ready = offlineStatus === 'ready';
  $('#offline-badge').classList.toggle('ready', ready);
  $('#offline-badge').classList.toggle('failed', offlineStatus === 'failed');
  $('#offline-label').textContent = ready ? (navigator.onLine ? '离线就绪' : '离线使用中') : offlineStatus === 'unsupported' ? '需 HTTPS 安装' : offlineStatus === 'failed' ? '缓存未完成' : navigator.onLine ? '正在缓存' : '离线未就绪';
  $('#cache-description').textContent = ready ? '全部六张地图与应用已完整缓存到这台设备，可以离线切换和测距。' : offlineStatus === 'unsupported' ? '请通过 HTTPS 地址或 localhost 打开，才能启用离线缓存。' : offlineStatus === 'failed' ? '缓存尚未完成，请保持联网并重新准备离线缓存。' : '六张地图与应用正在保存到这台设备，请暂时保持联网。';
  $('#retry-cache').hidden = offlineStatus !== 'failed';
}
const startOffline = (repair = false) => void prepareOffline(status => { offlineStatus = status; renderOffline(); }, repair, desktopMode ? 'desktop' : 'web');
$('#retry-cache').addEventListener('click', () => startOffline(true));
window.addEventListener('online', renderOffline);
window.addEventListener('offline', renderOffline);
renderMapMetadata();
renderMeasurement();
loadMap();
startOffline();
