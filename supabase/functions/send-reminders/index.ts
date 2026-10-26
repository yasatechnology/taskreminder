// ============================================================
// FILE: supabase/functions/send-reminders/index.ts
// DESKRIPSI: Edge Function pengirim pengingat H-1 via Telegram.
//            Dipicu oleh pg_cron setiap 15 menit.
//            Mengambil tugas yang memenuhi syarat H-1, mengirim
//            pesan Telegram, lalu memperbarui reminder_sent=TRUE.
//
// Deploy: supabase functions deploy send-reminders
// Trigger: pg_cron '*/15 * * * *'
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipe data ──
interface TaskWithProfile {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  deadline: string
  profiles: {
    telegram_chat_id: string
    name: string | null
    email: string | null
  }
}

// ── Helper: Tunda eksekusi (ms) untuk rate limiting ──
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// ── Helper: Format deadline ke zona waktu Asia/Jakarta (WIB) ──
function formatDeadlineWIB(isoString: string): string {
  return new Date(isoString).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' WIB'
}

// ── Helper: Konversi kode prioritas ke label Bahasa Indonesia ──
function formatPriority(priority: 'low' | 'medium' | 'high'): string {
  const map = { high: '🔴 TINGGI', medium: '🟡 SEDANG', low: '🔵 RENDAH' }
  return map[priority] || priority.toUpperCase()
}

// ── Helper: Escape karakter Markdown V2 Telegram ──
function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

// ── Helper: Kirim satu pesan Telegram ──
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'MarkdownV2',
        }),
      }
    )

    if (!response.ok) {
      const body = await response.text()
      console.error(`[send-reminders] Gagal kirim ke chat ${chatId} (HTTP ${response.status}):`, body)
      return false
    }

    return true
  } catch (err) {
    console.error(`[send-reminders] Network error kirim ke chat ${chatId}:`, err)
    return false
  }
}

// ── Handler Utama ──
Deno.serve(async (req: Request): Promise<Response> => {
  // Hanya terima POST (dari pg_cron via pg_net HTTP request)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')

  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[send-reminders] Environment variables tidak lengkap.')
    return new Response(
      JSON.stringify({ error: 'Missing environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Inisialisasi klien Supabase dengan Service Role Key
  // (memintas RLS untuk akses lintas pengguna)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000) // +24 jam

  console.log(`[send-reminders] Mulai berjalan pada: ${now.toISOString()}`)
  console.log(`[send-reminders] Mencari tugas dengan deadline: ${now.toISOString()} < deadline <= ${windowEnd.toISOString()}`)

  // ── Query: Ambil semua tugas yang memenuhi syarat H-1 ──
  // Kriteria:
  //   1. is_completed = FALSE
  //   2. reminder_sent = FALSE
  //   3. deadline > NOW()       (belum terlewat)
  //   4. deadline <= NOW() + 24 jam  (dalam jendela H-1)
  //   5. profiles.telegram_chat_id IS NOT NULL (pemilik sudah hubungkan Telegram)
  const { data: tasks, error: queryError } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      priority,
      deadline,
      profiles!inner (
        telegram_chat_id,
        name,
        email
      )
    `)
    .eq('is_completed', false)
    .eq('reminder_sent', false)
    .gt('deadline', now.toISOString())
    .lte('deadline', windowEnd.toISOString())
    .not('profiles.telegram_chat_id', 'is', null)

  if (queryError) {
    console.error('[send-reminders] Error query tugas H-1:', queryError)
    return new Response(
      JSON.stringify({ error: queryError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const eligibleTasks = (tasks as TaskWithProfile[]) || []
  console.log(`[send-reminders] Ditemukan ${eligibleTasks.length} tugas H-1 yang perlu dikirimi pengingat.`)

  if (eligibleTasks.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: 'Tidak ada tugas H-1 yang perlu dikirimi pengingat.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Iterasi dan kirim pesan satu per satu ──
  let sentCount = 0
  let failedCount = 0

  for (const task of eligibleTasks) {
    const chatId = task.profiles.telegram_chat_id
    const deadlineFormatted = escapeMarkdownV2(formatDeadlineWIB(task.deadline))
    const priorityFormatted = escapeMarkdownV2(formatPriority(task.priority))
    const titleFormatted = escapeMarkdownV2(task.title)
    const descFormatted = task.description
      ? escapeMarkdownV2(task.description)
      : '\\-'

    // ── Format pesan pengingat H-1 ──
    const message =
      `🔔 *PENGINGAT TUGAS \\(H\\-1 DEADLINE\\)*\n\n` +
      `📌 *Judul:* ${titleFormatted}\n` +
      `🔥 *Prioritas:* ${priorityFormatted}\n` +
      `⏰ *Batas Waktu:* ${deadlineFormatted}\n` +
      `📝 *Deskripsi:* ${descFormatted}\n\n` +
      `_Segera selesaikan tugas Anda\\. Jika sudah selesai, jangan lupa tandai selesai melalui dashboard website\\._`

    console.log(`[send-reminders] Mengirim pengingat tugas "${task.title}" (ID: ${task.id}) ke chat ${chatId}`)

    const success = await sendTelegramMessage(BOT_TOKEN, chatId, message)

    if (success) {
      // ── Update reminder_sent = TRUE hanya jika pengiriman BERHASIL ──
      // Jika gagal, kolom tidak diubah sehingga akan dicoba ulang pada siklus cron berikutnya
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          reminder_sent: true,
          reminder_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)

      if (updateError) {
        console.error(`[send-reminders] Gagal update reminder_sent untuk tugas ${task.id}:`, updateError)
        failedCount++
      } else {
        sentCount++
        console.log(`[send-reminders] ✅ Berhasil: tugas ${task.id} — reminder_sent diperbarui.`)
      }
    } else {
      failedCount++
      console.warn(`[send-reminders] ⚠️ Gagal kirim Telegram untuk tugas ${task.id}. Akan dicoba lagi pada siklus berikutnya.`)
    }

    // ── Jeda 75ms antar pesan untuk menghindari rate limit Telegram ──
    // Telegram mengizinkan maks ~30 pesan/detik secara global,
    // tapi untuk bot individual batas efektifnya lebih rendah.
    if (eligibleTasks.indexOf(task) < eligibleTasks.length - 1) {
      await sleep(75)
    }
  }

  const summary = {
    sent: sentCount,
    failed: failedCount,
    total_eligible: eligibleTasks.length,
    timestamp: new Date().toISOString(),
  }

  console.log('[send-reminders] Selesai. Ringkasan:', summary)

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
