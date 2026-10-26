export type OfflineStatus = 'preparing' | 'ready' | 'failed' | 'unsupported' | 'bundled';

export async function prepareOffline(onStatus: (status: OfflineStatus) => void, repair = false, mode: 'web' | 'desktop' = 'web'): Promise<void> {
  if (mode === 'desktop') { onStatus('bundled'); return; }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { onStatus('unsupported'); return; }
  onStatus('preparing');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const existing = await navigator.serviceWorker.getRegistration('./');
    const registration = !navigator.onLine && existing?.active ? existing : await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(error => {
      if (existing?.active) return existing;
      throw error;
    });
    let checking = false;
    const check = () => {
      const worker = registration.active;
      if (!worker || checking) return;
      checking = true;
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        if (event.data?.type !== 'CACHE_STATUS') return;
        clearTimeout(timeout);
        checking = false;
        onStatus(event.data.ready ? 'ready' : 'failed');
        channel.port1.close();
      };
      worker.postMessage({ type: repair ? 'CACHE_REPAIR' : 'CACHE_STATUS' }, [channel.port2]);
      repair = false;
    };
    if (registration.active) check();
    navigator.serviceWorker.addEventListener('controllerchange', check);
    const watch = (worker: ServiceWorker | null) => worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated') check();
      else if (worker.state === 'redundant' && !registration.active) { clearTimeout(timeout); onStatus('failed'); }
    });
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    timeout = setTimeout(() => { if (registration.active) check(); else onStatus('failed'); }, 120_000);
    await navigator.serviceWorker.ready;
    check();
  } catch { clearTimeout(timeout); onStatus('failed'); }
}
