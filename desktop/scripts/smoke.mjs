import { _electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const executablePath = process.argv[2];
if (!executablePath) throw new Error('需要待验证的 Windows EXE 路径');
assert.equal(process.platform, 'win32', '此启动验收必须在 Windows 上运行');
const output = resolve('output/desktop');
await mkdir(output, { recursive: true });
const report = { platform: process.platform, arch: process.arch, executable: executablePath, checks: [], maps: [] };
let application;

async function glyphSize(locator) {
  return locator.evaluate(element => {
    const matrix = element.getScreenCTM();
    return { width: Math.hypot(matrix.a, matrix.b) * element.viewBox.baseVal.width, height: Math.hypot(matrix.c, matrix.d) * element.viewBox.baseVal.height };
  });
}

async function circleDiameter(locator) {
  // SVG geometry excludes the stroke; Playwright boundingBox includes it.
  return locator.evaluate(element => element.getBoundingClientRect().width);
}

async function launch() {
  return await _electron.launch({ executablePath, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'], cwd: tmpdir(), timeout: 60000 });
}

try {
  application = await launch();
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(30000);
  await page.getByRole('combobox', { name: '选择地图' }).waitFor();
  await page.locator('#map-loading').waitFor({ state: 'hidden' });
  assert.ok(page.url().startsWith('pubgmap://app/'));
  assert.equal(await page.locator('#offline-label').textContent(), '地图已内置');
  assert.equal(await page.locator('#install-button').isVisible(), false);
  assert.equal(await page.locator('#native-install').isVisible(), false);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => !!document.querySelector('link[rel="manifest"]')), false);
  const native = await application.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    dataDirectory: app.getPath('userData'),
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(native.packaged, true);
  assert.equal(native.version, '1.4.0');
  assert.equal(resolve(native.dataDirectory).toLowerCase(), join(dirname(resolve(executablePath)), 'data').toLowerCase());
  assert.equal(native.preferences.sandbox, true);
  assert.equal(native.preferences.contextIsolation, true);
  assert.equal(native.preferences.nodeIntegration, false);
  report.native = native;
  report.checks.push('Windows EXE first launch with DNS disabled', 'portable data beside EXE', 'sandbox and context isolation', 'desktop UI without PWA or Service Worker');

  for (const id of ['erangel', 'miramar', 'sanhok', 'vikendi', 'taego', 'deston']) {
    await page.getByRole('combobox', { name: '选择地图' }).selectOption(id);
    await page.locator('#map-loading').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#map-image').evaluate(image => image.naturalWidth), 4096);
    await page.getByRole('button', { name: '查看完整地图' }).click();
    const roomCounts = { erangel: 19, miramar: 3, sanhok: 0, vikendi: 10, taego: 15, deston: 13 };
    assert.equal(await page.locator('#room-markers .room-point').count(), roomCounts[id], id + ' built-in rooms');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '放大地图', exact: true }).click();
    const rect = await page.locator('#map-viewport').boundingBox();
    const size = await page.locator('#map-world').evaluate(element => parseFloat(element.style.width));
    const x = rect.x + rect.width * .3, y = rect.y + rect.height * .6;
    await page.mouse.click(x, y);
    await page.mouse.click(x + size * 500 / (id === 'sanhok' ? 4096 : 8192), y);
    assert.equal(await page.locator('#distance-value').textContent(), '500', id + ' 500 m');
    const view = await page.locator('#map-world').getAttribute('style');
    if (id === 'erangel' || id === 'sanhok') await page.screenshot({ path: join(output, id + '.png'), scale: 'css' });
    await page.getByRole('button', { name: '重置定点 RESET' }).click();
    assert.equal(await page.locator('#map-world').getAttribute('style'), view, id + ' reset retains view');
    assert.equal(await page.locator('#distance-value').textContent(), '—');
    report.maps.push({ id, distance: 500, resetPreservedView: true });
  }
  await page.getByRole('combobox', { name: '选择地图' }).selectOption('erangel');
  await page.locator('#map-loading').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '查看完整地图' }).click();
  assert.equal(await page.locator('#vehicle-markers .vehicle-point').count(), 97);
  const vehicleGlyph = await glyphSize(page.locator('#vehicle-markers .icon').first());
  assert.ok(Math.abs(vehicleGlyph.width - 7) < .1 && Math.abs(vehicleGlyph.height - 7) < .1, 'Vehicle glyph must be exactly 50% of 14 px');
  const vehicleCircle = await circleDiameter(page.locator('#vehicle-markers .point-artwork > circle').first());
  assert.ok(Math.abs(vehicleCircle - 10) < .1, 'Vehicle circle must be 50% of 20 px');
  await page.getByRole('button', { name: '载具点位设置' }).click();
  await page.locator('#vehicle-aircraft').uncheck();
  assert.equal(await page.locator('#vehicle-markers [data-kind="aircraft"]').count(), 0);
  assert.ok(await page.locator('#vehicle-markers [data-kind="car"]').count() > 0);
  await page.locator('#vehicle-fixed').uncheck();
  assert.equal(await page.locator('#vehicle-markers [data-certainty="fixed"]').count(), 0);
  await page.locator('#vehicle-aircraft').check();
  await page.locator('#vehicle-fixed').check();
  await page.screenshot({ path: join(output, 'vehicle-panel.png'), scale: 'css' });
  await page.getByRole('button', { name: '关闭载具设置' }).click();
  assert.equal(await page.locator('#room-markers .room-point').count(), 19);
  const roomGlyph = await glyphSize(page.locator('#room-markers .icon').first());
  const roomCircle = await circleDiameter(page.locator('#room-markers .point-artwork > circle').first());
  assert.ok(Math.abs(roomGlyph.width - 7) < .1 && Math.abs(roomGlyph.height - 7) < .1);
  assert.ok(Math.abs(roomCircle - 10) < .1);
  await page.getByRole('button', { name: '密室位置设置' }).click();
  await page.locator('#room-secret').uncheck();
  assert.equal(await page.locator('#room-markers .room-secret_room').count(), 0);
  assert.equal(await page.locator('#room-markers .room-bunker').count(), 4);
  assert.equal(await page.locator('#vehicle-markers .vehicle-point').count(), 97);
  await page.locator('#room-secret').check();
  await page.locator('#room-bunkers').uncheck();
  assert.equal(await page.locator('#room-markers .room-point').count(), 15);
  await page.locator('#room-visible').uncheck();
  assert.equal(await page.locator('#room-markers .room-point').count(), 0);
  await page.locator('#room-visible').check();
  await page.screenshot({ path: join(output, 'room-panel.png'), scale: 'css' });
  await page.getByRole('button', { name: '关闭密室设置' }).click();
  const roomRect = await page.locator('#map-viewport').boundingBox();
  const centralRoom = await page.locator('#room-markers .room-point').evaluateAll((elements, rect) => elements.map(element => {
    const matrix = element.transform.baseVal.consolidate().matrix;
    return { x: matrix.e, y: matrix.f };
  }).find(point => point.x > rect.width * .25 && point.x < rect.width * .65 && point.y > rect.height * .3 && point.y < rect.height * .75), roomRect);
  assert.ok(centralRoom, 'Find a room clear of map controls');
  const roomSize = await page.locator('#map-world').evaluate(element => parseFloat(element.style.width));
  await page.mouse.click(roomRect.x + centralRoom.x, roomRect.y + centralRoom.y);
  await page.mouse.click(roomRect.x + centralRoom.x + roomSize * 500 / 8192, roomRect.y + centralRoom.y);
  assert.equal(await page.locator('#distance-value').textContent(), '500', 'Room marker must not intercept measurement');
  const roomView = await page.locator('#map-world').getAttribute('style');
  await page.getByRole('button', { name: '重置定点 RESET' }).click();
  assert.equal(await page.locator('#room-markers .room-point').count(), 15);
  assert.equal(await page.locator('#map-world').getAttribute('style'), roomView);
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  const enlargedGlyph = await glyphSize(page.locator('#room-markers .icon').first());
  assert.ok(Math.abs(enlargedGlyph.width - 7) < .1, 'Room artwork must keep its smaller size when zoomed');
  // Every marker stays at the same position relative to the underlying map image.
  const roomPositions = await page.locator('#room-markers .room-point').evaluateAll(elements => elements.map(element => {
    const matrix = element.transform.baseVal.consolidate().matrix;
    return { id: element.dataset.pointId, x: matrix.e, y: matrix.f };
  }));
  const worldRect = await page.locator('#map-world').boundingBox();
  const roomData = JSON.parse(await (await import('node:fs/promises')).readFile('src/data/secret-rooms.json', 'utf8'));
  for (const marker of roomPositions) {
    const point = roomData.points.find(point => point.id === marker.id);
    assert.ok(Math.abs(marker.x - (worldRect.x - roomRect.x + point.position.x * worldRect.width)) < .1);
    assert.ok(Math.abs(marker.y - (worldRect.y - roomRect.y + point.position.y * worldRect.height)) < .1);
  }
  report.rooms = { builtin: 60, secretRooms: 43, bunkers: 17, glyphPixels: 7, circlePixels: 10, scale: .5, filtersVerified: true, measureThroughMarker: true, resetKeptRooms: true, zoomPositionVerified: true };
  await page.getByRole('combobox', { name: '选择地图' }).selectOption('sanhok');
  await page.locator('#map-loading').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '查看完整地图' }).click();
  assert.equal(await page.locator('#vehicle-markers .vehicle-point').count(), 0);
  const recordRect = await page.locator('#map-viewport').boundingBox();
  for (const [kind, certainty, factor] of [['car', 'fixed', .4], ['aircraft', 'possible', .65]]) {
    await page.getByRole('button', { name: '载具点位设置' }).click();
    await page.getByRole('combobox', { name: '记录载具类型' }).selectOption(kind);
    await page.getByRole('combobox', { name: '记录刷新类型' }).selectOption(certainty);
    await page.getByRole('button', { name: '记录点位', exact: true }).click();
    await page.mouse.click(recordRect.x + recordRect.width * factor, recordRect.y + recordRect.height * .5);
    await page.getByRole('button', { name: '结束记录', exact: true }).click();
  }
  assert.equal(await page.locator('#vehicle-markers .vehicle-user').count(), 2);
  assert.equal(await page.locator('#distance-value').textContent(), '—');
  const marker = await page.locator('#vehicle-markers .vehicle-user[data-kind="car"]').getAttribute('transform');
  const coordinates = marker.match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
  const recordSize = await page.locator('#map-world').evaluate(element => parseFloat(element.style.width));
  await page.mouse.click(recordRect.x + coordinates[0], recordRect.y + coordinates[1]);
  await page.mouse.click(recordRect.x + coordinates[0] + recordSize * 500 / 4096, recordRect.y + coordinates[1]);
  assert.equal(await page.locator('#distance-value').textContent(), '500');
  const vehicleView = await page.locator('#map-world').getAttribute('style');
  await page.getByRole('button', { name: '重置定点 RESET' }).click();
  assert.equal(await page.locator('#vehicle-markers .vehicle-user').count(), 2);
  assert.equal(await page.locator('#map-world').getAttribute('style'), vehicleView);
  await page.screenshot({ path: join(output, 'vehicle-records.png'), scale: 'css' });
  report.vehiclePoints = { builtin: 257, erangel: 97, recordedSanhok: 2, kinds: ['car', 'aircraft'], filtersVerified: true, resetKeptRecords: true };
  assert.equal(application.context().serviceWorkers().length, 0);
  const probeBlocked = await page.evaluate(async () => { try { await fetch('https://example.com/desktop-offline-probe'); return false; } catch { return true; } });
  assert.equal(probeBlocked, true);
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  assert.equal(await page.locator('#help-dialog').isVisible(), true);
  assert.ok(!(await page.locator('.install-steps').textContent()).includes('添加到主屏幕'));
  await page.getByRole('button', { name: '关闭说明' }).click();
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'window.aria.txt'), await page.locator('body').ariaSnapshot());
  await application.close();
  application = null;
  assert.ok((await stat(native.dataDirectory)).isDirectory());

  application = await launch();
  const reopened = await application.firstWindow();
  await reopened.locator('#map-loading').waitFor({ state: 'hidden' });
  assert.equal(await reopened.locator('#map-select').inputValue(), 'sanhok');
  assert.equal(await reopened.locator('#offline-label').textContent(), '地图已内置');
  assert.equal(await reopened.locator('#vehicle-markers .vehicle-user').count(), 2);
  await reopened.getByRole('button', { name: '密室位置设置' }).click();
  assert.equal(await reopened.locator('#room-secret').isChecked(), true);
  assert.equal(await reopened.locator('#room-bunkers').isChecked(), false);
  await reopened.getByRole('button', { name: '关闭密室设置' }).click();
  await reopened.getByRole('combobox', { name: '选择地图' }).selectOption('erangel');
  await reopened.locator('#map-loading').waitFor({ state: 'hidden' });
  await reopened.getByRole('button', { name: '查看完整地图' }).click();
  assert.equal(await reopened.locator('#room-markers .room-point').count(), 15);
  assert.equal(await reopened.locator('#vehicle-markers .vehicle-point').count(), 97);
  report.checks.push('60 built-in room and bunker positions offline', 'all map glyphs at 50 percent size', 'room filters independent from vehicles and persist across restart', 'measure through room marker', 'room positions align after zoom', 'reset keeps room layer');
  report.checks.push('six maps measure 500 m offline', 'reset retains view', 'external network denied', 'selected map persists after full restart', 'car and aircraft filters', 'recorded vehicle points persist after restart', 'reset does not delete vehicle points');
  report.success = true;
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.success = false;
  report.error = error.stack;
  if (application) {
    try { const page = await application.firstWindow(); await page.screenshot({ path: join(output, 'failure.png') }); await writeFile(join(output, 'failure.html'), await page.content()); } catch {}
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally { if (application) await application.close(); }
