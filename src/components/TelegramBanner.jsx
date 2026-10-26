import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  Send, RefreshCw, CheckCircle2, AlertTriangle, Unlink,
  ExternalLink, Loader2, Info
} from 'lucide-react'

/**
 * TelegramBanner – Banner status integrasi Telegram.
 *
 * Menampilkan dua state:
 *  1. Belum terhubung (kuning) – tombol "Hubungkan Sekarang" & "Cek Status"
 *  2. Terhubung (hijau) – menampilkan @username & tombol "Putuskan"
 *
 * Props:
 *  - profile: object profil pengguna dari tabel `profiles`
 *  - onProfileUpdate: callback untuk memuat ulang profil dari DB
 */
export default function TelegramBanner({ profile, onProfileUpdate }) {
  const [loadingConnect, setLoadingConnect] = useState(false)
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [loadingUnlink, setLoadingUnlink] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error'|'info', text }

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

  /** Generate token acak: TG- + 8 karakter alfanumerik uppercase */
  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const arr = new Uint8Array(8)
    crypto.getRandomValues(arr)
    return 'TG-' + Array.from(arr, (b) => chars[b % chars.length]).join('')
  }

  /** Hubungkan Telegram: buat token → simpan ke DB → buka bot link */
  const handleConnect = async () => {
    setLoadingConnect(true)
    setMessage(null)

    try {
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 menit

      const { error } = await supabase
        .from('profiles')
        .update({
          connect_token: token,
          token_expires_at: expiresAt,
        })
        .eq('id', profile.id)

      if (error) throw error

      if (!botUsername) {
        setMessage({ type: 'error', text: 'VITE_TELEGRAM_BOT_USERNAME belum diisi di file .env.' })
        return
      }

      // Buka tab Telegram Bot dengan deep-link token
      const telegramUrl = `https://t.me/${botUsername}?start=${token}`
      window.open(telegramUrl, '_blank', 'noopener,noreferrer')

      setMessage({
        type: 'info',
        text: `Tautan dibuka di Telegram! Token berlaku 10 menit. Klik "Cek Status" setelah berhasil menghubungkan.`,
      })
    } catch (err) {
      console.error('Connect error:', err)
      setMessage({ type: 'error', text: 'Gagal membuat token. Coba lagi.' })
    } finally {
      setLoadingConnect(false)
    }
  }

  /** Cek Status: muat ulang profil dari Supabase */
  const handleCheckStatus = async () => {
    setLoadingCheck(true)
    setMessage(null)
    try {
      await onProfileUpdate()
      if (!profile?.telegram_chat_id) {
        setMessage({ type: 'info', text: 'Belum terhubung. Pastikan Anda sudah klik Start di bot Telegram.' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal memuat ulang status.' })
    } finally {
      setLoadingCheck(false)
    }
  }

  /** Putuskan Telegram: hapus chat_id dan username dari DB */
  const handleUnlink = async () => {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin memutuskan koneksi Telegram (@${profile.telegram_username || 'akun Anda'})?\n\nAnda tidak akan menerima notifikasi pengingat setelah diputuskan.`
    )
    if (!confirmed) return

    setLoadingUnlink(true)
    setMessage(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          telegram_chat_id: null,
          telegram_username: null,
          connect_token: null,
          token_expires_at: null,
        })
        .eq('id', profile.id)

      if (error) throw error
      await onProfileUpdate()
      setMessage({ type: 'success', text: 'Koneksi Telegram berhasil diputuskan.' })
    } catch (err) {
      console.error('Unlink error:', err)
      setMessage({ type: 'error', text: 'Gagal memutuskan koneksi. Coba lagi.' })
    } finally {
      setLoadingUnlink(false)
    }
  }

  const isConnected = Boolean(profile?.telegram_chat_id)

  return (
    <div className="mb-6">
      {/* Banner Utama */}
      {isConnected ? (
        /* ── Status TERHUBUNG (Hijau gelap) ── */
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl bg-[#0D2818] border border-[#1A4D2E] px-5 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#4ADE80] flex-shrink-0" />
            <div>
              <p className="font-semibold text-[#4ADE80] text-sm">Telegram Terhubung</p>
              <p className="text-[#86efac] text-xs mt-0.5">
                Pengingat aktif ke{' '}
                <span className="font-bold">
                  {profile.telegram_username ? `@${profile.telegram_username}` : `Chat ID: ${profile.telegram_chat_id}`}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={loadingUnlink}
            className="btn bg-[#1A0000] text-[#FF6B6B] border border-[#4D0000] hover:bg-[#2A0000] focus:ring-[#FF6B6B] text-xs shrink-0"
          >
            {loadingUnlink ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlink className="w-3.5 h-3.5" />
            )}
            Putuskan Koneksi
          </button>
        </div>
      ) : (
        /* ── Status BELUM TERHUBUNG (Amber gelap) ── */
        <div className="rounded-xl bg-[#2A1A00] border border-[#4D3000] px-5 py-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-[#fbbf24] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-[#fbbf24] text-sm">Pengingat Telegram Belum Aktif</p>
              <p className="text-[#fcd34d] text-xs mt-0.5">
                Hubungkan akun Telegram Anda untuk menerima notifikasi otomatis H-1 sebelum deadline tugas.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ml-8">
            <button
              type="button"
              onClick={handleConnect}
              disabled={loadingConnect || !botUsername}
              className="btn bg-[#C6F135] text-[#0D0D0D] hover:bg-[#d4ff3d] focus:ring-[#C6F135] text-xs shadow-sm font-semibold"
            >
              {loadingConnect ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              Hubungkan Sekarang
            </button>
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={loadingCheck}
              className="btn bg-[#1A1A1A] text-[#fbbf24] border border-[#2A2A2A] hover:bg-[#222222] focus:ring-[#fbbf24] text-xs"
            >
              {loadingCheck ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Cek Status
            </button>
          </div>
          {!botUsername && (
            <p className="mt-2 ml-8 text-xs text-[#FF6B6B] flex items-center gap-1">
              <Info className="w-3 h-3" />
              Set VITE_TELEGRAM_BOT_USERNAME di file .env terlebih dahulu.
            </p>
          )}
        </div>
      )}

      {/* Pesan Feedback */}
      {message && (
        <div
          className={`mt-2 flex items-start gap-2 rounded-lg px-4 py-2.5 text-xs border animate-fade-in ${
            message.type === 'success'
              ? 'bg-[#0D2818] border-[#1A4D2E] text-[#4ADE80]'
              : message.type === 'error'
              ? 'bg-[#2A0000] border-[#FF6B6B]/30 text-[#FF6B6B]'
              : 'bg-[#001A2A] border-[#003D5C] text-[#60a5fa]'
          }`}
        >
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {message.text}
        </div>
      )}
    </div>
  )
}
