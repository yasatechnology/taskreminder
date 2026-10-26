// ============================================================
// FILE: supabase/functions/telegram-webhook/index.ts
// DESKRIPSI: Edge Function penerima webhook dari Bot Telegram.
//            Menangani proses Deep Linking (perintah /start <token>)
//            untuk menghubungkan akun web pengguna dengan Telegram.
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipe data Telegram Update (subset yang dibutuhkan) ──
interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      username?: string
      first_name?: string
    }
    chat: {
      id: number
      type: string
    }
    text?: string
    date: number
  }
}

// ── Helper: Kirim pesan teks ke Telegram ──
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    console.error(`[telegram-webhook] Gagal kirim pesan ke ${chatId}:`, errBody)
  }
}

// ── Handler Utama ──
Deno.serve(async (req: Request): Promise<Response> => {
  // Hanya terima metode POST (webhook Telegram selalu POST)
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')

  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[telegram-webhook] Environment variables tidak lengkap.')
    return new Response('Internal Server Error: missing env vars', { status: 500 })
  }

  // Inisialisasi klien Supabase dengan Service Role Key
  // (memintas RLS untuk dapat mengakses semua baris di tabel profiles)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400 })
  }

  const message = update.message
  if (!message || !message.text) {
    // Update bukan berupa pesan teks (bisa reaction, sticker, dll.) — abaikan
    return new Response('OK', { status: 200 })
  }

  const chatId = message.chat.id
  const messageText = message.text.trim()
  const fromUsername = message.from?.username || null
  const fromFirstName = message.from?.first_name || 'Pengguna'

  console.log(`[telegram-webhook] Pesan dari chat ${chatId}: "${messageText}"`)

  // ── Deteksi perintah /start <token> ──
  // Format yang didukung: "/start TG-XXXXXXXX"
  const startMatch = messageText.match(/^\/start(?:@\w+)?\s+([A-Z0-9\-]{3,64})$/i)

  if (!startMatch) {
    // Bukan perintah /start dengan token — kirim pesan bantuan
    await sendTelegramMessage(
      BOT_TOKEN,
      chatId,
      `👋 Halo *${fromFirstName}*\\!\n\nSaya adalah bot pengingat *TaskRemind*\\.\n\nUntuk menghubungkan akun Anda, buka dashboard web TaskRemind dan klik tombol *"Hubungkan Telegram Sekarang"*\\.`,
      'Markdown'
    )
    return new Response('OK', { status: 200 })
  }

  const token = startMatch[1].toUpperCase()
  console.log(`[telegram-webhook] Memproses token: ${token} untuk chat ${chatId}`)

  // ── Cari profil dengan token yang valid dan belum kedaluwarsa ──
  const { data: profile, error: queryError } = await supabase
    .from('profiles')
    .select('id, email, name, connect_token, token_expires_at')
    .eq('connect_token', token)
    .gt('token_expires_at', new Date().toISOString()) // Token belum kedaluwarsa
    .maybeSingle() // Kembalikan null jika tidak ada, bukan error

  if (queryError) {
    console.error('[telegram-webhook] Error query profiles:', queryError)
    await sendTelegramMessage(
      BOT_TOKEN,
      chatId,
      '❌ *Terjadi kesalahan internal*\\. Silakan coba lagi atau hubungi administrator\\.'
    )
    return new Response('Internal Server Error', { status: 500 })
  }

  // ── Token tidak ditemukan atau sudah kedaluwarsa ──
  if (!profile) {
    console.log(`[telegram-webhook] Token tidak valid atau kedaluwarsa: ${token}`)
    await sendTelegramMessage(
      BOT_TOKEN,
      chatId,
      '❌ *Tautan Tidak Valid atau Kedaluwarsa\\.*\n\n' +
      'Token penghubung yang Anda gunakan tidak ditemukan atau sudah melewati batas waktu 10 menit\\.\n\n' +
      'Silakan kembali ke halaman web *TaskRemind* dan klik tombol *"Hubungkan Telegram Sekarang"* untuk mendapatkan tautan baru\\.'
    )
    return new Response('OK', { status: 200 })
  }

  // ── Token valid: Simpan telegram_chat_id dan bersihkan token ──
  const displayName = profile.name || profile.email || 'Pengguna'

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: String(chatId),
      telegram_username: fromUsername,
      connect_token: null,        // Hapus token setelah digunakan (one-time use)
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (updateError) {
    console.error('[telegram-webhook] Error update profiles:', updateError)
    await sendTelegramMessage(
      BOT_TOKEN,
      chatId,
      '❌ *Gagal menyimpan koneksi\\.*\n\nTerjadi kesalahan saat menyimpan data Anda\\. Silakan coba lagi\\.'
    )
    return new Response('Internal Server Error', { status: 500 })
  }

  // ── Kirim pesan konfirmasi sukses ──
  const successMessage =
    `✅ *Integrasi Berhasil\\!*\n\n` +
    `Halo *${escapeMarkdownV2(displayName)}*, akun Telegram Anda kini terhubung dengan *TaskRemind*\\.\n\n` +
    `🔔 Saya akan mengirimkan pengingat otomatis di ruang obrolan ini tepat pada *H\\-1* \\(≤ 24 jam\\) sebelum tenggat waktu setiap tugas Anda yang belum selesai\\.\n\n` +
    `_Selamat menggunakan TaskRemind\\!_ 🚀`

  await sendTelegramMessage(BOT_TOKEN, chatId, successMessage)

  console.log(`[telegram-webhook] Berhasil menghubungkan user ${profile.id} dengan chat ${chatId}`)
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Helper: Escape karakter khusus Markdown V2 Telegram ──
function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
