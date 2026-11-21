/* ==========================================================================
   MakaRapi — Supabase BaaS Cloud Sync & Auth Client (Dengan RLS)
   Menangani autentikasi mahasiswa, simpan/muat draft makalah lintas perangkat
   (Komputer <-> Android App), serta sinkronisasi profil pedoman kampus.
   ========================================================================== */

(() => {
  'use strict';

  const CONFIG_STORAGE_KEY = 'makarapi_supabase_cfg_v1';
  const API_URL_STORAGE_KEY = 'makarapi_api_base_url_v1';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  let sbClient = null;
  let sdkLoadPromise = null;

  function getSavedConfig() {
    let localCfg = { url: '', anonKey: '' };
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localCfg = {
            url: String(parsed.url || '').trim(),
            anonKey: String(parsed.anonKey || '').trim(),
          };
        }
      }
    } catch {
      // Abaikan
    }
    const winCfg = window.MAKARAPI_SUPABASE_CONFIG || {};
    return {
      url: (localCfg.url || String(winCfg.url || '').trim()).replace(/\/+$/, ''),
      anonKey: localCfg.anonKey || String(winCfg.anonKey || '').trim(),
    };
  }

  function saveConfig({ url, anonKey, apiBaseUrl }) {
    const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
    const cleanKey = String(anonKey || '').trim();
    if (cleanUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanUrl) && !/^https?:\/\//i.test(cleanUrl)) {
      throw new Error('URL Supabase harus diawali https:// (contoh: https://xxx.supabase.co).');
    }
    if (cleanKey && cleanKey.length < 20) {
      throw new Error('Supabase Anon Key tampak tidak valid.');
    }
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));

    if (apiBaseUrl !== undefined) {
      const cleanApi = String(apiBaseUrl || '').trim().replace(/\/+$/, '');
      if (cleanApi) {
        localStorage.setItem(API_URL_STORAGE_KEY, cleanApi);
      } else {
        localStorage.removeItem(API_URL_STORAGE_KEY);
      }
    }
    sbClient = null;
  }

  function isConfigured() {
    const cfg = getSavedConfig();
    return Boolean(cfg.url && cfg.anonKey);
  }

  function loadSupabaseSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve(window.supabase);
    }
    if (sdkLoadPromise) return sdkLoadPromise;
    sdkLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.async = true;
      script.onload = () => {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          resolve(window.supabase);
        } else {
          reject(new Error('SDK Supabase gagal diinisialisasi.'));
        }
      };
      script.onerror = () => reject(new Error('Gagal memuat SDK Supabase (periksa koneksi internet).'));
      document.head.appendChild(script);
    });
    return sdkLoadPromise;
  }

  async function getClient() {
    const cfg = getSavedConfig();
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Konfigurasi Supabase belum diisi.');
    }
    if (sbClient) return sbClient;
    const sdk = await loadSupabaseSdk();
    sbClient = sdk.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return sbClient;
  }

  async function getSession() {
    if (!isConfigured()) return null;
    try {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      return data?.session || null;
    } catch {
      return null;
    }
  }

  async function signIn(email, password) {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || ''),
    });
    if (error) throw new Error(error.message || 'Gagal masuk ke akun.');
    return data.session;
  }

  async function signUp(email, password) {
    if (String(password || '').length < 8) {
      throw new Error('Kata sandi minimal 8 karakter (standar keamanan OWASP).');
    }
    const client = await getClient();
    const { data, error } = await client.auth.signUp({
      email: String(email || '').trim(),
      password: String(password || ''),
    });
    if (error) throw new Error(error.message || 'Gagal mendaftar akun baru.');
    return data;
  }

  async function signOut() {
    if (!isConfigured()) return;
    const client = await getClient();
    await client.auth.signOut();
  }

  async function saveDraftToCloud(appState, readinessScore = 0) {
    const client = await getClient();
    const { data: authData } = await client.auth.getUser();
    const user = authData?.user;
    if (!user) throw new Error('Silakan masuk akun terlebih dahulu.');

    const title = String(appState?.cover?.title || 'Draft Makalah Tanpa Judul').trim().slice(0, 180);
    const words = String(appState?.content || '').trim().split(/\s+/).filter(Boolean).length;
    // Pangkas gambar base64 sangat besar (>250 KB) agar payload JSONB tetap ringan
    const slimImages = {};
    for (const [k, v] of Object.entries(appState?.images || {})) {
      if (typeof v === 'string' && v.length <= 250000) slimImages[k] = v;
    }
    const payload = {
      format: appState.format,
      abstract: appState.abstract,
      cover: { ...appState.cover, logoDataUrl: (appState.cover?.logoDataUrl || '').length <= 200000 ? appState.cover?.logoDataUrl : '' },
      preface: appState.preface,
      content: appState.content,
      citations: appState.citations,
      manualBibliography: appState.manualBibliography,
      images: slimImages,
      guidelineProfile: appState.guidelineProfile || null,
    };

    const { data, error } = await client
      .from('paper_drafts')
      .insert({
        user_id: user.id,
        title,
        paper_size: String(appState?.format?.paperSize || 'A4'),
        word_count: words,
        readiness_score: Math.max(0, Math.min(100, Math.round(Number(readinessScore) || 0))),
        payload_json: payload,
      })
      .select('id, title, paper_size, word_count, readiness_score, updated_at')
      .single();

    if (error) throw new Error(error.message || 'Gagal menyimpan draft ke cloud.');
    return data;
  }

  async function listCloudDrafts() {
    const client = await getClient();
    const { data, error } = await client
      .from('paper_drafts')
      .select('id, title, paper_size, word_count, readiness_score, updated_at, payload_json')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message || 'Gagal memuat daftar draft cloud.');
    return data || [];
  }

  async function deleteCloudDraft(id) {
    const client = await getClient();
    const { error } = await client.from('paper_drafts').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Gagal menghapus draft cloud.');
  }

  async function saveGuidelineToCloud(profile) {
    const client = await getClient();
    const { data: authData } = await client.auth.getUser();
    const user = authData?.user;
    if (!user) throw new Error('Silakan masuk akun terlebih dahulu.');

    const { data, error } = await client
      .from('user_guidelines')
      .insert({
        user_id: user.id,
        name: String(profile.name || 'Pedoman Kampus').trim().slice(0, 120),
        institution: String(profile.institution || '').trim().slice(0, 120),
        description: String(profile.description || '').trim().slice(0, 200),
        rules_json: Array.isArray(profile.rules) ? profile.rules : [],
      })
      .select('id, name, institution, description, rules_json, updated_at')
      .single();
    if (error) throw new Error(error.message || 'Gagal menyimpan pedoman ke cloud.');
    return data;
  }

  async function listCloudGuidelines() {
    const client = await getClient();
    const { data, error } = await client
      .from('user_guidelines')
      .select('id, name, institution, description, rules_json, updated_at')
      .order('updated_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message || 'Gagal memuat pedoman cloud.');
    return data || [];
  }

  window.MakaRapiCloud = {
    getSavedConfig,
    saveConfig,
    isConfigured,
    getSession,
    signIn,
    signUp,
    signOut,
    saveDraftToCloud,
    listCloudDrafts,
    deleteCloudDraft,
    saveGuidelineToCloud,
    listCloudGuidelines,
  };
})();
