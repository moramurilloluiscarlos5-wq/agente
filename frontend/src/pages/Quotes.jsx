import { useEffect, useState } from 'react'
import { MessageCircle, Receipt } from 'lucide-react'
import { api } from '../services/api.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const STATUS_CLASS = {
  pendiente: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  aceptada: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  rechazada: 'bg-red-500/15 text-red-300 border border-red-500/30',
  vencida: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  completada: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
}
const PAGE_SIZE = 20

export default function Quotes() {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sendError, setSendError] = useState('')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [sendingQuote, setSendingQuote] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      setSendError('')
      setNotice('')
      try {
        const response = await api.get(`/quotes?page=${page}&limit=${PAGE_SIZE}`)
        if (active) {
          const total = response.count ?? 0
          const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
          if (page > lastPage) {
            setPage(lastPage)
            return
          }
          setQuotes(response.data ?? [])
          setCount(total)
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
  }, [page, revision])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  async function sendQuote(quote) {
    setSendingQuote(quote.id)
    setSendError('')
    setNotice('')
    try {
      const response = await api.post(`/whatsapp/quotes/${encodeURIComponent(quote.id)}`, {})
      setNotice(response.simulated ? 'Cotización registrada como mensaje simulado.' : 'Cotización enviada por WhatsApp.')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSendingQuote('')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="mt-1 text-sm text-slate-400">Resumen de cotizaciones activas, aceptadas y vencidas.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          <Receipt size={16} />
          {count} registros
        </div>
      </header>
      {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
      {sendError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{sendError}</p>}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">Cargando cotizaciones…</div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300"><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-3 ct-btn ct-btn-secondary">Reintentar</button></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Válida hasta</th>
                <th className="px-4 py-3 font-medium">Creada</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {!quotes.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Todavía no hay cotizaciones.</td></tr>}
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-4 font-semibold text-cyan-300">{quote.quote_number}</td>
                  <td className="px-4 py-4 text-slate-200">{customerName(quote.customer)}</td>
                  <td className="px-4 py-4">{formatCurrency(quote.total)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[quote.status] ?? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{formatDate(quote.valid_until)}</td>
                  <td className="px-4 py-4 text-slate-400">{formatDate(quote.created_at)}</td>
                  <td className="px-4 py-4"><button type="button" onClick={() => sendQuote(quote)} disabled={Boolean(sendingQuote)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"><MessageCircle size={14} />{sendingQuote === quote.id ? 'Enviando…' : 'WhatsApp'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && <nav aria-label="Paginación de cotizaciones" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <p>Página {page} de {totalPages} · {count} registros</p>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || Boolean(sendingQuote)} onClick={() => setPage((value) => value - 1)} className="ct-btn ct-btn-secondary disabled:opacity-50">Anterior</button>
          <button type="button" disabled={page >= totalPages || Boolean(sendingQuote)} onClick={() => setPage((value) => value + 1)} className="ct-btn ct-btn-secondary disabled:opacity-50">Siguiente</button>
        </div>
      </nav>}
    </div>
  )
}
