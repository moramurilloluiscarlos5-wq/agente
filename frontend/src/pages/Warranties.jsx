import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '../services/api.js'
import { formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const STATUS_CLASS = {
  activa: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  vencida: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  invalidada: 'bg-red-500/15 text-red-300 border border-red-500/30',
}

export default function Warranties() {
  const [warranties, setWarranties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await api.get('/warranties?page=1&limit=20')
        if (active) {
          setWarranties(response.data ?? [])
          setError('')
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Garantías</h1>
          <p className="mt-1 text-sm text-slate-400">Estado, vigencia y servicio cubierto por cada garantía.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          <ShieldCheck size={16} />
          {warranties.length} garantías
        </div>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">Cargando garantías…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">{error}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Servicio</th>
                <th className="px-4 py-3 font-medium">Duración</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {warranties.map((warranty) => (
                <tr key={warranty.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-4 font-semibold text-emerald-300">{warranty.id.slice(0, 8)}</td>
                  <td className="px-4 py-4 text-slate-200">{customerName(warranty.customer)}</td>
                  <td className="px-4 py-4 text-slate-300">{warranty.service_description || '—'}</td>
                  <td className="px-4 py-4 text-slate-300">{warranty.duration_days ?? 0} días</td>
                  <td className="px-4 py-4 text-slate-400">{formatDate(warranty.expires_at)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[warranty.status] ?? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'}`}>
                      {warranty.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
