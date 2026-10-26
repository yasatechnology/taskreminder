-- ============================================================
-- FILE: supabase/migrations/001_initial_schema.sql
-- PROYEK: TaskRemind – Sistem Manajemen & Pengingat Tugas
-- DESKRIPSI: DDL lengkap termasuk tabel, RLS, Trigger,
--            dan konfigurasi pg_cron untuk pengingat H-1.
-- ============================================================

-- ============================================================
-- BAGIAN 1: EKSTENSI YANG DIBUTUHKAN
-- ============================================================

-- Aktifkan ekstensi pg_cron untuk penjadwalan cron job
-- (Ekstensi ini harus diaktifkan oleh Supabase di project Anda terlebih dahulu
--  melalui Database > Extensions di Supabase Dashboard)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Aktifkan ekstensi pg_net untuk membuat HTTP request dari dalam PostgreSQL
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- BAGIAN 2: TABEL public.profiles
-- ============================================================
-- Menyimpan data profil pengguna yang berelasi 1:1 dengan auth.users.
-- Baris dibuat otomatis saat pengguna baru mendaftar (via DB Trigger).

CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID            PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name                VARCHAR(100),
    email               VARCHAR(150)    UNIQUE,
    telegram_chat_id    VARCHAR(50)     UNIQUE,
    telegram_username   VARCHAR(100),
    connect_token       VARCHAR(64),
    token_expires_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Index untuk pencarian cepat berdasarkan connect_token (digunakan oleh Edge Function telegram-webhook)
CREATE INDEX IF NOT EXISTS idx_profiles_connect_token
    ON public.profiles (connect_token)
    WHERE connect_token IS NOT NULL;

-- Index untuk pencarian berdasarkan telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
    ON public.profiles (telegram_chat_id)
    WHERE telegram_chat_id IS NOT NULL;

COMMENT ON TABLE public.profiles IS 'Profil pengguna TaskRemind, berelasi 1:1 dengan auth.users.';
COMMENT ON COLUMN public.profiles.connect_token IS 'Token sementara (one-time) untuk menghubungkan akun Telegram. Berlaku 10 menit.';
COMMENT ON COLUMN public.profiles.token_expires_at IS 'Waktu kedaluwarsa connect_token. Token invalid jika NOW() > token_expires_at.';
COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Chat ID Telegram pengguna. NULL berarti belum terhubung.';

-- ============================================================
-- BAGIAN 3: TABEL public.tasks
-- ============================================================
-- Menyimpan daftar tugas milik pengguna beserta status pengingat.

