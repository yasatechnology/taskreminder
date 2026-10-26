# PRODUCT REQUIREMENTS DOCUMENT (PRD)

| Informasi Dokumen | Detail |
| :--- | :--- |
| **Nama Produk** | **TaskRemind** – Sistem Manajemen & Pengingat Tugas Web-Telegram |
| **Versi Dokumen** | 2.0 (Edisi Implementasi React & Supabase) |
| **Tanggal** | 25 Oktober 2026 |
| **Status** | Siap Eksekusi Pengembangan (Ready for Development) |
| **Tech Stack Utama** | React (Vite), Supabase (PostgreSQL, Auth, Edge Functions, `pg_cron`), Telegram Bot API |

---

## 1. Ringkasan Eksekutif (Executive Summary)

### 1.1 Latar Belakang Masalah
Banyak pengguna mencatat daftar tugas dan tenggat waktu (*deadline*) di aplikasi berbasis web, namun sering melewatkan batas waktu pengumpulan karena jarang membuka dashboard web secara rutin. Sebaliknya, aplikasi pesan instan seperti Telegram dibuka setiap hari dan memiliki tingkat keterbacaan notifikasi yang sangat tinggi.

### 1.2 Solusi Produk
**TaskRemind** adalah aplikasi web manajemen tugas berbasis **React** dan **Supabase** yang terintegrasi langsung dengan **Bot Telegram**. Pengguna dapat menambah, melihat, memfilter, mengedit, dan menandai selesai tugas melalui antarmuka web. Sistem kemudian bekerja secara otomatis di latar belakang (*serverless cron*) untuk mengirimkan notifikasi pengingat ke ruang obrolan Telegram pengguna tepat pada **H-1 ($\le 24$ jam sebelum tenggat waktu)** untuk setiap tugas yang belum diselesaikan.

### 1.3 Target Pengguna
* Mahasiswa dan pelajar yang memiliki banyak jadwal pengumpulan tugas kuliah/sekolah.
* Pekerja lepas (*freelancer*) dan profesional yang membutuhkan pengingat tenggat waktu proyek secara personal.

### 1.4 Metrik Keberhasilan (Success Metrics / KPI)
* **Akurasi Pengiriman Pengingat:** $99.9\%$ tugas aktif yang memasuki jendela waktu $\le 24$ jam sebelum *deadline* berhasil memicu pesan Telegram tanpa duplikasi.
* **Kecepatan Integrasi Akun:** Waktu yang dibutuhkan pengguna untuk menautkan akun web ke Bot Telegram $< 60$ detik.
* **Efisiensi Infrastruktur:** Berjalan sepenuhnya menggunakan arsitektur *Serverless* (Supabase BaaS) tanpa memerlukan pemeliharaan server backend monolitik.

---

## 2. Arsitektur Sistem (React + Supabase)

Sistem dibangun menggunakan pendekatan *Backend-as-a-Service (BaaS)* dengan empat komponen utama:

1. **Frontend (React + `@supabase/supabase-js`):** Menangani antarmuka autentikasi pengguna, operasi CRUD tugas secara langsung ke database Supabase, serta pembuatan token penautan Telegram.
2. **Database & Keamanan (Supabase PostgreSQL + RLS):** Menyimpan data profil dan tugas, mengamankan akses data antar-pengguna dengan *Row Level Security (RLS)*, serta mengeksekusi *Database Trigger* otomatis saat data berubah.
3. **Edge Function `telegram-webhook`:** Fungsi *serverless* berbasis Deno yang menerima *webhook* dari server Telegram saat pengguna menekan tombol **Start** (proses *Deep Linking* akun).
4. **Edge Function `send-reminders` + `pg_cron`:** Penjadwal otomatis di dalam PostgreSQL yang memicu fungsi pengiriman pesan Telegram setiap 15 menit untuk tugas-tugas yang masuk kategori H-1.

