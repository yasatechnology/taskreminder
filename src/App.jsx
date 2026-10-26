import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabaseClient'
import AuthForm from './components/AuthForm'
import TelegramBanner from './components/TelegramBanner'
import TaskList from './components/TaskList'
import StatsPanel from './components/StatsPanel'
import {
  CheckSquare, LogOut, User, Loader2, RefreshCw, Bell
} from 'lucide-react'

/**
 * App – Root komponen aplikasi TaskRemind.
 *
 * Mengelola:
 * - State autentikasi (session Supabase)
 * - Profil pengguna dari tabel `profiles`
 * - Daftar tugas dari tabel `tasks`
 * - Sinkronisasi data real-time via Supabase Realtime
 */
export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [globalError, setGlobalError] = useState(null)

  /* ─── 1. Inisialisasi Sesi Auth ─── */
  useEffect(() => {
    // Ambil sesi aktif saat pertama kali mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Langganan perubahan sesi (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  /* ─── 2. Muat Profil Pengguna ─── */
  const fetchProfile = useCallback(async () => {
    if (!session?.user) return
    setLoadingProfile(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Fetch profile error:', err)
      setGlobalError('Gagal memuat profil pengguna.')
    } finally {
      setLoadingProfile(false)
    }
  }, [session])

  /* ─── 3. Muat Daftar Tugas ─── */
  const fetchTasks = useCallback(async () => {
    if (!session?.user) return
    setLoadingTasks(true)
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('deadline', { ascending: true })
      if (error) throw error
      setTasks(data || [])
    } catch (err) {
      console.error('Fetch tasks error:', err)
      setGlobalError('Gagal memuat daftar tugas.')
    } finally {
      setLoadingTasks(false)
    }
  }, [session])

  /* ─── 4. Efek: Muat data saat sesi aktif ─── */
  useEffect(() => {
    if (session?.user) {
      fetchProfile()
      fetchTasks()
      setGlobalError(null)
    } else {
      setProfile(null)
      setTasks([])
    }
  }, [session, fetchProfile, fetchTasks])

  /* ─── 5. Realtime: Langganan perubahan tugas ─── */
  useEffect(() => {
    if (!session?.user) return

    const channel = supabase
      .channel(`tasks_user_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          // Muat ulang saat ada INSERT, UPDATE, atau DELETE
          fetchTasks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, fetchTasks])

  /* ─── 6. Logout ─── */
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  /* ─── Render: Loading awal (mengecek sesi) ─── */
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D]">
        <div className="flex flex-col items-center gap-3 text-zinc-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Memuat aplikasi...</p>
        </div>
      </div>
    )
  }

  /* ─── Render: Belum login ─── */
  if (!session) {
    return <AuthForm />
  }

  /* ─── Render: Dashboard utama ─── */
  const userName = profile?.name || session.user.email?.split('@')[0] || 'Pengguna'
  const userEmail = session.user.email

  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      {/* ══ HEADER ══ */}
      <header className="bg-[#0D0D0D] border-b border-[#1F1F1F] sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#C6F135]">
              <CheckSquare className="w-5 h-5 text-[#0D0D0D]" />
            </div>
            <div>
              <h1 className="font-bold text-white leading-tight">TaskRemind</h1>
              <p className="text-xs text-zinc-600 leading-tight hidden sm:block">Pengingat Tugas H-1</p>
            </div>
          </div>

          {/* User Info + Logout */}
          <div className="flex items-center gap-3">
            {/* Indikator Telegram kecil */}
            {profile?.telegram_chat_id && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-[#4ADE80] font-medium bg-[#0D2818] border border-[#1A4D2E] rounded-full px-2.5 py-1">
                <Bell className="w-3 h-3" />
                Telegram Aktif
              </span>
            )}

            <div className="hidden sm:flex items-center gap-1.5 text-sm text-zinc-300">
              <User className="w-4 h-4 text-zinc-500" />
              <span className="font-medium">{userName}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary text-xs py-1.5 px-3 gap-1.5"
              title={`Keluar dari ${userEmail}`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ══ KONTEN UTAMA ══ */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Global Error */}
        {globalError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#2A0000] border border-[#FF6B6B]/30 text-[#FF6B6B] px-4 py-3 text-sm">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => { setGlobalError(null); fetchProfile(); fetchTasks() }}
              className="ml-auto btn-ghost py-0.5 px-2 text-[#FF6B6B] text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Coba lagi
            </button>
          </div>
        )}

        {/* Selamat Datang */}
        <div className="mb-5">
          <h2 className="text-2xl font-black text-white">
            Halo, {userName}! 👋
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            {tasks.filter(t => !t.is_completed).length} tugas belum selesai
            {tasks.filter(t => !t.is_completed && new Date(t.deadline) - Date.now() <= 24*60*60*1000 && new Date(t.deadline) > Date.now()).length > 0 && (
              <span className="ml-1 text-[#C6F135] font-semibold">
                · {tasks.filter(t => !t.is_completed && new Date(t.deadline) - Date.now() <= 24*60*60*1000 && new Date(t.deadline) > Date.now()).length} mendekati deadline!
              </span>
            )}
          </p>
        </div>

        {/* ── Banner Telegram ── */}
        {loadingProfile ? (
          <div className="mb-6 h-16 rounded-xl bg-[#1A1A1A] animate-pulse" />
        ) : profile ? (
          <TelegramBanner profile={profile} onProfileUpdate={fetchProfile} />
        ) : null}

        {/* ── Panel Statistik ── */}
        <StatsPanel tasks={tasks} />

        {/* ── Daftar Tugas ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <CheckSquare className="w-4.5 h-4.5 text-[#C6F135]" />
              Daftar Tugas Saya
            </h2>
            <button
              type="button"
              onClick={fetchTasks}
              disabled={loadingTasks}
              className="btn-ghost py-1 px-2 text-zinc-600 hover:text-[#C6F135] text-xs"
              title="Muat ulang"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTasks ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <TaskList
            tasks={tasks}
            userId={session.user.id}
            loading={loadingTasks}
            onRefresh={fetchTasks}
          />
        </div>
      </main>

      {/* ══ FOOTER ══ */}
      <footer className="text-center py-6 text-xs text-zinc-700 mt-4">
        <p>TaskRemind &copy; {new Date().getFullYear()} · Ditenagai oleh Supabase &amp; Telegram Bot API</p>
      </footer>
    </div>
  )
}
