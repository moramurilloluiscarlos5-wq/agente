import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, SearchX, ShieldCheck } from 'lucide-react'
import { api } from '../services/api.js'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import { EmptyState, Skeleton } from '../components/ui/DesignSystem.jsx'
import { formatDate, formatDateTime } from '../utils/formatters.js'

// Página pública que abre el cliente con su enlace o QR. Solo muestra lo que el backend publica.
export default function PublicTracking() {
  const { token } = useParams()
  const [state, setState] = useState({ token: null, data: null, error: null })

  useEffect(() => {
    let active = true
    api.get(`/public/tracking/${encodeURIComponent(token)}`)
      .then((response) => { if (active) setState({ token, data: response.data, error: null }) })
      .catch((error) => { if (active) setState({ token, data: null, error }) })
    return () => { active = false }
  }, [token])

  const loading = state.token !== token
  const { data, error } = state
  const device = [data?.device?.brand, data?.device?.model].filter(Boolean).join(' ') || 'Tu equipo'

  return (
    <main className="min-h-screen bg-[var(--tf-bg)] px-4 py-8 text-[var(--tf-text)] sm:py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo />
          <span className="text-sm text-[var(--tf-text-subtle)]">Seguimiento de reparación</span>
        </header>

        {loading ? (
          <div role="status" aria-label="Cargando seguimiento" className="tf-card space-y-4 p-6"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
        ) : error || !data ? (
          <section className="tf-card">
            <EmptyState icon={SearchX} title={error?.status === 404 || !error ? 'No encontramos este seguimiento' : 'No pudimos cargar tu seguimiento'}
              description={error?.status === 404 || !error ? 'El enlace puede haber cambiado. Pide al taller que te envíe uno nuevo.' : 'Revisa tu conexión a internet y vuelve a abrir el enlace en unos minutos.'} />
          </section>
        ) : <>
          <section className="tf-card p-6" aria-labelledby="tracking-headline">
            <p className="tf-num text-sm text-[var(--tf-text-subtle)]">Orden {data.orderNumber}</p>
            <h1 id="tracking-headline" className="mt-2 text-2xl font-semibold tracking-tight">{data.statusHeadline || data.statusLabel}</h1>
            {data.statusMessage && <p className="mt-2 text-base leading-relaxed text-[var(--tf-text-muted)]">{data.statusMessage}</p>}
            <dl className="mt-6 grid gap-4 border-t border-[var(--tf-border)] pt-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Equipo</dt><dd className="mt-1">{device}{data.device?.color ? `, ${data.device.color}` : ''}</dd></div>
              {data.device?.maskedImei && <div><dt className="text-xs text-[var(--tf-text-subtle)]">IMEI</dt><dd className="tf-num mt-1">{data.device.maskedImei}</dd></div>}
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Recibido</dt><dd className="mt-1">{formatDate(data.receivedAt)}</dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">{data.deliveredAt ? 'Entregado' : 'Entrega estimada'}</dt><dd className="mt-1">{data.deliveredAt ? formatDate(data.deliveredAt) : data.estimatedDeliveryAt ? formatDateTime(data.estimatedDeliveryAt) : 'El taller te confirmará la fecha'}</dd></div>
            </dl>
          </section>

          <section className="tf-card p-6" aria-labelledby="tracking-steps">
            <h2 id="tracking-steps" className="text-base font-semibold">Avance</h2>
            <ol className="mt-4 space-y-0">
              {(data.timeline ?? []).map((step, index, steps) => {
                const isCurrent = step.status === data.status
                const done = step.reached && !isCurrent
                return (
                  <li key={step.status} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 pb-6 last:pb-0" aria-current={isCurrent ? 'step' : undefined}>
                    {index < steps.length - 1 && <span aria-hidden="true" className={`absolute left-[0.6875rem] top-6 bottom-0 w-0.5 ${done ? 'bg-[var(--tf-primary)]' : 'bg-[var(--tf-border-strong)]'}`} />}
                    <span aria-hidden="true" className={`relative z-[1] grid h-6 w-6 place-items-center rounded-full border-2 ${done ? 'border-[var(--tf-primary)] bg-[var(--tf-primary)] text-white' : isCurrent ? 'border-[var(--tf-accent)] bg-[var(--tf-surface)] shadow-[0_0_0_4px_var(--tf-accent-soft)]' : 'border-[var(--tf-border-strong)] bg-[var(--tf-surface)]'}`}>
                      {done && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={`text-sm font-medium ${isCurrent ? 'text-[var(--tf-text)]' : step.reached ? 'text-[var(--tf-text-muted)]' : 'text-[var(--tf-text-subtle)]'}`}>{step.label}{isCurrent && <span className="sr-only"> (estado actual)</span>}</p>
                      {step.at && <p className="text-xs text-[var(--tf-text-subtle)]">{formatDateTime(step.at)}</p>}
                      {step.publicMessage && <p className="mt-1 text-sm text-[var(--tf-text-muted)]">{step.publicMessage}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {data.warranty && (
            <section className="tf-card flex items-start gap-4 p-6" aria-label="Garantía">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--tf-success)]" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Garantía {data.warranty.status === 'activa' ? 'vigente' : data.warranty.status}</h2>
                <p className="mt-1 text-sm text-[var(--tf-text-muted)]">{data.warranty.serviceDescription || 'Servicio de reparación'}, válida hasta el {formatDate(data.warranty.expiresAt)}.</p>
              </div>
            </section>
          )}

          <p className="text-center text-sm text-[var(--tf-text-subtle)]">¿Dudas? Comunícate con el taller y menciona tu orden {data.orderNumber}.</p>
        </>}
      </div>
    </main>
  )
}