```text
[ Pengguna ] 
     │
     ├──► 1. Kelola Tugas & Auth ──► [ React Web App ]
     │                                      │
     │                            (Supabase Client + RLS)
     │                                      ▼
     │                            [ Supabase PostgreSQL ] ◄── [ pg_cron (Tiap 15 Menit) ]
     │                                 ▲           │                     │
     │                    (Update ID)  │           │ (Kueri Tugas H-1)   │ (Trigger HTTP)
     │                                 │           ▼                     ▼
     └──► 2. Klik /start <token> ──► [ Telegram Bot API ] ◄── [ Supabase Edge Functions ]
          & Terima Notifikasi H-1    (Webhook & SendMsg)      (webhook & send-reminders)
```

---

## 3. Ruang Lingkup Produk (Product Scope)

### 3.1 In-Scope (Fase 1 / MVP)
* **Autentikasi Pengguna:** Registrasi, Login, dan Logout menggunakan *Supabase Auth* (Email & Password).
* **Penautan Telegram (Deep Linking):** Pembuatan *one-time connect token* di web, validasi token melalui perintah `/start <token>` di Bot Telegram, serta fitur putus tautan (*Unlink*).
* **Manajemen Tugas (CRUD):**
  * Membuat tugas baru (Judul, Deskripsi, Prioritas, Tanggal & Jam *Deadline*).
  * Melihat daftar tugas dengan urutan *deadline* terdekat dan filter status (*Semua*, *Belum Selesai*, *Selesai*).
  * Mengedit detail dan jadwal *deadline* tugas.
  * Mengubah status penyelesaian tugas (*Completed / Pending*).
  * Menghapus tugas.
* **Pengingat Otomatis H-1:** Pengecekan berkala setiap 15 menit dan pengiriman pesan pengingat ke Telegram beserta pencatatan status terkirim (`reminder_sent`).

### 3.2 Out-of-Scope (Fase Pengembangan Berikutnya)
* Menambah atau mengedit tugas melalui balasan chat di Telegram (komunikasi bot pada Fase 1 bersifat satu arah untuk notifikasi).
* Kolaborasi tim atau berbagi tugas antar-akun pengguna.
* Unggah lampiran berkas (*file attachment*) pada tugas.

---

## 4. User Stories & Kriteria Penerimaan (Acceptance Criteria)

| ID | Sebagai... | Saya ingin... | Sehingga... | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- | :--- | :--- |
| **US-01** | Pengguna | Mendaftar dan masuk menggunakan email serta password | Data tugas saya tersimpan secara privat dan aman | - Registrasi otomatis membuat baris baru di tabel `public.profiles` melalui *Database Trigger*.<br>- Pengguna hanya dapat mengakses data miliknya sendiri (dijamin oleh *Supabase RLS*). |
| **US-02** | Pengguna | Menghubungkan akun web saya dengan Bot Telegram | Bot mengetahui `chat_id` saya untuk mengirim pengingat | - Klik tombol "Hubungkan Telegram" menghasilkan `connect_token` unik dengan masa berlaku 10 menit.<br>- Pengguna diarahkan ke `https://t.me/<BotUsername>?start=<token>`.<br>- Saat menekan *Start*, bot memvalidasi token, menyimpan `telegram_chat_id` & `telegram_username`, lalu mengosongkan token.<br>- Dashboard web menampilkan status "Terhubung (@username)". |
| **US-03** | Pengguna | Memutuskan tautan akun Telegram dari web | Saya dapat mengganti akun Telegram atau menghentikan notifikasi | - Tombol "Putuskan Telegram" menghapus nilai `telegram_chat_id` dan `telegram_username` di tabel `profiles`. |
| **US-04** | Pengguna | Menambahkan tugas baru beserta tanggal dan jam *deadline* | Tugas saya tercatat di sistem dan dijadwalkan untuk pengingat | - Input wajib: Judul dan Tanggal/Jam *Deadline*.<br>- Input opsional: Deskripsi dan Prioritas (`low`, `medium`, `high`).<br>- Waktu disimpan dalam format `TIMESTAMPTZ` (UTC) di database. |
| **US-05** | Pengguna | Melihat dan memfilter daftar tugas di dashboard web | Saya fokus pada tugas yang belum selesai dan paling mendesak | - Daftar tugas diurutkan berdasarkan `deadline` paling awal (`ASC`).<br>- Filter berfungsi untuk menampilkan: *Semua*, *Belum Selesai*, dan *Selesai*.<br>- Menampilkan indikator status pengingat (*Menunggu Jadwal H-1* atau *Pengingat Terkirim*). |
| **US-06** | Pengguna | Mengedit tugas atau menandai tugas sebagai selesai | Perubahan jadwal saya tercatat dan saya tidak menerima spam untuk tugas yang sudah selesai | - Tugas yang dicentang "Selesai" (`is_completed = true`) tidak akan dikirimi pesan Telegram.<br>- Jika *deadline* diundur ke waktu masa depan, status `reminder_sent` otomatis di-reset menjadi `false`. |
| **US-07** | Pengguna | Menerima notifikasi Telegram pada H-1 sebelum *deadline* | Saya segera menyelesaikan tugas sebelum terlambat | - Ketika sisa waktu menuju *deadline* $\le 24$ jam dan $> 0$ jam, bot mengirim pesan berisi judul, prioritas, waktu batas pengumpulan, dan deskripsi.<br>- Kolom `reminder_sent` diperbarui menjadi `true` agar pesan hanya dikirim 1 kali. |

