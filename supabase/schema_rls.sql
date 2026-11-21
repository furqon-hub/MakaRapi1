-- ============================================================================
-- MakaRapi — Skema Database Supabase BaaS + Row Level Security (RLS)
-- Jalankan seluruh skrip ini pada Supabase Dashboard -> SQL Editor -> New Query
-- Standar Keamanan: OWASP API Top 10 (BOLA / Broken Object Level Authorization)
-- Setiap baris hanya dapat dibaca, dibuat, diubah, dan dihapus oleh pemiliknya
-- berdasarkan auth.uid() = user_id.
-- ============================================================================

-- 1. Tabel Profil Pedoman Kampus per Pengguna
CREATE TABLE IF NOT EXISTS public.user_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  institution TEXT DEFAULT '',
  description TEXT DEFAULT '',
  rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_guidelines_user_updated
  ON public.user_guidelines (user_id, updated_at DESC);

-- 2. Tabel Draft Makalah Cloud (Sinkronisasi Lintas Komputer & Android App)
CREATE TABLE IF NOT EXISTS public.paper_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Draft Makalah Tanpa Judul',
  paper_size TEXT NOT NULL DEFAULT 'A4',
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  readiness_score INTEGER NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_drafts_user_updated
  ON public.paper_drafts (user_id, updated_at DESC);

-- 3. Trigger otomatis memperbarui kolom updated_at
CREATE OR REPLACE FUNCTION public.makarapi_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_guidelines_updated ON public.user_guidelines;
CREATE TRIGGER trg_user_guidelines_updated
  BEFORE UPDATE ON public.user_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.makarapi_set_updated_at();

DROP TRIGGER IF EXISTS trg_paper_drafts_updated ON public.paper_drafts;
CREATE TRIGGER trg_paper_drafts_updated
  BEFORE UPDATE ON public.paper_drafts
  FOR EACH ROW EXECUTE FUNCTION public.makarapi_set_updated_at();

-- 4. Aktifkan Row Level Security (RLS) secara ketat pada seluruh tabel
ALTER TABLE public.user_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_drafts ENABLE ROW LEVEL SECURITY;

-- Kebijakan RLS untuk public.user_guidelines
DROP POLICY IF EXISTS "user_guidelines_select_own" ON public.user_guidelines;
CREATE POLICY "user_guidelines_select_own"
  ON public.user_guidelines FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_guidelines_insert_own" ON public.user_guidelines;
CREATE POLICY "user_guidelines_insert_own"
  ON public.user_guidelines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_guidelines_update_own" ON public.user_guidelines;
CREATE POLICY "user_guidelines_update_own"
  ON public.user_guidelines FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_guidelines_delete_own" ON public.user_guidelines;
CREATE POLICY "user_guidelines_delete_own"
  ON public.user_guidelines FOR DELETE
  USING (auth.uid() = user_id);

-- Kebijakan RLS untuk public.paper_drafts
DROP POLICY IF EXISTS "paper_drafts_select_own" ON public.paper_drafts;
CREATE POLICY "paper_drafts_select_own"
  ON public.paper_drafts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "paper_drafts_insert_own" ON public.paper_drafts;
CREATE POLICY "paper_drafts_insert_own"
  ON public.paper_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "paper_drafts_update_own" ON public.paper_drafts;
CREATE POLICY "paper_drafts_update_own"
  ON public.paper_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "paper_drafts_delete_own" ON public.paper_drafts;
CREATE POLICY "paper_drafts_delete_own"
  ON public.paper_drafts FOR DELETE
  USING (auth.uid() = user_id);
