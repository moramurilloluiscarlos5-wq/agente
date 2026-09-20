import { useEffect, useState } from 'react'
import { Bot, LoaderCircle, Sparkles, Stethoscope } from 'lucide-react'
import { api } from '../services/api.js'
import RepairRecordPicker from '../components/repairs/RepairRecordPicker.jsx'
import WhatsAppComposer from '../components/whatsapp/WhatsAppComposer.jsx'
import { deviceName, repairInputClass } from '../components/repairs/repairForm.js'

const initialState = {
  device_brand: '',
  device_model: '',
  issue: '',
  observations: '',
  symptoms: '',
}

export default function AIDiagnostic() {
  const [form, setForm] = useState(initialState)
  const [repair, setRepair] = useState(null)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const [aiStatus, setAiStatus] = useState(null)

  useEffect(() => {
    let active = true

    async function loadHistory() {
      try {
        const response = await api.get('/ai/history')
        if (active) setHistory(response.data ?? [])
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setHistoryLoading(false)
      }
    }

    loadHistory()
    api.get('/ai/status').then((response) => setAiStatus(response.data)).catch(() => setAiStatus({ configured: false }))
    return () => { active = false }
  }, [])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function selectRepair(record) {
    setRepair(record)
    setForm((current) => ({
      ...current,
      repair_order_id: record.id,
      device_id: record.device_id || record.device?.id || '',
      device_brand: record.device?.brand || record.brand || current.device_brand,
      device_model: record.device?.model || record.model || current.device_model,
      issue: record.reported_problem || current.issue,
      symptoms: record.symptoms || current.symptoms,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/ai/diagnose', form)
      setResults(response.result)
      const latest = await api.get('/ai/history')
      setHistory(latest.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnóstico IA</h1>
          <p className="mt-1 text-sm text-slate-400">Analiza un equipo para sugerir causas, pruebas y riesgo antes de la validación técnica.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          <Bot size={16} />
          {aiStatus?.configured ? 'IA disponible' : 'Servicio IA no configurado'}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="mb-5 flex items-center gap-2 text-cyan-300">
            <Sparkles size={18} />
            <h2 className="font-semibold">Nuevo análisis</h2>
          </div>

          <div className="mb-5 space-y-3">
            <div>
              <h3 className="text-sm font-medium text-slate-300">Orden de reparación</h3>
              <p className="mt-1 text-xs text-slate-500">Opcional. Asociar una orden permite conservar el diagnóstico junto al historial del equipo.</p>
            </div>
            <RepairRecordPicker
              endpoint="/repairs"
              label="orden, cliente, equipo o problema"
              selected={repair}
              onSelect={selectRepair}
              describe={(record) => `${record.order_number} · ${deviceName(record.device ?? record)} · ${record.reported_problem || 'Sin problema registrado'}`}
              disabled={loading}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span>Marca</span>
              <input name="device_brand" value={form.device_brand} onChange={updateField} className={repairInputClass} placeholder="Samsung" required />
            </label>

            <label className="space-y-2 text-sm text-slate-300">
              <span>Modelo</span>
              <input name="device_model" value={form.device_model} onChange={updateField} className={repairInputClass} placeholder="Galaxy A54" required />
            </label>
          </div>

          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Problema principal</span>
            <textarea name="issue" value={form.issue} onChange={updateField} rows={4} className={repairInputClass} placeholder="El equipo no carga ni enciende…" required />
          </label>

          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Observaciones</span>
            <textarea name="observations" value={form.observations} onChange={updateField} rows={3} className={repairInputClass} placeholder="Se observa humedad, pantalla rota, batería caliente..." />
          </label>

          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Síntomas</span>
            <textarea name="symptoms" value={form.symptoms} onChange={updateField} rows={3} className={repairInputClass} placeholder="Se calienta, reinicia, no detecta carga..." />
          </label>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
          )}

          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Stethoscope size={16} />}
              {loading ? 'Analizando…' : 'Generar diagnóstico'}
            </button>
          </div>
        </form>

        <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <Bot size={16} className="text-cyan-300" />
            Resultado
          </h2>

          {results ? (
            <div className="space-y-4 text-sm text-slate-300">
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                <div className="text-xs uppercase tracking-wide text-cyan-300">Resumen</div>
                <p className="mt-2 text-slate-100">{results.summary}</p>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Causas probables</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {results.likely_causes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Pruebas recomendadas</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {results.recommended_checks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-slate-200">
                <div className="text-xs uppercase tracking-wide text-slate-400">Nivel de riesgo</div>
                <p className="mt-2 font-medium capitalize">{results.risk_level}</p>
                <p className="mt-2 text-slate-400">{results.note}</p>
              </div>
              {repair?.customer && <WhatsAppComposer repair={repair} customer={repair.customer} />}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Todavía no hay un análisis generado. Completa el formulario para obtener una recomendación.</p>
          )}
        </aside>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-100">Historial reciente</h2>

        {historyLoading ? (
          <p className="text-sm text-slate-400">Cargando historial…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-400">No hay diagnósticos previos.</p>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-slate-100">{item.input_data?.device_brand} {item.input_data?.device_model}</h3>
                  <span className="text-xs uppercase tracking-wide text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{item.input_data?.issue}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