---

## 5. Aturan Bisnis & Logika Sistem (Business Rules)

### 5.1 Logika Jendela Waktu H-1 (24-Hour Reminder Window)
* Penjadwal (`pg_cron`) berjalan setiap **15 menit**.
* Sebuah tugas memenuhi syarat untuk dikirimi notifikasi apabila memenuhi seluruh kondisi berikut pada saat *cron* berjalan:
  1. `is_completed = FALSE`
  2. `reminder_sent = FALSE`
  3. `deadline > NOW()` (Tenggat waktu belum terlewat)
  4. `deadline <= NOW() + INTERVAL '24 hours'` (Berada dalam rentang $\le 24$ jam sebelum *deadline*)
  5. Pemilik tugas memiliki `telegram_chat_id IS NOT NULL`

### 5.2 Aturan Perubahan Jadwal Tenggat Waktu (Reschedule Trigger Rule)
* Jika sebuah tugas sudah pernah dikirimi pengingat (`reminder_sent = TRUE`), lalu pengguna mengedit tanggal/jam `deadline` di web menjadi waktu baru di masa depan (`NEW.deadline > NOW()`), maka sistem secara otomatis mengubah `reminder_sent` kembali menjadi `FALSE` melalui *PostgreSQL Trigger*.
* Dengan demikian, pengguna akan kembali menerima pengingat H-1 saat jadwal baru tersebut mendekati 24 jam sebelum tenggat waktu.

### 5.3 Aturan Tugas Mendadak (Deadline $< 24$ Jam Saat Dibuat)
* Jika pengguna menginput tugas baru yang waktu *deadline*-nya kurang dari 24 jam sejak waktu dibuat (misal: dibuat pukul 13:00 untuk *deadline* pukul 20:00 di hari yang sama), tugas tersebut langsung memenuhi syarat kueri H-1 dan notifikasi Telegram akan dikirim pada siklus *cron* terdekat (maksimal dalam 15 menit).

### 5.4 Standarisasi Zona Waktu (Timezone Handling)
* **Frontend (React):** Input `datetime-local` dari pengguna dikonversi menjadi format standar ISO 8601 (`UTC`) sebelum dikirim ke Supabase.
* **Database (PostgreSQL):** Seluruh kolom waktu menggunakan tipe data `TIMESTAMPTZ` (Timestamp with Time Zone).
* **Notifikasi Bot Telegram:** Waktu *deadline* diformat ke zona waktu lokal Indonesia (`Asia/Jakarta` / WIB, atau sesuai preferensi pengguna) saat merangkai teks pesan Telegram.

