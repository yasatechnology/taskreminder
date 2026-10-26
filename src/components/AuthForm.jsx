import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LogIn, UserPlus, CheckSquare, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'

/**
 * AuthForm – Komponen autentikasi yang menangani mode Login dan Registrasi.
 * Menggunakan Supabase Auth (Email & Password).
 */
export default function AuthForm() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [formData, setFormData] = useState({ name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const isRegister = mode === 'register'

  /** Sanitasi input teks dari karakter berbahaya */
  const sanitize = (str) =>
    str.replace(/[<>"'&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]))

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  const validate = () => {
    if (!formData.email.trim()) return 'Email tidak boleh kosong.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Format email tidak valid.'
    if (formData.password.length < 8) return 'Kata sandi minimal 8 karakter.'
    if (isRegister && !formData.name.trim()) return 'Nama lengkap tidak boleh kosong.'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              // Dikirim ke raw_user_meta_data, digunakan oleh DB trigger untuk mengisi profiles.name
              name: sanitize(formData.name.trim()),
            },
          },
        })
        if (signUpError) throw signUpError
        setSuccessMsg('Registrasi berhasil! Silakan cek email untuk konfirmasi (jika diperlukan), lalu masuk.')
        setMode('login')
        setFormData({ name: '', email: formData.email, password: '' })
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        })
        if (signInError) throw signInError
        // Setelah login berhasil, App.jsx akan mendeteksi perubahan sesi dan me-render dashboard
      }
    } catch (err) {
      console.error('Auth error:', err)
      // Terjemahkan pesan error Supabase ke Bahasa Indonesia
      const msg = err.message || ''
      if (msg.includes('Invalid login credentials')) {
        setError('Email atau kata sandi salah. Silakan coba lagi.')
      } else if (msg.includes('User already registered')) {
        setError('Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.')
      } else if (msg.includes('Email not confirmed')) {
        setError('Email belum dikonfirmasi. Cek kotak masuk Anda.')
      } else {
        setError(msg || 'Terjadi kesalahan. Silakan coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(isRegister ? 'login' : 'register')
    setError(null)
    setSuccessMsg(null)
    setFormData({ name: '', email: '', password: '' })
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C6F135] shadow-lg mb-4">
            <CheckSquare className="w-9 h-9 text-[#0D0D0D]" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">TaskRemind</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Manajemen tugas terintegrasi pengingat Telegram H-1
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-[#141414] border border-[#1F1F1F] rounded-2xl p-8 animate-fade-in">
          {/* Tab Header */}
          <div className="flex rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccessMsg(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                !isRegister
                  ? 'bg-[#C6F135] text-[#0D0D0D]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setSuccessMsg(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                isRegister
                  ? 'bg-[#C6F135] text-[#0D0D0D]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Daftar
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-[#2A0000] border border-[#FF6B6B]/30 text-[#FF6B6B] px-4 py-3 mb-5 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="flex items-start gap-3 rounded-xl bg-[#0D2818] border border-[#1A4D2E] text-[#4ADE80] px-4 py-3 mb-5 text-sm animate-fade-in">
              <CheckSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Nama Lengkap (hanya saat Daftar) */}
            {isRegister && (
              <div className="animate-slide-up">
                <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-1.5">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Masukkan nama lengkap Anda"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                  maxLength={100}
                  className="input-field"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-1.5">
                Alamat Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nama@contoh.com"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                maxLength={150}
                className="input-field"
                required
              />
            </div>

            {/* Kata Sandi */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-1.5">
                Kata Sandi <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder={isRegister ? 'Minimal 8 karakter' : 'Masukkan kata sandi'}
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  minLength={8}
                  maxLength={128}
                  className="input-field pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isRegister && (
                <p className="text-xs text-zinc-600 mt-1">Minimal 8 karakter</p>
              )}
            </div>

            {/* Tombol Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isRegister ? 'Mendaftarkan...' : 'Masuk...'}
                </>
              ) : (
                <>
                  {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                  {isRegister ? 'Buat Akun' : 'Masuk'}
                </>
              )}
            </button>
          </form>

          {/* Toggle Mode */}
          <p className="text-center text-sm text-zinc-500 mt-6">
            {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-[#C6F135] hover:text-[#d4ff3d] hover:underline transition-colors"
            >
              {isRegister ? 'Masuk di sini' : 'Daftar sekarang'}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-6">
          Data Anda aman dan dilindungi oleh Row Level Security Supabase.
        </p>
      </div>
    </div>
  )
}
