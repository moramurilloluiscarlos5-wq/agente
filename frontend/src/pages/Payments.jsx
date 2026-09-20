import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { api } from '../services/api.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const STATUS_CLASS = {
  pendiente: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  parcial: 'bg-violet-500/15 text-violet-300 border border-violet-500/30',
  pagado: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
}

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await api.get('/payments?page=1&limit=20')
        if (active) {
          setPayments(response.data ?? [])
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
          <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="mt-1 text-sm text-slate-400">Anticipos, pagos parciales y saldos registrados en el taller.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
          <CreditCard size={16} />
          {payments.length} movimientos
        </div>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">Cargando pagos…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">{error}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-4 text-slate-200">{customerName(payment.customer)}</td>
                  <td className="px-4 py-4">{formatCurrency(payment.amount)}</td>
                  <td className="px-4 py-4 capitalize text-slate-300">{payment.method}</td>
                  <td className="px-4 py-4 text-slate-300">{payment.reference || '—'}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[payment.status] ?? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'}`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-400">{formatDate(payment.payment_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
