const { app, BrowserWindow, Menu, protocol, net, session, screen, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const policy = require('./policy.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'pubgmap', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.setName('PUBG 迫击炮测距');
if (process.platform === 'win32') app.setAppUserModelId('com.yungzzhh.pubgmap');

const directory = path.join(__dirname, 'renderer');
const dataDirectory = policy.portableDataDirectory({ packaged: app.isPackaged, executable: process.execPath, project: __dirname });
let window;

function startupError(error) {
  console.error(error);
  dialog.showErrorBox('PUBG 测距无法启动', '请将完整压缩包解压到可写文件夹后再运行。\n程序文件和地图必须保持完整。\n\n' + error.message);
  app.quit();
}

try {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.mkdirSync(path.join(dataDirectory, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dataDirectory, 'crashdumps'), { recursive: true });
  app.setPath('userData', dataDirectory);
  app.setPath('sessionData', dataDirectory);
  app.setPath('crashDumps', path.join(dataDirectory, 'crashdumps'));
  app.setAppLogsPath(path.join(dataDirectory, 'logs'));
} catch (error) { startupError(error); }

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (app.isReady()) session.defaultSession.flushStorageData(); });

  app.whenReady().then(async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'desktop-bundle.json'), 'utf8'));
    policy.verifyBundleIntegrity(directory, manifest);
    if (manifest.maps.length !== 6) throw new Error('内置地图不完整');
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    protocol.handle('pubgmap', async request => {
      try {
        if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
        const file = policy.resolveLocalFile(request.url, directory);
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', policy.contentSecurityPolicy);
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Local resource not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    });

    window = new BrowserWindow({
      ...policy.windowBounds(screen.getPrimaryDisplay().workAreaSize),
      title: 'PUBG 迫击炮测距',
      backgroundColor: '#101719',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { ...policy.webPreferences },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; });
    await window.loadURL('pubgmap://app/index.html');
  }).catch(startupError);
}
