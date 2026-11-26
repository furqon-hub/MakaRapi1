/* ==========================================================================
   MakaRapi — Konfigurasi Opsional Supabase BaaS & Production API URL
   CATATAN KEAMANAN OWASP:
   - Hanya masukkan PUBLIC ANON KEY di sini (JANGAN PERNAH menaruh service_role key!).
   - Keamanan & isolasi data antar pengguna dijamin oleh kebijakan RLS di Supabase
     (lihat supabase/schema_rls.sql).
   - Anda juga bisa mengisi URL & Anon Key langsung lewat tombol "Akun" di Editor.
   ========================================================================== */

window.MAKARAPI_SUPABASE_CONFIG = {
  url: '',      // Contoh: 'https://xxxxxxxxxxxx.supabase.co'
  anonKey: '',  // Public anon key dari Project Settings -> API
};

// URL HTTPS backend FastAPI produksi (Vercel) agar aplikasi Android Capacitor (.apk)
// otomatis terhubung ke server Python python-docx + OWASP secara online.
window.MAKARAPI_API_BASE_URL = 'https://makarapi.vercel.app';
