/* ==========================================================================
   MakaRapi — PWA Registration & Install App Prompt (Komputer & HP)
   ========================================================================== */

(() => {
  'use strict';

  let deferredInstallPrompt = null;

  function isSecureOrLocalhost() {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    return proto === 'https:' || host === 'localhost' || host === '127.0.0.1';
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !isSecureOrLocalhost()) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        // Abaikan bila dijalankan lewat file:// atau lingkungan tanpa SW
      });
    });
  }

  function bindInstallButton() {
    const btn = document.getElementById('btn-install-pwa');
    if (!btn) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      btn.classList.remove('hidden');
      btn.classList.add('inline-flex');
    });

    btn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch {
        // Abaikan pembatalan
      }
      deferredInstallPrompt = null;
      btn.classList.add('hidden');
      btn.classList.remove('inline-flex');
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      btn.classList.add('hidden');
      btn.classList.remove('inline-flex');
    });
  }

  registerServiceWorker();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindInstallButton);
  } else {
    bindInstallButton();
  }
})();
