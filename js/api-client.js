/* ==========================================================================
   MakaRapi — Hybrid API Client (Auto-detect FastAPI Python + Fallback JS)
   Menghubungkan frontend ke backend Python (FastAPI + python-docx) secara
   otomatis bila server berjalan di origin yang sama atau http://127.0.0.1:8000,
   serta melakukan fallback mulus ke pemrosesan lokal browser bila offline.
   ========================================================================== */
(() => {
  'use strict';

  const state = {
    checked: false,
    online: false,
    baseUrl: '',
    engine: 'browser-js',
    pdfEngine: 'browser-print',
  };

  async function probeUrl(baseUrl, timeoutMs = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.status === 'ok') {
        return {
          baseUrl,
          engine: data.engine || 'python-docx',
          pdfEngine: data.pdfEngine || 'browser-print',
        };
      }
      return null;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  async function detectBackend(force = false) {
    if (state.checked && !force) return { ...state };

    const candidates = [];
    const addCandidate = (u) => {
      if (!candidates.includes(u)) candidates.push(u);
    };

    const isCapacitorNative = Boolean(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
    const isLocalHostDev =
      !isCapacitorNative &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

    let customApi = '';
    try {
      customApi = String(localStorage.getItem('makarapi_api_base_url_v1') || window.MAKARAPI_API_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
    } catch {
      customApi = String(window.MAKARAPI_API_BASE_URL || '').trim().replace(/\/+$/, '');
    }

    if (isCapacitorNative) {
      // Di aplikasi Android APK: langsung pakai server HTTPS produksi
      if (customApi && /^https?:\/\//i.test(customApi)) addCandidate(customApi);
    } else if (isLocalHostDev) {
      // Di pengembangan lokal: prioritaskan server lokal 127.0.0.1:8000, lalu fallback ke HTTPS produksi
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') addCandidate('');
      addCandidate('http://127.0.0.1:8000');
      if (customApi && /^https?:\/\//i.test(customApi)) addCandidate(customApi);
    } else {
      // Di web online HTTPS (Vercel): same-origin dulu, lalu customApi bila berbeda
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') addCandidate('');
      if (customApi && /^https?:\/\//i.test(customApi) && customApi !== window.location.origin) {
        addCandidate(customApi);
      }
    }

    for (const base of candidates) {
      const isLocalLoopback = base.startsWith('http://127.0.0.1') || base.startsWith('http://localhost');
      const hit = await probeUrl(base, isLocalLoopback ? 1500 : 8000);
      if (hit) {
        state.checked = true;
        state.online = true;
        state.baseUrl = hit.baseUrl;
        state.engine = hit.engine;
        state.pdfEngine = hit.pdfEngine;
        return { ...state };
      }
    }

    state.checked = true;
    state.online = false;
    state.baseUrl = '';
    state.engine = 'browser-js';
    state.pdfEngine = 'browser-print';
    return { ...state };
  }

  async function parseDocx(file) {
    const info = await detectBackend();
    if (!info.online) return null;

    const form = new FormData();
    form.append('file', file, file.name);
    const res = await fetch(`${info.baseUrl}/api/parse-docx`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      let detail = 'Gagal memproses berkas .docx di server Python.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    return await res.json();
  }

  async function parseGuideline(file) {
    const info = await detectBackend();
    if (!info.online) return null;

    const form = new FormData();
    form.append('file', file, file.name);
    const res = await fetch(`${info.baseUrl}/api/parse-guideline`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      let detail = 'Gagal memproses berkas pedoman di server Python.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    return await res.json();
  }

  async function exportDocx(payload) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/export-docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = 'Gagal membangun file .docx di server Python.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    return await res.blob();
  }

  async function auditCitations(payload) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/audit-citations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function auditReadiness(payload) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/audit-readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function listGuidelines() {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/guidelines`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  }

  async function saveGuideline(payload) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/guidelines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = 'Gagal menyimpan profil pedoman ke database.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    const data = await res.json();
    return data.item || null;
  }

  async function deleteGuideline(profileId) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/guidelines/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      let detail = 'Gagal menghapus profil pedoman.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    return await res.json();
  }

  async function exportPdf(payload) {
    const info = await detectBackend();
    if (!info.online || info.pdfEngine !== 'libreoffice') return null;

    const res = await fetch(`${info.baseUrl}/api/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 501) return null;
    if (!res.ok) {
      let detail = 'Gagal mengonversi PDF di server Python.';
      try {
        const err = await res.json();
        if (err && err.detail) detail = err.detail;
      } catch {
        // Abaikan
      }
      throw new Error(detail);
    }
    return await res.blob();
  }

  async function lintAcademic(payload) {
    const info = await detectBackend();
    if (!info.online) return null;

    const res = await fetch(`${info.baseUrl}/api/lint-academic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  window.MakaRapiAPI = {
    detectBackend,
    parseDocx,
    parseGuideline,
    exportDocx,
    exportPdf,
    auditCitations,
    auditReadiness,
    lintAcademic,
    listGuidelines,
    saveGuideline,
    deleteGuideline,
    getStatus: () => ({ ...state }),
  };
})();
