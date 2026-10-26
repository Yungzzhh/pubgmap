const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const webPreferences = Object.freeze({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false });
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'; worker-src 'none'";

function resolveLocalFile(input, directory, paths = path) {
  const url = new URL(input);
  if (url.protocol !== 'pubgmap:' || url.hostname !== 'app' || url.port || url.username || url.password) throw new Error('Unsupported app URL');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '..' || segment === '.')) throw new Error('Invalid resource path');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative !== 'index.html' && !['assets/', 'maps/', 'icons/'].some(prefix => relative.startsWith(prefix))) throw new Error('Resource is outside the renderer');
  const target = paths.resolve(directory, relative);
  const difference = paths.relative(directory, target);
  if (difference === '..' || difference.startsWith('..' + paths.sep) || paths.isAbsolute(difference)) throw new Error('Resource escaped its directory');
  return target;
}

function portableDataDirectory({ packaged, executable, project }, paths = path) {
  return packaged ? paths.join(paths.dirname(executable), 'data') : paths.join(project, '.data');
}

function isRemoteRequest(url) { return /^(https?|wss?):/i.test(url); }

function windowBounds(area) {
  const width = Math.max(320, Math.min(1320, area.width - 32));
  const height = Math.max(320, Math.min(900, area.height - 32));
  return { width, height, minWidth: Math.min(900, width), minHeight: Math.min(620, height) };
}

function verifyBundleIntegrity(directory, manifest) {
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Missing desktop asset manifest');
  for (const asset of manifest.assets) {
    const file = resolveLocalFile('pubgmap://app/' + asset.path, directory);
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (actual !== asset.sha256) throw new Error('Corrupt desktop asset: ' + asset.path);
  }
}

module.exports = { webPreferences, contentSecurityPolicy, resolveLocalFile, portableDataDirectory, isRemoteRequest, windowBounds, verifyBundleIntegrity };
