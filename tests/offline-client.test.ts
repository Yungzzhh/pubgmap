import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareOffline } from '../src/offline.ts';

test('断网更新注册失败时，仍能识别已安装且缓存完整的 Service Worker', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const states: string[] = [];
  const active = { postMessage: (_message: any, ports: MessagePort[]) => { ports[0].postMessage({ type: 'CACHE_STATUS', ready: true }); ports[0].close(); } };
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
