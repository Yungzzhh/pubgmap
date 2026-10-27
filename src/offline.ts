export type OfflineStatus = 'preparing' | 'ready' | 'failed' | 'unsupported' | 'bundled';

let disposePrevious = () => {};

export async function prepareOffline(onStatus: (status: OfflineStatus) => void, repair = false, mode: 'web' | 'desktop' = 'web', onUpdate: () => void = () => {}): Promise<void> {
  if (mode === 'desktop') { onStatus('bundled'); return; }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { onStatus('unsupported'); return; }
  disposePrevious();
  onStatus('preparing');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, callback: () => void) => {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener?.(type, callback));
  };
  disposePrevious = () => { disposed = true; clearTimeout(timeout); cleanups.forEach(cleanup => cleanup()); };
  try {
    const container = navigator.serviceWorker;
    const initialController = container.controller;
    const existing = await container.getRegistration('./');
    const registration = !navigator.onLine && existing?.active ? existing : await container.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(error => {
      if (existing?.active) return existing;
      throw error;
    });
    if (navigator.onLine && existing?.active) await registration.update().catch(() => {});
    if (disposed) return;
    let checking: ServiceWorker | null = null;
    let notified = false;
    const entryUrl = import.meta.url;
    const check = () => {
      const worker = registration.active;
      if (disposed || !worker || checking === worker || registration.installing) return;
      checking = worker;
      const channel = new MessageChannel();
      cleanups.push(() => channel.port1.close());
      channel.port1.onmessage = event => {
        if (event.data?.type !== 'CACHE_STATUS') return;
        channel.port1.close();
        if (checking === worker) checking = null;
        if (disposed) return;
        if (worker !== registration.active) { check(); return; }
        clearTimeout(timeout);
        const changed = !!initialController && !!container.controller && container.controller !== initialController;
        const compatible = event.data.entryUrl === entryUrl && (event.data.pageCached === true || changed);
        onStatus(event.data.ready && compatible ? 'ready' : 'failed');
        if (event.data.ready && compatible && changed && !event.data.pageCached && !notified) { notified = true; onUpdate(); }
      };
      try { worker.postMessage({ type: repair ? 'CACHE_REPAIR' : 'CACHE_STATUS', entryUrl }, [channel.port2]); }
      catch { checking = null; channel.port1.close(); onStatus('failed'); }
      repair = false;
    };
    listen(container, 'controllerchange', check);
    const watched = new Set<ServiceWorker>();
    const watch = (worker: ServiceWorker | null) => {
      if (!worker || watched.has(worker)) return;
      watched.add(worker);
      listen(worker, 'statechange', () => {
        if (worker.state === 'activated') check();
        else if (worker.state === 'redundant') { if (registration.active) check(); else { clearTimeout(timeout); onStatus('failed'); } }
      });
    };
    watch(registration.installing);
    listen(registration, 'updatefound', () => { onStatus('preparing'); watch(registration.installing); });
    timeout = setTimeout(() => { if (!disposed) onStatus('failed'); }, 120_000);
    check();
    await container.ready;
    check();
  } catch { clearTimeout(timeout); if (!disposed) onStatus('failed'); }
}
