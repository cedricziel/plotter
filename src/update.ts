import type { App } from './app';
import { t } from './i18n';
import { toast } from './ui/dom';

const CHECK_MS = 60 * 60 * 1000;

document.documentElement.dataset.version = __APP_VERSION__;
document.documentElement.dataset.build = __BUILD_ID__;

/** True while a reload would lose something the user is doing right now. */
function busy(app: App): boolean {
  if (app.anchor?.armed || app.alarmReason || app.recording) return true;
  if (app.settings.activeRouteId && app.progress && !app.progress.finished) return true;
  const a = document.activeElement;
  return !!a?.closest('#sheet') && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement);
}

/** Check for a new service worker regularly and switch to it without user action. */
export function initUpdates(app: App): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // First install also fires controllerchange (clientsClaim); only an upgrade needs a reload.
  let upgrade = !!navigator.serviceWorker.controller;
  let reloading = false;
  let pending = false;

  const reload = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  // Registered by hand: the plugin's register helper reloads on its own, ignoring `busy`.
  const activate = (w: ServiceWorker) => w.postMessage({ type: 'SKIP_WAITING' });
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      if (reg.waiting && upgrade) activate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state !== 'installed') return;
          if (navigator.serviceWorker.controller) activate(w);
          else toast(t('toast.readyOffline'));
        });
      });
      const check = () => void reg.update().catch(() => {});
      setInterval(check, CHECK_MS);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch(() => {});

  // Apply a deferred update as soon as nothing is in progress any more.
  const applyIfIdle = () => {
    if (pending && !busy(app)) reload();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') applyIfIdle();
  });
  document.addEventListener('focusout', () => setTimeout(applyIfIdle, 0));
  app.subscribe(applyIfIdle);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!upgrade) {
      upgrade = true;
      return;
    }
    if (reloading || pending) return;
    if (busy(app)) {
      pending = true;
      toast(t('toast.updateReady'), 120_000, reload);
    } else reload();
  });
}
