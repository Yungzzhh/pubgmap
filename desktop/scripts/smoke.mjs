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
  assert.equal(await reopened.locator('#map-select').inputValue(), 'deston');
  assert.equal(await reopened.locator('#offline-label').textContent(), '地图已内置');
  report.checks.push('six maps measure 500 m offline', 'reset retains view', 'external network denied', 'selected map persists after full restart');
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
