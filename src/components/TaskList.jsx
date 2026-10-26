import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import TaskFormModal from './TaskFormModal'
import {
  Plus, CheckSquare, Square, Pencil, Trash2, Clock, Bell, BellOff,
  Loader2, AlertTriangle, ListFilter, CheckCheck, ListTodo, Inbox
} from 'lucide-react'

/**
 * TaskList – Komponen utama daftar tugas dengan filter, CRUD, dan indikator visual.
 *
 * Props:
 *  - tasks: array tugas dari Supabase
 *  - userId: ID pengguna yang login
 *  - loading: boolean apakah data sedang dimuat
 *  - onRefresh: callback untuk memuat ulang daftar tugas
 */
export default function TaskList({ tasks, userId, loading, onRefresh }) {
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'completed'
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null) // task object | null
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  /* ─── Helper: Format deadline ke WIB ─── */
  const formatDeadline = (isoString) => {
    if (!isoString) return '-'
    return new Date(isoString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB'
  }

  /* ─── Helper: Apakah deadline dalam 24 jam ke depan (H-1 urgent) ─── */
  const isUrgent = (task) => {
    if (task.is_completed) return false
    const now = Date.now()
    const deadline = new Date(task.deadline).getTime()
    return deadline > now && deadline - now <= 24 * 60 * 60 * 1000
  }

  /* ─── Helper: Apakah deadline sudah lewat ─── */
  const isOverdue = (task) => {
    if (task.is_completed) return false
    return new Date(task.deadline).getTime() < Date.now()
  }

  /* ─── Konfigurasi badge prioritas ─── */
  const priorityConfig = {
    high: {
      label: 'Tinggi',
      badgeClass: 'bg-[#FF6B6B]/20 text-[#FF6B6B] border border-[#FF6B6B]/30',
      dot: 'bg-[#FF6B6B]',
    },
    medium: {
      label: 'Sedang',
      badgeClass: 'bg-[#fbbf24]/20 text-[#fbbf24] border border-[#fbbf24]/30',
      dot: 'bg-[#fbbf24]',
    },
    low: {
      label: 'Rendah',
      badgeClass: 'bg-[#60a5fa]/20 text-[#60a5fa] border border-[#60a5fa]/30',
      dot: 'bg-[#60a5fa]',
    },
  }

  /* ─── Filter & Sort tugas ─── */
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks]
    if (filter === 'pending') filtered = filtered.filter((t) => !t.is_completed)
    if (filter === 'completed') filtered = filtered.filter((t) => t.is_completed)
    // Urutkan: deadline terdekat (ASC), tugas selesai ke bawah
    filtered.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1
      return new Date(a.deadline) - new Date(b.deadline)
    })
    return filtered
  }, [tasks, filter])

  /* ─── Hitung jumlah per tab ─── */
  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((t) => !t.is_completed).length,
    completed: tasks.filter((t) => t.is_completed).length,
  }), [tasks])

  /* ─── Toggle selesai / belum selesai ─── */
  const handleToggleComplete = async (task) => {
    setTogglingId(task.id)
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          is_completed: !task.is_completed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .eq('user_id', userId)
      if (error) throw error
      onRefresh()
    } catch (err) {
      console.error('Toggle error:', err)
      alert('Gagal memperbarui status tugas.')
    } finally {
      setTogglingId(null)
    }
  }

  /* ─── Hapus tugas ─── */
  const handleDelete = async (task) => {
    const confirmed = window.confirm(
      `Hapus tugas "${task.title}"?\n\nTindakan ini tidak dapat dibatalkan.`
    )
    if (!confirmed) return

    setDeletingId(task.id)
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .eq('user_id', userId)
      if (error) throw error
      onRefresh()
    } catch (err) {
      console.error('Delete error:', err)
      alert('Gagal menghapus tugas.')
    } finally {
      setDeletingId(null)
    }
  }

  /* ─── Buka modal edit ─── */
  const handleEdit = (task) => {
    setEditingTask(task)
    setShowModal(true)
  }

  /* ─── Buka modal tambah baru ─── */
  const handleAddNew = () => {
    setEditingTask(null)
    setShowModal(true)
  }

  /* ─── Modal ditutup / disimpan ─── */
  const handleModalClose = () => {
    setShowModal(false)
    setEditingTask(null)
  }

  const handleModalSaved = () => {
    handleModalClose()
    onRefresh()
  }

  const tabs = [
    { key: 'all', label: 'Semua', icon: ListFilter },
    { key: 'pending', label: 'Belum Selesai', icon: ListTodo },
    { key: 'completed', label: 'Selesai', icon: CheckCheck },
  ]

  return (
    <div>
      {/* ── Header Bar: Filter Tabs + Tombol Tambah ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        {/* Tab Filter */}
        <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#2A2A2A] p-1 rounded-xl overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                filter === key
                  ? 'bg-[#C6F135] text-[#0D0D0D]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full text-xs font-semibold ${
                  filter === key
                    ? 'bg-[#0D0D0D]/20 text-[#0D0D0D]'
                    : 'bg-[#2A2A2A] text-zinc-400'
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Tombol Tambah Tugas */}
        <button
          type="button"
          onClick={handleAddNew}
          className="btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" />
          Tambah Tugas
        </button>
      </div>

      {/* ── Loading State ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-600">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Memuat tugas...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600 text-center">
          <Inbox className="w-14 h-14 mb-3 text-zinc-700 opacity-40" />
          <p className="font-medium text-zinc-600">
            {filter === 'completed'
              ? 'Belum ada tugas yang diselesaikan.'
              : filter === 'pending'
              ? 'Semua tugas sudah selesai! 🎉'
              : 'Belum ada tugas. Klik "+ Tambah Tugas" untuk mulai.'}
          </p>
          {filter === 'all' && (
            <button
              type="button"
              onClick={handleAddNew}
              className="btn-primary mt-4 text-sm"
            >
              <Plus className="w-4 h-4" />
              Buat Tugas Pertama
            </button>
          )}
        </div>
      ) : (
        /* ── Daftar Tugas ── */
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const urgent = isUrgent(task)
            const overdue = isOverdue(task)
            const pConfig = priorityConfig[task.priority] || priorityConfig.medium
            const isDeleting = deletingId === task.id
            const isToggling = togglingId === task.id

            return (
              <div
                key={task.id}
                className={`card p-4 transition-all duration-200 hover:border-[#2A2A2A] ${
                  task.is_completed ? 'opacity-70' : ''
                } ${
                  urgent && !task.is_completed
                    ? 'border-[#C6F135]/50 border-2 shadow-[#C6F135]/10 shadow-md'
                    : overdue
                    ? 'border-[#FF6B6B]/50 border-2'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(task)}
                    disabled={isToggling || isDeleting}
                    className={`mt-0.5 flex-shrink-0 transition-colors disabled:opacity-50 ${
                      task.is_completed
                        ? 'text-[#4ADE80]'
                        : 'text-zinc-600 hover:text-[#C6F135]'
                    }`}
                    aria-label={task.is_completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                  >
                    {isToggling ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#C6F135]" />
                    ) : task.is_completed ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  {/* Konten Tugas */}
                  <div className="flex-1 min-w-0">
                    {/* Baris 1: Judul + Badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3
                        className={`font-semibold text-sm ${
                          task.is_completed ? 'line-through text-zinc-600' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </h3>

                      {/* Badge Prioritas */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pConfig.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pConfig.dot}`} />
                        {pConfig.label}
                      </span>

                      {/* Badge Urgent H-1 */}
                      {urgent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[#C6F135] text-[#0D0D0D] animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          URGENT H-1!
                        </span>
                      )}

                      {/* Badge Overdue */}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[#FF6B6B] text-white">
                          <AlertTriangle className="w-3 h-3" />
                          Terlewat!
                        </span>
                      )}
                    </div>

                    {/* Deskripsi */}
                    {task.description && (
                      <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{task.description}</p>
                    )}

                    {/* Baris 2: Deadline + Status Pengingat */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                      <span className={`inline-flex items-center gap-1 text-xs ${
                        overdue ? 'text-[#FF6B6B] font-medium' : 'text-zinc-500'
                      }`}>
                        <Clock className="w-3.5 h-3.5" />
                        {formatDeadline(task.deadline)}
                      </span>

                      {/* Badge Status Pengingat */}
                      {task.reminder_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[#4ADE80] font-medium">
                          <Bell className="w-3.5 h-3.5" />
                          ✅ Pengingat Terkirim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                          <BellOff className="w-3.5 h-3.5" />
                          ⏳ Pengingat H-{Math.round((task.reminder_offset_hours || 24) / 24)} ({task.reminder_offset_hours || 24}j)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tombol Aksi */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(task)}
                      disabled={isDeleting || isToggling}
                      className="btn-ghost p-1.5 text-zinc-400 hover:text-[#C6F135] rounded-lg"
                      aria-label="Edit tugas"
                      title="Edit tugas"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(task)}
                      disabled={isDeleting || isToggling}
                      className="btn-ghost p-1.5 text-zinc-400 hover:text-[#FF6B6B] rounded-lg"
                      aria-label="Hapus tugas"
                      title="Hapus tugas"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#FF6B6B]" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal Form ── */}
      {showModal && (
        <TaskFormModal
          task={editingTask}
          userId={userId}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  )
}
