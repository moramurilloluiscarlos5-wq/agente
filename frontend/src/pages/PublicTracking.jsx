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
  if (error) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><p className="rounded-[var(--tf-radius-card)] border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-5 text-[#fca5a5]">{error}</p></main>
  if (!data) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><p className="text-[var(--tf-text-muted)]">Cargando seguimiento…</p></main>
  return <main className="min-h-screen bg-[var(--tf-surface-sunken)] p-6 text-[var(--tf-text)]"><div className="mx-auto max-w-xl space-y-5"><header><p className="text-sm text-[var(--tf-link)]">TallerFlow</p><h1 className="mt-2 text-2xl font-semibold">Seguimiento de reparación</h1></header><section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Orden {data.orderNumber}</h2><StatusBadge status={data.status} /></div><p className="mt-3 text-[var(--tf-text-muted)]">{data.device?.brand} {data.device?.model}</p><p className="mt-1 text-sm text-[var(--tf-text-muted)]">Cliente: {data.customer?.first_name} {data.customer?.last_name}</p></section><section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5"><h2 className="mb-4 font-semibold">Historial</h2><ol className="space-y-4">{(data.timeline || data.history || []).map((item) => <li key={`${item.status}-${item.createdAt || item.created_at}`} className="border-l border-[var(--tf-accent)] pl-4"><StatusBadge status={item.status} /><p className="mt-1 text-sm text-[var(--tf-text-muted)]">{item.message || item.public_message || item.note || ''}</p><p className="mt-1 text-xs text-[var(--tf-text-subtle)]">{formatDateTime(item.createdAt || item.created_at)}</p></li>)}</ol></section></div></main>
}
