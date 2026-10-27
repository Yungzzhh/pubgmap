import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareOffline } from '../src/offline.ts';

test('桌面应用首次离线直接使用内置资源，不访问 Service Worker 或网络', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { throw new Error('Desktop must not access browser cache APIs'); } });
  const states: string[] = [];
  try {
    await prepareOffline(status => states.push(status), false, 'desktop');
    assert.deepEqual(states, ['bundled']);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('断网更新注册失败时，仍能识别已安装且缓存完整的 Service Worker', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const states: string[] = [];
  const active = { postMessage: (message: any, ports: MessagePort[]) => { ports[0].postMessage({ type: 'CACHE_STATUS', ready: true, entryUrl: message.entryUrl, pageCached: true }); ports[0].close(); } };
  const registration = { active, addEventListener: () => {} };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    onLine: false,
    serviceWorker: {
      getRegistration: async () => registration,
      register: async () => { throw new Error('Offline script update failed'); },
      ready: Promise.resolve(registration),
      addEventListener: () => {},
    },
  } });
  try {
    await prepareOffline(status => states.push(status));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(states.at(-1), 'ready');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('旧页面在新版完整缓存接管后提示更新，不主动刷新；新页面不被要求重复刷新', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, () => void>();
  const container: any = { controller: {}, getRegistration: async () => registration, register: async () => registration, addEventListener: (type: string, fn: () => void) => listeners.set(type, fn), removeEventListener: () => {} };
  let pageCached = true;
  const worker = () => ({ postMessage: (message: any, ports: MessagePort[]) => { ports[0].postMessage({ type: 'CACHE_STATUS', ready: true, entryUrl: message.entryUrl, pageCached }); ports[0].close(); } });
  let updates = 0;
  const registration: any = { active: worker(), addEventListener: () => {}, update: async () => { updates++; } };
  container.ready = Promise.resolve(registration);
  const statuses: string[] = [];
  let notices = 0, reloads = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, location: { reload: () => reloads++ }, addEventListener: () => {}, removeEventListener: () => {} } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, serviceWorker: container } });
  try {
    await prepareOffline(status => statuses.push(status), false, 'web', () => notices++);
    assert.equal(updates, 1, '主动检查需要强制请求 Service Worker 更新');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(statuses.at(-1), 'ready');
    assert.equal(notices, 0);
    pageCached = false;
    registration.active = worker(); container.controller = registration.active;
    listeners.get('controllerchange')!();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(notices, 1);
    assert.equal(statuses.at(-1), 'ready');
    listeners.get('controllerchange')!();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(notices, 1);
    assert.equal(reloads, 0);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('旧 worker 只报告自身缓存完整时，不把网络加载的新页面误报为离线就绪', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const registration = { active: { postMessage: (_message: any, ports: MessagePort[]) => { ports[0].postMessage({ type: 'CACHE_STATUS', ready: true }); ports[0].close(); } }, addEventListener: () => {}, update: async () => {} };
  const statuses: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, addEventListener: () => {}, removeEventListener: () => {} } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, serviceWorker: { getRegistration: async () => registration, register: async () => registration, ready: Promise.resolve(registration), addEventListener: () => {}, removeEventListener: () => {} } } });
  try {
    await prepareOffline(status => statuses.push(status));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.notEqual(statuses.at(-1), 'ready');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
