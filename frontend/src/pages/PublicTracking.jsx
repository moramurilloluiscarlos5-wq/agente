import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatDateTime } from '../utils/formatters.js'

export default function PublicTracking() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get(`/public/tracking/${encodeURIComponent(token)}`).then((response) => setData(response.data)).catch((err) => setError(err.message)) }, [token])
  if (error) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><p className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">{error}</p></main>
  if (!data) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><p className="text-slate-400">Cargando seguimiento…</p></main>
  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100"><div className="mx-auto max-w-xl space-y-5"><header><p className="text-sm text-cyan-300">CARLOSTECH AI</p><h1 className="mt-2 text-2xl font-bold">Seguimiento de reparación</h1></header><section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Orden {data.orderNumber}</h2><StatusBadge status={data.status} /></div><p className="mt-3 text-slate-300">{data.device?.brand} {data.device?.model}</p><p className="mt-1 text-sm text-slate-400">Cliente: {data.customer?.first_name} {data.customer?.last_name}</p></section><section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="mb-4 font-semibold">Historial</h2><ol className="space-y-4">{(data.timeline || data.history || []).map((item) => <li key={`${item.status}-${item.createdAt || item.created_at}`} className="border-l border-cyan-500/40 pl-4"><StatusBadge status={item.status} /><p className="mt-1 text-sm text-slate-300">{item.message || item.public_message || item.note || ''}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt || item.created_at)}</p></li>)}</ol></section></div></main>
}
