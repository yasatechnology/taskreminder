import { useMemo } from 'react'
import { CheckCheck, Clock, AlertTriangle, TrendingUp } from 'lucide-react'

/**
 * StatsPanel – Panel statistik produktivitas dengan kartu berwarna-warni bergaya dark.
 * Props:
 *  - tasks: array tugas dari Supabase
 */
export default function StatsPanel({ tasks }) {
  const stats = useMemo(() => {
    const now = Date.now()
    const total = tasks.length
    const completed = tasks.filter(t => t.is_completed).length
    const pending = tasks.filter(t => !t.is_completed).length
    const overdue = tasks.filter(t => !t.is_completed && new Date(t.deadline).getTime() < now).length
    const urgent = tasks.filter(t => {
      if (t.is_completed) return false
      const dl = new Date(t.deadline).getTime()
      return dl > now && dl - now <= 24 * 60 * 60 * 1000
    }).length
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // High priority pending
    const highPriority = tasks.filter(t => !t.is_completed && t.priority === 'high').length

    return { total, completed, pending, overdue, urgent, successRate, highPriority }
  }, [tasks])

  const cards = [
    {
      className: 'stat-card-lime',
      icon: <CheckCheck className="w-6 h-6 opacity-70" />,
      value: stats.completed,
      label: 'Selesai',
      sub: `dari ${stats.total} total tugas`,
    },
    {
      className: 'stat-card-green',
      icon: <TrendingUp className="w-6 h-6 opacity-70" />,
      value: `${stats.successRate}%`,
      label: 'Success Rate',
      sub: 'tingkat penyelesaian',
    },
    {
      className: 'stat-card-coral',
      icon: <AlertTriangle className="w-6 h-6 opacity-80" />,
      value: stats.overdue,
      label: 'Terlewat',
      sub: `${stats.highPriority} prioritas tinggi`,
    },
    {
      className: 'stat-card-teal',
      icon: <Clock className="w-6 h-6 opacity-70" />,
      value: stats.urgent,
      label: 'Mendesak H-1',
      sub: `${stats.pending} belum selesai`,
    },
  ]

  if (tasks.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
        Statistik Produktivitas
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card, i) => (
          <div key={i} className={card.className}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center">
                {card.icon}
              </div>
            </div>
            <p className="text-3xl font-black tracking-tight leading-none mb-1">
              {card.value}
            </p>
            <p className="text-sm font-bold opacity-80">{card.label}</p>
            <p className="text-xs opacity-60 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
