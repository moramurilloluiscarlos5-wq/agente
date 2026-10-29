import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Stethoscope } from 'lucide-react'
import { api } from '../services/api.js'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import WhatsAppComposer from '../components/whatsapp/WhatsAppComposer.jsx'
import { Alert, Button, Card, EmptyState, ErrorAlert, Input, Skeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { customerName, deviceName } from '../components/repairs/repairForm.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatDate } from '../utils/formatters.js'

const initialState = { device_brand: '', device_model: '', issue: '', observations: '', symptoms: '' }
const RISK = { bajo: ['Riesgo bajo', 'var(--tf-success)'], medio: ['Riesgo medio', 'var(--tf-warning)'], alto: ['Riesgo alto', 'var(--tf-danger)'], low: ['Riesgo bajo', 'var(--tf-success)'], medium: ['Riesgo medio', 'var(--tf-warning)'], high: ['Riesgo alto', 'var(--tf-danger)'] }

export default function AIDiagnostic() {
  const [form, setForm] = useState(initialState)
  const [repair, setRepair] = useState(null)
  const [errors, setErrors] = useState({})
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState({ loaded: false, list: [], error: null })
  const [running, setRunning] = useState(false)
  const [requestError, setRequestError] = useState(null)
  const [aiStatus, setAiStatus] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    api.get('/ai/history').then((response) => { if (active) setHistory({ loaded: true, list: response.data ?? [], error: null }) })
      .catch((error) => { if (active) setHistory({ loaded: true, list: [], error }) })
    return () => { active = false }
  }, [revision])

  useEffect(() => {
    let active = true
    api.get('/ai/status').then((response) => { if (active) setAiStatus(response.data) }).catch(() => { if (active) setAiStatus({ configured: false }) })
    return () => { active = false }
  }, [])

  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }

  function selectRepair(record) {
    setRepair(record)
    if (!record) { setForm((current) => ({ ...current, repair_order_id: undefined, device_id: undefined })); return }
    setErrors({})
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
    const next = {}
    if (!form.device_brand.trim()) next.device_brand = 'Escribe la marca, por ejemplo Samsung.'
    if (!form.device_model.trim()) next.device_model = 'Escribe el modelo, por ejemplo Galaxy A54.'
    if (!form.issue.trim()) next.issue = 'Describe el problema principal del equipo.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('ai-form'); return }
    setRunning(true); setRequestError(null)
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== undefined && value !== ''))
      const response = await api.post('/ai/diagnose', body)
      setResults(response.result)
      setRevision((value) => value + 1)
    } catch (error) {
      setRequestError(error)
    } finally {
      setRunning(false)
    }
  }

  const risk = results ? RISK[String(results.risk_level ?? '').toLowerCase()] : null

  return (
    <div className="space-y-6">
      <PageHeader title="Diagnóstico IA" description="Sugiere causas probables y pruebas para un equipo. Un técnico siempre valida el resultado." />
      {aiStatus && !aiStatus.configured && <Alert tone="info" title="Próximamente">El diagnóstico con IA estará disponible muy pronto. Te avisaremos cuando se active; mientras tanto, el formulario no podrá generar resultados.</Alert>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card title="Datos del equipo" description="Elige una orden para llenar los datos y guardar el diagnóstico en su historial.">
          <form id="ai-form" onSubmit={handleSubmit} noValidate className="tf-form-grid">
            <div className="tf-span-2">
              <RecordPicker label="Orden de reparación (opcional)" value={repair} onChange={selectRepair} disabled={running}
                path={(q) => `/repairs?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                renderLabel={(record) => `${record.order_number}, ${deviceName(record.device ?? record)}`} renderMeta={(record) => customerName(record.customer)}
                placeholder="CAR-0042 o iPhone 13" />
            </div>
            <Input label="Marca" required value={form.device_brand} onChange={set('device_brand')} error={errors.device_brand} placeholder="Samsung" />
            <Input label="Modelo" required value={form.device_model} onChange={set('device_model')} error={errors.device_model} placeholder="Galaxy A54" />
            <Textarea fieldClassName="tf-span-2" label="Problema principal" required rows={4} value={form.issue} onChange={set('issue')} error={errors.issue} placeholder="No carga ni enciende después de mojarse." />
            <Textarea label="Observaciones (opcional)" rows={3} value={form.observations} onChange={set('observations')} placeholder="Humedad visible cerca del conector." />
            <Textarea label="Síntomas (opcional)" rows={3} value={form.symptoms} onChange={set('symptoms')} placeholder="Se calienta y se reinicia solo." />
            {requestError && <div className="tf-span-2"><ErrorAlert error={requestError} action="generar el diagnóstico" /></div>}
            <div className="tf-span-2 flex justify-end"><Button variant="primary" type="submit" icon={Stethoscope} busy={running}>{running ? 'Analizando…' : 'Generar diagnóstico'}</Button></div>
          </form>
        </Card>

        <Card title="Resultado" aria-live="polite">
          {running ? <div role="status" aria-label="Analizando" className="space-y-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            : results ? (
              <div className="space-y-6 text-sm">
                <p className="text-base leading-relaxed text-[var(--tf-text)]">{results.summary}</p>
                {risk && <p className="font-medium" style={{ color: risk[1] }}>{risk[0]}</p>}
                <section><h3 className="text-sm font-medium text-[var(--tf-text)]">Causas probables</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--tf-text-muted)]">{(results.likely_causes ?? []).map((item) => <li key={item}>{item}</li>)}</ul></section>
                <section><h3 className="text-sm font-medium text-[var(--tf-text)]">Pruebas recomendadas</h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--tf-text-muted)]">{(results.recommended_checks ?? []).map((item) => <li key={item}>{item}</li>)}</ol></section>
                {results.note && <p className="text-[var(--tf-text-subtle)]">{results.note}</p>}
                {repair && <div className="flex flex-wrap gap-2 border-t border-[var(--tf-border)] pt-4">
                  <Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} className="ct-btn ct-btn-secondary">Abrir {repair.order_number}</Link>
                  {repair.customer && <WhatsAppComposer repair={repair} customer={repair.customer} />}
                </div>}
              </div>
            ) : <EmptyState icon={Bot} title="Sin análisis todavía" description="Completa los datos del equipo y genera el diagnóstico para ver causas y pruebas sugeridas." className="!py-8" />}
        </Card>
      </div>

      <Card title="Diagnósticos recientes" bodyClassName={null}>
        {!history.loaded ? <div className="space-y-3 p-6"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
          : history.error ? <div className="p-4"><ErrorAlert error={history.error} action="cargar el historial" onRetry={() => setRevision((value) => value + 1)} /></div>
            : !history.list.length ? <p className="p-6 text-sm text-[var(--tf-text-subtle)]">Aún no hay diagnósticos. El primero que generes aparecerá aquí.</p>
              : <ul className="tf-list">{history.list.map((item) => (
                <li key={item.id} className="tf-list-row !items-start">
                  <span className="min-w-0"><span className="block text-sm font-medium text-[var(--tf-text)]">{[item.input_data?.device_brand, item.input_data?.device_model].filter(Boolean).join(' ') || 'Equipo'}</span>
                    <span className="block truncate text-sm text-[var(--tf-text-muted)]">{item.input_data?.issue}</span></span>
                  <span className="shrink-0 text-xs text-[var(--tf-text-subtle)]">{formatDate(item.created_at)}</span>
                </li>))}</ul>}
      </Card>
    </div>
  )
}
