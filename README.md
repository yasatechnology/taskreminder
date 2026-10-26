# TaskRemind – Sistem Manajemen & Pengingat Tugas (H-1 Telegram)

Aplikasi web full-stack manajemen tugas yang terintegrasi dengan Bot Telegram untuk pengingat H-1 otomatis. Dibangun dengan **React (Vite) + Tailwind CSS + Supabase**.

---

## 🚀 Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 19 + Vite, Tailwind CSS, Lucide React |
| **Backend/BaaS** | Supabase (PostgreSQL, Auth, Edge Functions, RLS) |
| **Penjadwal** | Supabase `pg_cron` + `pg_net` |
| **Notifikasi** | Telegram Bot API |
| **Runtime Edge** | Deno (TypeScript) |

---

## 📁 Struktur Proyek

```
taskreminder/
├── src/
│   ├── components/
│   │   ├── AuthForm.jsx          # Login & Register
│   │   ├── TelegramBanner.jsx    # Status & koneksi Telegram
│   │   ├── TaskFormModal.jsx     # Modal tambah/edit tugas
│   │   └── TaskList.jsx          # Daftar tugas dengan filter
│   ├── lib/
│   │   └── supabaseClient.js     # Inisialisasi klien Supabase
│   ├── App.jsx                   # Root komponen + state management
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Tailwind CSS + custom styles
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # DDL, RLS, Triggers, pg_cron
│   ├── functions/
│   │   ├── telegram-webhook/
│   │   │   └── index.ts          # Webhook handler Bot Telegram
│   │   └── send-reminders/
│   │       └── index.ts          # Pengirim pengingat H-1 cron
│   └── config.toml               # Konfigurasi Edge Functions
├── .env.example                  # Template variabel lingkungan
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## ⚙️ Setup & Instalasi

### Prasyarat
- Node.js ≥ 18
- Akun [Supabase](https://supabase.com) (gratis)
- Bot Telegram (buat via [@BotFather](https://t.me/BotFather))
- Supabase CLI (opsional, untuk deploy Edge Functions)

---

### Langkah 1: Install Dependensi Frontend

```bash
npm install
```

---

### Langkah 2: Konfigurasi Environment Variables

Salin file template dan isi nilainya:

```bash
cp .env.example .env
```

Edit file `.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_TELEGRAM_BOT_USERNAME=YourBotUsernameBot
```

> **⚠️ PENTING:** `SUPABASE_SERVICE_ROLE_KEY` dan `TELEGRAM_BOT_TOKEN` **JANGAN** diletakkan di file `.env` frontend. Set sebagai Supabase Secret (lihat Langkah 4).

---

### Langkah 3: Setup Database Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → pilih proyek Anda
2. Navigasi ke **SQL Editor**
3. Salin seluruh isi `supabase/migrations/001_initial_schema.sql`
4. Jalankan (klik **Run**)

Ini akan membuat:
- ✅ Tabel `profiles` dan `tasks`
- ✅ Row Level Security (RLS) policies
- ✅ Database Triggers (auto-create profile, auto-reset reminder)

---

### Langkah 4: Set Supabase Edge Function Secrets

```bash
# Install Supabase CLI jika belum ada
npm install -g supabase

# Login ke Supabase
supabase login

# Set secrets (GANTI dengan nilai asli Anda)
supabase secrets set TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

### Langkah 5: Deploy Edge Functions

```bash
# Deploy webhook handler (tanpa JWT verification)
supabase functions deploy telegram-webhook --no-verify-jwt

# Deploy cron reminder sender
supabase functions deploy send-reminders
```

---

### Langkah 6: Daftarkan Webhook ke Telegram

```bash
# Ganti <BOT_TOKEN> dan <PROJECT_REF>
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook"}'
```

---

### Langkah 7: Aktifkan pg_cron (Pengingat Otomatis)

1. Di Supabase Dashboard → **Database** → **Extensions**
2. Cari dan aktifkan **pg_cron** dan **pg_net**
3. Buka **SQL Editor**, salin blok SQL dari bagian akhir `001_initial_schema.sql` (bagian `pg_cron` yang dikomentari)
4. Ganti `<YOUR_PROJECT_REF>` dan `<SERVICE_ROLE_KEY>`, lalu jalankan

---

### Langkah 8: Jalankan Aplikasi

```bash
npm run dev
```

Buka `http://localhost:5173`

---

## 🔄 Alur Kerja Sistem

```
Pengguna daftar/login
    ↓
Dashboard web (React)
    ↓
[Banner Telegram]
    ├── Klik "Hubungkan" → Generate token (10 menit)
    │       ↓
    │   Buka t.me/Bot?start=TOKEN
    │       ↓
    │   [Edge: telegram-webhook]
    │   - Validasi token
    │   - Simpan telegram_chat_id
    │   - Kirim pesan sukses
    └── Status: ✅ Terhubung

[Manajemen Tugas]
    - Tambah/edit/hapus tugas
    - Toggle selesai
    - Filter: Semua / Belum Selesai / Selesai
    - Indikator H-1 URGENT (deadline ≤ 24 jam)

[Cron pg_cron setiap 15 menit]
    ↓
[Edge: send-reminders]
    - Query tugas H-1 yang belum dikirim
    - Kirim pesan Telegram per tugas
    - Update reminder_sent = TRUE
```

---

## 🔒 Keamanan

| Aspek | Implementasi |
|-------|-------------|
| **Isolasi data** | Row Level Security (RLS) — setiap user hanya akses datanya |
| **Kunci rahasia** | Service Role Key & Bot Token hanya di Edge Function Secrets |
| **Frontend** | Hanya gunakan `anon key` yang aman dengan RLS |
| **Token Telegram** | One-time use, kedaluwarsa 10 menit |

---

## 🧪 Test Cases

| ID | Skenario | Cara Uji |
|----|----------|----------|
| TC-01 | Registrasi → Profil otomatis dibuat | Daftar akun baru, cek tabel `profiles` |
| TC-02 | Penautan Telegram valid | Klik "Hubungkan", ikuti alur bot |
| TC-03 | Token kedaluwarsa ditolak | Gunakan token > 10 menit |
| TC-04 | Isolasi data RLS | Login 2 akun, pastikan tidak bisa akses data akun lain |
| TC-05 | Notifikasi H-1 terkirim | Buat tugas deadline 20 jam, trigger `send-reminders` |
| TC-06 | Tidak ada duplikasi | Trigger ulang setelah TC-05 — `sent: 0` |
| TC-07 | Tugas selesai tidak dikirim | Centang tugas, trigger cron |
| TC-08 | Reset reminder saat reschedule | Edit deadline ke 3 hari lagi → `reminder_sent` kembali FALSE |

---

## 📦 Scripts

```bash
npm run dev      # Jalankan dev server (port 5173)
npm run build    # Build produksi
npm run preview  # Preview build produksi
```

---

## 📄 Lisensi

MIT — Bebas digunakan dan dimodifikasi.