CREATE TABLE IF NOT EXISTS public.tasks (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title               VARCHAR(200)    NOT NULL,
    description         TEXT,
    priority            TEXT            NOT NULL DEFAULT 'medium'
                                        CHECK (priority IN ('low', 'medium', 'high')),
    deadline            TIMESTAMPTZ     NOT NULL,
    is_completed        BOOLEAN         NOT NULL DEFAULT FALSE,
    reminder_sent       BOOLEAN         NOT NULL DEFAULT FALSE,
    reminder_sent_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Index untuk query H-1 (digunakan oleh Edge Function send-reminders)
CREATE INDEX IF NOT EXISTS idx_tasks_deadline
    ON public.tasks (deadline);

CREATE INDEX IF NOT EXISTS idx_tasks_is_completed
    ON public.tasks (is_completed);

CREATE INDEX IF NOT EXISTS idx_tasks_reminder_sent
    ON public.tasks (reminder_sent);

-- Index komposit untuk query H-1 yang efisien
CREATE INDEX IF NOT EXISTS idx_tasks_h1_query
    ON public.tasks (is_completed, reminder_sent, deadline)
    WHERE is_completed = FALSE AND reminder_sent = FALSE;

COMMENT ON TABLE public.tasks IS 'Daftar tugas pengguna TaskRemind dengan status pengingat Telegram H-1.';
COMMENT ON COLUMN public.tasks.reminder_sent IS 'TRUE jika pengingat H-1 via Telegram sudah dikirim. Direset ke FALSE jika deadline diubah ke masa depan.';
COMMENT ON COLUMN public.tasks.deadline IS 'Batas waktu pengumpulan tugas, disimpan dalam TIMESTAMPTZ (UTC).';

-- ============================================================
-- BAGIAN 4: ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Memastikan setiap pengguna hanya dapat mengakses data miliknya sendiri.

-- ── 4.1 RLS untuk tabel profiles ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Pengguna dapat membaca profil miliknya sendiri
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Pengguna dapat mengupdate profil miliknya sendiri
-- (untuk update telegram_chat_id, connect_token, dll.)
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Pengguna dapat menginsert profil miliknya sendiri (digunakan oleh trigger)
-- Trigger berjalan sebagai SECURITY DEFINER, sehingga memintas RLS.
-- Policy ini sebagai fallback keamanan tambahan.
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ── 4.2 RLS untuk tabel tasks ──
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Pengguna hanya dapat SELECT tugas miliknya
CREATE POLICY "tasks_select_own"
    ON public.tasks
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Pengguna hanya dapat INSERT tugas untuk dirinya sendiri
CREATE POLICY "tasks_insert_own"
    ON public.tasks
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Pengguna hanya dapat UPDATE tugas miliknya
CREATE POLICY "tasks_update_own"
    ON public.tasks
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Pengguna hanya dapat DELETE tugas miliknya
CREATE POLICY "tasks_delete_own"
    ON public.tasks
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- BAGIAN 5: DATABASE TRIGGERS & FUNGSI
-- ============================================================

-- ── 5.1 Fungsi & Trigger: Auto-Create Profile saat Registrasi ──
-- Trigger ini dipanggil SETELAH pengguna baru muncul di auth.users.
-- Mengisi tabel public.profiles secara otomatis menggunakan data dari
-- raw_user_meta_data (yang dikirim saat signUp dari frontend React).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                          -- Berjalan dengan hak superuser, memintas RLS
SET search_path = public                  -- Keamanan: batasi search_path
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        -- Ambil nama dari raw_user_meta_data yang dikirim saat signUp
        -- (diisi oleh frontend React: options.data.name)
        COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;     -- Idempoten: abaikan jika profil sudah ada
    RETURN NEW;
END;
$$;

-- Trigger yang memanggil fungsi di atas setelah INSERT ke auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
'Membuat baris profil otomatis di public.profiles saat pengguna baru mendaftar.';

-- ── 5.2 Fungsi & Trigger: Auto-Reset Reminder saat Deadline Diubah ──
-- Trigger ini dipanggil SEBELUM UPDATE pada tabel tasks.
-- Mereset reminder_sent ke FALSE jika pengguna mengundur deadline ke masa depan,
-- sehingga pengguna tetap mendapat notifikasi H-1 pada jadwal baru.

CREATE OR REPLACE FUNCTION public.reset_reminder_on_deadline_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Periksa apakah deadline BENAR-BENAR berubah DAN deadline baru di masa depan
    IF NEW.deadline IS DISTINCT FROM OLD.deadline
       AND NEW.deadline > NOW()
    THEN
        -- Reset status pengingat agar Edge Function cron akan mengirim ulang
        NEW.reminder_sent     := FALSE;
        NEW.reminder_sent_at  := NULL;
    END IF;

    -- Auto-update kolom updated_at
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$;

-- Trigger BEFORE UPDATE pada tabel tasks
DROP TRIGGER IF EXISTS on_task_deadline_updated ON public.tasks;
CREATE TRIGGER on_task_deadline_updated
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.reset_reminder_on_deadline_change();

COMMENT ON FUNCTION public.reset_reminder_on_deadline_change() IS
'Mereset reminder_sent=FALSE jika pengguna mengubah deadline ke waktu masa depan, memastikan notifikasi H-1 tetap dikirim.';

-- ── 5.3 Fungsi: Auto-update updated_at pada tabel profiles ──
-- Karena tabel profiles tidak memiliki trigger yang sama,
-- kita buat satu fungsi generik dan pasang triggernya.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- BAGIAN 6: KONFIGURASI pg_cron (PANGGIL SETELAH EKSTENSI AKTIF)
-- ============================================================
-- Blok SQL ini perlu dijalankan MANUAL setelah ekstensi pg_cron
-- diaktifkan di Supabase Dashboard (Database > Extensions > pg_cron).
--
-- Cara menjalankan: Salin blok di bawah dan jalankan di
--   Supabase Dashboard > SQL Editor
-- atau via psql setelah ekstensi aktif.
--
-- GANTI placeholder berikut sebelum menjalankan:
--   <YOUR_PROJECT_REF>   → Project Reference ID Supabase Anda
--                          (temukan di Settings > General)
--   <SERVICE_ROLE_KEY>   → Service Role Key Supabase Anda
--                          (temukan di Settings > API > service_role)

-- !! BAGIAN INI DIJALANKAN TERPISAH NANTI (setelah pg_cron aktif) !!
-- !! JANGAN dijalankan sekarang bersamaan dengan migrasi utama     !!
--
-- Salin query di bawah ini dan jalankan di SQL Editor secara terpisah
-- setelah mengaktifkan ekstensi pg_cron dan pg_net di Supabase Dashboard.
-- Ganti <YOUR_PROJECT_REF> dan <SERVICE_ROLE_KEY_VALUE> dengan nilai asli Anda.
--
-- CATATAN: Nama secret di Supabase adalah SERVICE_ROLE_KEY (tanpa prefix SUPABASE_)
--
-- SELECT cron.schedule(
--     'send-h1-telegram-reminders',
--     '*/15 * * * *',
--     $$
--     SELECT net.http_post(
--         url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--         headers := jsonb_build_object(
--             'Content-Type',  'application/json',
--             'Authorization', 'Bearer <SERVICE_ROLE_KEY_VALUE>'
--         ),
--         body    := '{}'::jsonb
--     );
--     $$
-- );
--
-- Verifikasi cron job berhasil dibuat:
-- SELECT * FROM cron.job WHERE jobname = 'send-h1-telegram-reminders';
--
-- Untuk menghapus cron job (jika diperlukan):
-- SELECT cron.unschedule('send-h1-telegram-reminders');

-- ============================================================
-- SELESAI
-- ============================================================
-- Ringkasan apa yang dibuat:
-- ✅ Tabel public.profiles  (dengan index)
-- ✅ Tabel public.tasks     (dengan index komposit untuk query H-1)
-- ✅ RLS policies untuk profiles (SELECT, INSERT, UPDATE)
-- ✅ RLS policies untuk tasks (SELECT, INSERT, UPDATE, DELETE)
-- ✅ Trigger on_auth_user_created → handle_new_user()
-- ✅ Trigger on_task_deadline_updated → reset_reminder_on_deadline_change()
-- ✅ Trigger on_profiles_updated → handle_updated_at()
-- ✅ Konfigurasi pg_cron (dikomentari, jalankan manual setelah ekstensi aktif)
-- ============================================================
