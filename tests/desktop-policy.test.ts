import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
// @ts-ignore Electron 主进程策略模块为 CommonJS。
import policy from '../desktop/policy.cjs';

test('桌面资源只能读取程序包内的静态文件，支持中文及空格路径', () => {
  assert.equal(policy.resolveLocalFile('pubgmap://app/', '/应用目录/地图/renderer'), '/应用目录/地图/renderer/index.html');
  assert.equal(policy.resolveLocalFile('pubgmap://app/maps/sanhok.webp?v=1', '/app/renderer'), '/app/renderer/maps/sanhok.webp');
  assert.equal(policy.resolveLocalFile('pubgmap://app/assets/app.js', 'C:\\中文目录\\PUBG Map\\renderer', path.win32), 'C:\\中文目录\\PUBG Map\\renderer\\assets\\app.js');
  for (const url of ['https://example.com/index.html', 'file:///etc/passwd', 'pubgmap://other/maps/map.webp', 'pubgmap://app/main.cjs', 'pubgmap://app/maps/%2f..%2f..%2fmain.cjs', 'pubgmap://app/maps/%5c..%5cmain.cjs', 'pubgmap://app/maps/%00.webp']) assert.throws(() => policy.resolveLocalFile(url, '/app/renderer'), undefined, url);
});

test('Windows 便携数据目录位于 EXE 旁，开发数据隔离', () => {
  assert.equal(policy.portableDataDirectory({ packaged: true, executable: 'D:\\游戏工具\\PUBG Map\\PUBGRangefinder.exe', project: 'ignored' }, path.win32), 'D:\\游戏工具\\PUBG Map\\data');
  assert.equal(policy.portableDataDirectory({ packaged: false, executable: '/electron', project: '/repo/desktop' }), '/repo/desktop/.data');
});

test('主进程窗口权限保持沙箱隔离，网络和外部导航被限制', () => {
  assert.equal(policy.webPreferences.sandbox, true);
  assert.equal(policy.webPreferences.contextIsolation, true);
  assert.equal(policy.webPreferences.nodeIntegration, false);
  assert.equal(policy.webPreferences.webSecurity, true);
  assert.match(policy.contentSecurityPolicy, /connect-src 'none'/);
  assert.match(policy.contentSecurityPolicy, /script-src 'self'/);
  for (const url of ['https://github.com', 'http://localhost', 'wss://example.com', 'ws://localhost']) assert.equal(policy.isRemoteRequest(url), true);
  assert.equal(policy.isRemoteRequest('pubgmap://app/maps/erangel.webp'), false);
});

test('窗口初始尺寸适配 Windows 工作区，避免小屏和高 DPI 越界', () => {
  for (const workArea of [{ width: 1920, height: 1040 }, { width: 1024, height: 720 }, { width: 800, height: 560 }]) {
    const bounds = policy.windowBounds(workArea);
    assert.ok(bounds.width <= workArea.width && bounds.height <= workArea.height);
    assert.ok(bounds.minWidth <= bounds.width && bounds.minHeight <= bounds.height);
  }
});

test('程序包资源损坏或缺失时拒绝启动，避免显示错误地图', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pubgmap-desktop-integrity-'));
  try {
    const bytes = Buffer.from('bundle content');
    const manifest = { assets: [{ path: 'index.html', sha256: createHash('sha256').update(bytes).digest('hex') }] };
    await writeFile(path.join(dir, 'index.html'), bytes);
    assert.doesNotThrow(() => policy.verifyBundleIntegrity(dir, manifest));
    await writeFile(path.join(dir, 'index.html'), 'damaged');
    assert.throws(() => policy.verifyBundleIntegrity(dir, manifest), /index.html/);
    assert.throws(() => policy.verifyBundleIntegrity(dir, { assets: [{ path: '../main.cjs', sha256: 'x' }] }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
