import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { X, Save, Plus, Loader2, AlertCircle, Calendar, AlignLeft, Flag, Bell } from 'lucide-react'

/**
 * TaskFormModal – Modal form untuk membuat atau mengedit tugas.
 *
 * Props:
 *  - task: object tugas yang sedang diedit (null jika mode tambah baru)
 *  - userId: ID pengguna yang sedang login
 *  - onClose: callback saat modal ditutup
 *  - onSaved: callback setelah tugas berhasil disimpan
 */
export default function TaskFormModal({ task, userId, onClose, onSaved }) {
  const isEdit = Boolean(task)

  /** Konversi TIMESTAMPTZ (UTC) ke format datetime-local (format: YYYY-MM-DDTHH:mm) */
  const toLocalDatetimeInput = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    // Format ke waktu lokal browser
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'medium',
    deadline: toLocalDatetimeInput(task?.deadline) || '',
    reminder_offset_hours: task?.reminder_offset_hours || 24,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Tutup modal dengan tombol Escape
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  /** Sanitasi input teks sederhana */
  const sanitize = (str) =>
    str.replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  const validate = () => {
    if (!formData.title.trim()) return 'Judul tugas tidak boleh kosong.'
    if (formData.title.trim().length > 200) return 'Judul tugas maksimal 200 karakter.'
    if (!formData.deadline) return 'Batas waktu (deadline) wajib diisi.'

    const deadlineDate = new Date(formData.deadline)
    const now = new Date()

    if (!isEdit && deadlineDate <= now) {
      return 'Deadline tidak boleh di waktu yang sudah lewat saat membuat tugas baru.'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      // Konversi datetime-local ke ISO UTC string
      const deadlineUTC = new Date(formData.deadline).toISOString()

      const payload = {
        title: sanitize(formData.title.trim()),
        description: formData.description.trim() ? sanitize(formData.description.trim()) : null,
        priority: formData.priority,
        deadline: deadlineUTC,
        reminder_offset_hours: parseInt(formData.reminder_offset_hours),
        updated_at: new Date().toISOString(),
      }

      let error
      if (isEdit) {
        // Update tugas yang ada
        ;({ error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', task.id)
          .eq('user_id', userId))
      } else {
        // Insert tugas baru
        ;({ error } = await supabase.from('tasks').insert({
          ...payload,
          user_id: userId,
        }))
      }

      if (error) throw error
      onSaved()
    } catch (err) {
      console.error('Save task error:', err)
      setError(err.message || 'Gagal menyimpan tugas. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const priorityOptions = [
    { value: 'low', label: '🔵 Rendah', color: 'text-blue-600' },
    { value: 'medium', label: '🟡 Sedang', color: 'text-yellow-600' },
    { value: 'high', label: '🔴 Tinggi', color: 'text-red-600' },
  ]

  // Batas minimum datetime input (sekarang, untuk tugas baru)
  const minDatetime = !isEdit
    ? new Date(Date.now() + 60000).toISOString().slice(0, 16)
    : undefined

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal Panel */}
      <div className="w-full max-w-lg bg-[#141414] border border-[#2A2A2A] rounded-2xl p-0 overflow-hidden shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            {isEdit ? (
              <>
                <Save className="w-4 h-4 text-[#C6F135]" />
                Edit Tugas
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 text-[#C6F135]" />
                Tambah Tugas Baru
              </>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg text-zinc-400 hover:text-white"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-[#2A0000] border border-[#FF6B6B]/30 text-[#FF6B6B] px-3.5 py-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Judul */}
          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Judul Tugas <span className="text-red-500">*</span>
            </label>
            <input
              id="task-title"
              name="title"
              type="text"
              placeholder="Contoh: Kumpulkan laporan proyek"
              value={formData.title}
              onChange={handleChange}
              disabled={loading}
              maxLength={200}
              className="input-field"
              autoFocus
              required
            />
            <p className="text-xs text-zinc-500 mt-1 text-right">{formData.title.length}/200</p>
          </div>

          {/* Deskripsi */}
          <div>
            <label htmlFor="task-desc" className="block text-sm font-medium text-zinc-300 mb-1.5">
              <AlignLeft className="inline w-3.5 h-3.5 mr-1" />
              Deskripsi <span className="text-zinc-500 font-normal">(opsional)</span>
            </label>
            <textarea
              id="task-desc"
              name="description"
              rows={3}
              placeholder="Tambahkan catatan atau rincian tugas..."
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              maxLength={2000}
              className="input-field resize-none"
            />
          </div>

          {/* Prioritas */}
          <div>
            <label htmlFor="task-priority" className="block text-sm font-medium text-zinc-300 mb-1.5">
              <Flag className="inline w-3.5 h-3.5 mr-1" />
              Prioritas
            </label>
            <select
              id="task-priority"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              disabled={loading}
              className="input-field"
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="task-deadline" className="block text-sm font-medium text-zinc-300 mb-1.5">
              <Calendar className="inline w-3.5 h-3.5 mr-1" />
              Batas Waktu (Deadline) <span className="text-red-500">*</span>
            </label>
            <input
              id="task-deadline"
              name="deadline"
              type="datetime-local"
              value={formData.deadline}
              onChange={handleChange}
              disabled={loading}
              min={minDatetime}
              className="input-field"
              required
            />
            <p className="text-xs text-zinc-500 mt-1">
              Waktu disimpan dalam UTC.
            </p>
          </div>

          {/* Waktu Pengingat */}
          <div>
            <label htmlFor="task-reminder" className="block text-sm font-medium text-zinc-300 mb-1.5">
              <Bell className="inline w-3.5 h-3.5 mr-1" />
              Ingatkan Saya
            </label>
            <select
              id="task-reminder"
              name="reminder_offset_hours"
              value={formData.reminder_offset_hours}
              onChange={handleChange}
              disabled={loading}
              className="input-field"
            >
              <option value={6}>6 jam sebelum deadline</option>
              <option value={12}>12 jam sebelum deadline</option>
              <option value={24}>24 jam / H-1 (default)</option>
              <option value={48}>48 jam / H-2</option>
              <option value={72}>72 jam / H-3</option>
              <option value={168}>1 minggu sebelum deadline</option>
            </select>
            <p className="text-xs text-zinc-600 mt-1">
              Notifikasi Telegram akan dikirim saat tersisa ≤ {formData.reminder_offset_hours} jam.
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2A2A2A] bg-[#0D0D0D]/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-secondary"
          >
            Batal
          </button>
          <button
            type="submit"
            form=""
            disabled={loading}
            onClick={handleSubmit}
            className="btn-primary"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? 'Simpan Perubahan' : 'Tambah Tugas'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