---

## 6. Desain Database, RLS, & Triggers (Supabase PostgreSQL)

### 6.1 Tabel `public.profiles`
Menyimpan profil pengguna yang berelasi $1:1$ dengan tabel autentikasi bawaan `auth.users`.

| Nama Kolom | Tipe Data | Constraint / Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE` | ID pengguna dari Supabase Auth |
| `email` | `TEXT` | `NOT NULL` | Alamat email pengguna |
| `telegram_chat_id` | `TEXT` | `UNIQUE`, `NULLABLE` | ID ruang obrolan Telegram pengguna |
| `telegram_username` | `TEXT` | `NULLABLE` | Username akun Telegram pengguna |
| `connect_token` | `TEXT` | `NULLABLE` | Token sementara untuk integrasi bot |
| `token_expires_at` | `TIMESTAMPTZ` | `NULLABLE` | Waktu kedaluwarsa `connect_token` |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu pembaruan terakhir |

### 6.2 Tabel `public.tasks`
Menyimpan daftar tugas milik pengguna.

| Nama Kolom | Tipe Data | Constraint / Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | ID unik tugas |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES public.profiles(id) ON DELETE CASCADE` | ID pemilik tugas |
| `title` | `TEXT` | `NOT NULL` | Judul tugas |
| `description` | `TEXT` | `NULLABLE` | Rincian atau catatan tugas |
| `priority` | `TEXT` | `CHECK (priority IN ('low', 'medium', 'high'))`, `DEFAULT 'medium'` | Tingkat prioritas tugas |
| `deadline` | `TIMESTAMPTZ` | `NOT NULL` | Batas waktu pengumpulan tugas |
| `is_completed` | `BOOLEAN` | `DEFAULT FALSE` | Status penyelesaian tugas |
| `reminder_sent` | `BOOLEAN` | `DEFAULT FALSE` | Penanda apakah pengingat H-1 sudah dikirim |
| `reminder_sent_at` | `TIMESTAMPTZ` | `NULLABLE` | Waktu pengiriman pengingat H-1 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu pembuatan tugas |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Waktu pembaruan tugas terakhir |

### 6.3 Kebijakan Keamanan (Row Level Security / RLS)
* **Tabel `profiles`:**
  * `SELECT`: `auth.uid() = id` (Pengguna hanya dapat membaca profilnya sendiri).
  * `UPDATE`: `auth.uid() = id` (Pengguna hanya dapat memperbarui token/koneksi Telegram miliknya sendiri).
* **Tabel `tasks`:**
  * `ALL (SELECT, INSERT, UPDATE, DELETE)`: `auth.uid() = user_id` (Pengguna hanya dapat mengelola tugas miliknya sendiri).

### 6.4 Database Triggers
1. **`on_auth_user_created`:** Mengeksekusi fungsi `handle_new_user()` setiap kali ada baris baru di `auth.users` untuk membuat baris profil di `public.profiles`.
2. **`on_task_deadline_updated`:** Mengeksekusi fungsi `reset_reminder_on_deadline_change()` sebelum operasi `UPDATE` pada tabel `tasks`. Jika `NEW.deadline IS DISTINCT FROM OLD.deadline` dan `NEW.deadline > NOW()`, maka otomatis mengatur `NEW.reminder_sent := FALSE`.

---

## 7. Spesifikasi Integrasi Serverless (Edge Functions & Cron)

### 7.1 Edge Function 1: `telegram-webhook`
* **Method & Path:** `POST /functions/v1/telegram-webhook`
* **Konfigurasi Keamanan:** `--no-verify-jwt` (menerima payload langsung dari server Telegram).
* **Alur Proses:**
  1. Menerima payload JSON *Update* dari Telegram.
  2. Memeriksa apakah terdapat `message.text` yang diawali dengan `/start `.
  3. Mengekstrak `<token>` dari teks pesan, serta mengambil `chat.id` dan `from.username`.
  4. Mencari baris di tabel `profiles` menggunakan *Service Role Key* dengan syarat `connect_token = <token>` dan `token_expires_at > NOW()`.
  5. **Jika ditemukan:** Menyimpan `telegram_chat_id` dan `telegram_username`, mengosongkan `connect_token` menjadi `NULL`, lalu mengirim pesan konfirmasi berhasil ke Telegram pengguna.
  6. **Jika tidak ditemukan / kedaluwarsa:** Mengirim pesan balasan bahwa tautan tidak valid atau sudah kedaluwarsa.

### 7.2 Edge Function 2: `send-reminders`
* **Method & Path:** `POST /functions/v1/send-reminders`
* **Pemicu:** Dijadwalkan oleh `pg_cron` setiap 15 menit (`*/15 * * * *`).
* **Alur Proses:**
  1. Melakukan kueri ke tabel `tasks` (join dengan `profiles`) untuk mengambil daftar tugas yang memenuhi syarat H-1 (lihat Bagian 5.1).
  2. Melakukan iterasi pada setiap tugas yang ditemukan dan memformat pesan pengingat.
  3. Memanggil API Telegram `POST https://api.telegram.org/bot<TOKEN>/sendMessage`.
  4. Jika respons HTTP dari Telegram berhasil (`200 OK`), memperbarui kolom `reminder_sent = TRUE` dan `reminder_sent_at = NOW()` pada tugas terkait.
  5. Mengembalikan ringkasan JSON jumlah pesan yang berhasil dikirim: `{ "sent": <jumlah> }`.

---

## 8. Spesifikasi Antarmuka (UI/UX) & Format Pesan Bot

### 8.1 Komponen Antarmuka Web (React)
1. **Halaman Autentikasi (`AuthView`):**
   * Input Email dan Password.
   * Tombol **Masuk (Login)** dan **Daftar Akun Baru (Sign Up)** dengan umpan balik pesan error/sukses yang jelas.
2. **Header & Banner Status Telegram (`TelegramBanner`):**
   * **Status Belum Terhubung (Warna Kuning/Peringatan):** Menampilkan informasi bahwa pengingat belum aktif, dilengkapi tombol **[🔗 Hubungkan Telegram Sekarang]** dan **[🔄 Cek Status Koneksi]**.
   * **Status Sudah Terhubung (Warna Hijau/Sukses):** Menampilkan informasi `✅ Terhubung ke Telegram: @username`, dilengkapi tombol **[Putuskan Koneksi]**.
3. **Formulir Tugas (`TaskForm`):**
   * Berfungsi ganda untuk **Tambah Tugas Baru** dan **Edit Tugas** (berdasarkan *state* `editingId`).
   * Field: Judul Tugas (Teks, Wajib), Deskripsi (Textarea, Opsional), Prioritas (Dropdown: Rendah, Sedang, Tinggi), dan Batas Waktu (`datetime-local`, Wajib).
4. **Filter & Daftar Tugas (`TaskList`):**
   * Tab Filter: **Semua**, **Belum Selesai**, **Selesai**.
   * Kartu Tugas menampilkan: Checkbox status selesai, Judul Tugas, Badge Prioritas, Deskripsi, Waktu *Deadline* dalam format lokal Indonesia, Badge Status Pengingat (`⏳ Menunggu Jadwal H-1` atau `✅ Pengingat H-1 Terkirim`), serta tombol **[Edit]** dan **[Hapus]**.

### 8.2 Format Pesan Bot Telegram
* **Pesan Integrasi Berhasil:**
  ```text
  ✅ Integrasi Berhasil!
  Halo [email_pengguna], akun Telegram Anda telah terhubung dengan TaskRemind.
  Saya akan mengirimkan pengingat di ruang obrolan ini pada H-1 sebelum deadline tugas Anda.
  ```
* **Pesan Pengingat Tugas H-1:**
  ```text
  🔔 PENGINGAT TUGAS (H-1 DEADLINE)

  📌 Judul: [Judul Tugas]
  🔥 Prioritas: [HIGH / MEDIUM / LOW]
  ⏰ Batas Waktu: [Hari, Tanggal Bulan Tahun pukul HH.mm] WIB
  📝 Deskripsi: [Deskripsi Tugas atau "-"]

  Segera selesaikan tugas Anda dan tandai selesai di website!
  ```

---

## 9. Kebutuhan Non-Fungsional (Non-Functional Requirements)

1. **Keamanan Data:**
   * `SUPABASE_SERVICE_ROLE_KEY` dan `TELEGRAM_BOT_TOKEN` hanya boleh disimpan di dalam *Supabase Edge Function Secrets* dan dilarang keras diletakkan di kode *frontend* React.
   * Aplikasi React hanya boleh menggunakan `VITE_SUPABASE_ANON_KEY` yang dilindungi oleh kebijakan *Row Level Security (RLS)*.
2. **Keandalan & Penanganan Kegagalan (Fault Tolerance):**
   * Apabila pengiriman pesan ke API Telegram gagal (misalnya karena gangguan jaringan atau server Telegram sedang *down*), kolom `reminder_sent` tidak boleh diubah menjadi `TRUE` agar tugas tersebut otomatis dicoba kembali pada siklus *cron* 15 menit berikutnya.
   * Mematuhi batas pengiriman (*Rate Limit*) API Telegram maksimal $30$ pesan per detik.

---

## 10. Skenario Pengujian (QA Test Cases)

| ID Uji | Nama Skenario | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- |
| **TC-01** | Registrasi & Pembuatan Profil Otomatis | Daftar akun baru melalui halaman React. | Akun terdaftar di `auth.users` dan baris baru otomatis muncul di `public.profiles`. |
| **TC-02** | Penautan Telegram Valid | Klik "Hubungkan Telegram", buka bot, dan klik *Start*. | Bot mengirim pesan sukses, `telegram_chat_id` tersimpan di DB, dan UI web menampilkan status terhubung. |
| **TC-03** | Penautan dengan Token Kedaluwarsa | Gunakan tautan token yang dibuat $> 10$ menit lalu di Telegram. | Bot menolak integrasi dan meminta pengguna membuat tautan baru di web. |
| **TC-04** | Isolasi Data Antar-Pengguna (RLS) | Login sebagai User A dan coba akses/hapus tugas milik User B. | Permintaan ditolak oleh Supabase RLS; User A hanya melihat tugas miliknya sendiri. |
| **TC-05** | Pengiriman Notifikasi H-1 Normal | Buat tugas dengan *deadline* $20$ jam dari sekarang, lalu picu fungsi `send-reminders`. | Pesan pengingat masuk ke Telegram, dan status di web berubah menjadi `✅ Pengingat H-1 Terkirim`. |
| **TC-06** | Pencegahan Pengiriman Ganda | Picu kembali fungsi `send-reminders` setelah TC-05 berhasil. | Tidak ada pesan baru yang dikirim untuk tugas yang sama (`sent: 0`). |
| **TC-07** | Pengecualian Tugas Selesai | Buat tugas dengan *deadline* $12$ jam dari sekarang, centang "Selesai", lalu picu `send-reminders`. | Bot tidak mengirim pengingat karena `is_completed = TRUE`. |
| **TC-08** | Reset Status Pengingat Saat Reschedule | Edit tugas dari TC-05 (yang sudah `reminder_sent = TRUE`) dan ubah *deadline* menjadi 3 hari ke depan. | Trigger DB otomatis mengubah `reminder_sent` kembali menjadi `FALSE` (`⏳ Menunggu Jadwal H-1`). |