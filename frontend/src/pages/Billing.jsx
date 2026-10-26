import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import LicenseCard from '../components/billing/LicenseCard.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { Alert, Button, ConfirmDialog, Dialog, ErrorAlert, Input } from '../components/ui/DesignSystem.jsx'
import { FEATURE_LABELS, TIER_NAMES, TIER_RANK, formatPrice, goToCheckout } from '../utils/billing.js'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'

const PAID = ['active', 'past_due']
const longDate = (value) => (value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null)
const planLabel = (plan) => `${TIER_NAMES[plan.tier] ?? plan.name} ${plan.interval === 'year' ? 'anual' : 'mensual'}`

export default function Billing() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { profile, user, refreshProfile } = useAuth()
  const toast = useToast()
  const [plans, setPlans] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [dialog, setDialog] = useState(null) // { mode: 'checkout' | 'change' | 'interval', plan }
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payerEmail, setPayerEmail] = useState(user?.email ?? '')
  const [busy, setBusy] = useState(false)
  // false mientras Mercado Pago no esté configurado en el servidor: se ven los planes, pero aún no se contratan.
  const [paymentsReady, setPaymentsReady] = useState(true)
  const message = location.state?.licenseMessage
  const isOwner = profile?.role === 'OWNER'

  useEffect(() => {
    api.get('/billing/plans').then((response) => { setPlans(response.data); setPaymentsReady(response.payments_ready !== false) }).catch((err) => setError({ err, action: 'cargar los planes' }))
  }, [])

  // Tras volver de Mercado Pago la notificación puede tardar unos segundos en activar la licencia.
  const success = params.get('checkout') === 'success'
  const pending = success && subscription && subscription.status !== 'active'
  useEffect(() => {
    if (!pending) return undefined
    const timer = setTimeout(() => setReloadKey((key) => key + 1), 3000)
    return () => clearTimeout(timer)
  }, [pending, reloadKey])
  // Al activarse, el menú debe reflejar lo que incluye el plan nuevo (una sola vez).
  const refreshed = useRef(false)
  useEffect(() => {
    if (!success || subscription?.status !== 'active' || refreshed.current) return
    refreshed.current = true
    refreshProfile?.().catch(() => {})
  }, [success, subscription?.status, refreshProfile])

  const disabled = subscription?.disabled === true
  const paid = Boolean(subscription?.has_billing_account && PAID.includes(subscription.status) && !subscription.cancel_at_period_end)
  const currentPlan = paid ? subscription.plan : null

  // Desde Precios llega ?plan=código: se abre la confirmación de ese plan hasta que la persona la cierre.
  const requestedPlan = paymentsReady && subscription && !disabled && !paid ? plans.find((item) => item.code === params.get('plan')) : null
  const activeDialog = dialog ?? (requestedPlan ? { mode: 'checkout', plan: requestedPlan } : null)
  // Estable entre renders: el diálogo reenfoca su primer campo cuando cambia onClose.
  const closeDialog = useCallback(() => {
    setDialog(null)
    if (params.get('plan')) setParams((current) => { const next = new URLSearchParams(current); next.delete('plan'); return next }, { replace: true })
  }, [params, setParams])

  const actionFor = (plan) => {
    const tier = TIER_NAMES[plan.tier] ?? plan.name
    if (currentPlan?.code === plan.code) return { label: 'Tu plan actual', disabled: true, current: true }
    if (paid) return isOwner && paymentsReady
      ? { label: `Cambiar a ${tier}`, onClick: () => setDialog({ mode: currentPlan?.interval === plan.interval && TIER_RANK[plan.tier] < TIER_RANK[currentPlan?.tier] ? 'change' : 'interval', plan }) }
      : { label: `Cambiar a ${tier}`, disabled: true }
    return paymentsReady ? { label: `Contratar ${tier}`, onClick: () => setDialog({ mode: 'checkout', plan }) } : { label: `Contratar ${tier}`, disabled: true }
  }

  async function confirmDialog() {
    if (!activeDialog) return
    const { mode, plan } = activeDialog
    setBusy(true); setError(null)
    try {
      if (mode === 'change') {
        await api.post('/billing/change-plan', { plan: plan.code })
        toast.success(`Listo. Tu plan ahora es ${TIER_NAMES[plan.tier]}.`)
        closeDialog(); setReloadKey((key) => key + 1)
        await refreshProfile?.().catch(() => {})
      } else {
        await goToCheckout(mode === 'interval' ? '/billing/change-plan' : '/billing/checkout', { plan: plan.code, payer_email: payerEmail.trim() || undefined })
        return // la página se va a Mercado Pago
      }
    } catch (err) {
      setError({ err, action: mode === 'change' ? 'cambiar el plan' : 'abrir el pago de Mercado Pago' })
      closeDialog()
    }
    setBusy(false)
  }

  async function cancelSubscription() {
    setBusy(true); setError(null)
    try {
      const response = await api.post('/billing/cancel', {})
      setCancelOpen(false)
      toast.success(`Cancelamos tu suscripción. Conservas el acceso hasta el ${longDate(response.data?.current_period_end) ?? 'final del periodo pagado'}.`)
      setReloadKey((key) => key + 1)
      await refreshProfile?.().catch(() => {})
    } catch (err) { setError({ err, action: 'cancelar la suscripción' }) }
    setCancelOpen(false); setBusy(false)
  }

  const dialogPlan = activeDialog?.plan
  const opensCheckout = activeDialog && activeDialog.mode !== 'change'
  // Al bajar de plan: funciones que se pierden y usuarios por encima del nuevo límite.
  const currentFeatures = plans.find((plan) => plan.code === currentPlan?.code)?.features ?? []
  const lostFeatures = dialogPlan && currentPlan ? currentFeatures.filter((feature) => !dialogPlan.features.includes(feature)).map((feature) => FEATURE_LABELS[feature] ?? feature) : []
  const activeUsers = subscription?.usage?.active_users ?? 0
  const overSeats = dialogPlan && dialogPlan.max_users != null && activeUsers > dialogPlan.max_users
  const nextCharge = longDate(subscription?.current_period_end)

  return (
    <div className="space-y-6" data-mp-subscriptions-page="without-plan-pending">
      <PageHeader title="Facturación" description="Tu plan de TallerFlow, su estado y los pagos con Mercado Pago." />
      {message && <div role="alert" className="tf-alert tf-alert-warning max-w-3xl">{message}</div>}
      {success && <Alert tone={pending ? 'info' : 'success'} className="max-w-3xl">{pending ? 'Pago recibido. Estamos activando tu licencia con Mercado Pago…' : 'Listo, tu licencia está activa.'}</Alert>}
      {error && <ErrorAlert error={error.err} action={error.action} className="max-w-3xl" />}
      {!paymentsReady && !disabled && <Alert tone="info" className="max-w-3xl" title="Mercado Pago todavía no está conectado">Puedes revisar los planes; podrás contratarlos en cuanto se configure Mercado Pago en el servidor.</Alert>}
      <LicenseCard key={reloadKey} onLoaded={setSubscription} />
      {disabled && <section aria-label="Licencias desactivadas" className="tf-card max-w-3xl p-6"><h2 className="text-base font-semibold text-[var(--tf-text)]">Licencias desactivadas</h2><p className="mt-2 text-sm text-[var(--tf-text-muted)]">El cobro por suscripción todavía no está activado. Tu taller tiene acceso completo y no necesitas pagar nada.</p></section>}

      {!disabled && subscription && plans.length > 0 && (
        <section aria-label="Planes disponibles" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--tf-text)]">{paid ? 'Cambiar de plan' : 'Elige tu plan'}</h2>
              <p className="mt-1 text-sm text-[var(--tf-text-muted)]">{paid ? (isOwner ? 'El cambio entre planes con el mismo cobro es inmediato; el nuevo monto se cobra desde tu próximo pago.' : 'Solo el dueño del taller puede cambiar o cancelar el plan.') : 'Pagas con tarjeta en Mercado Pago y la licencia se activa en cuanto se confirma el pago.'}</p>
            </div>
            <p className="flex items-center gap-2 text-xs text-[var(--tf-text-subtle)]"><ShieldCheck size={14} aria-hidden="true" />TallerFlow no guarda los datos de tu tarjeta.</p>
          </div>
          <PlanCards plans={plans} actionFor={actionFor} initialInterval={currentPlan?.interval ?? 'month'} />
          {paid && isOwner && (
            <div className="tf-card flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-[var(--tf-text-muted)]">¿Ya no necesitas TallerFlow? Al cancelar conservas el acceso hasta {nextCharge ? `el ${nextCharge}` : 'el final del periodo pagado'}.</p>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancelar suscripción</Button>
            </div>
          )}
        </section>
      )}

      <Dialog open={Boolean(activeDialog)} title={dialogPlan ? (activeDialog.mode === 'checkout' ? `Contratar ${planLabel(dialogPlan)}` : `Cambiar a ${planLabel(dialogPlan)}`) : ''} onClose={busy ? undefined : closeDialog}
        footer={<>
          <Button onClick={closeDialog} disabled={busy}>Volver</Button>
          {/* La única acción que crea la suscripción en Mercado Pago (contrato "sin plan, pago pendiente"). */}
          {opensCheckout
            ? <Button variant="primary" busy={busy} onClick={confirmDialog} data-mp-subscription-cta="without-plan-pending" disabled={payerEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())}>Ir a pagar con Mercado Pago</Button>
            : <Button variant="primary" busy={busy} onClick={confirmDialog}>{`Cambiar a ${TIER_NAMES[dialogPlan?.tier] ?? ''}`}</Button>}
        </>}>
        {dialogPlan && <div className="space-y-4 text-sm leading-relaxed text-[var(--tf-text-muted)]">
          <p className="text-base font-semibold text-[var(--tf-text)] tf-num">{formatPrice(dialogPlan.price_cents, dialogPlan.currency)} {dialogPlan.interval === 'year' ? 'al año' : 'al mes'}</p>
          {activeDialog.mode === 'change' && <p>Tu plan cambia a {TIER_NAMES[dialogPlan.tier]} ahora mismo. {nextCharge ? `Desde tu próximo cobro, el ${nextCharge}, ` : 'Desde tu próximo cobro '}pagarás {formatPrice(dialogPlan.price_cents, dialogPlan.currency)} {dialogPlan.interval === 'year' ? 'al año' : 'al mes'}.</p>}
          {activeDialog.mode === 'interval' && <p>Te llevamos a Mercado Pago para pagar el plan {TIER_NAMES[dialogPlan.tier]} {dialogPlan.interval === 'year' ? 'anual' : 'mensual'}. En cuanto se confirme el pago se activa y cancelamos tu plan actual para que no se cobre doble.</p>}
          {activeDialog.mode === 'checkout' && <p>Te llevamos a Mercado Pago para pagar con tarjeta. La licencia se activa en cuanto se confirma el pago{subscription?.status === 'trialing' ? '; tu prueba gratuita termina al contratar' : ''}.</p>}
          {(lostFeatures.length > 0 || overSeats) && <Alert tone="warning" title={`Lo que cambia con ${TIER_NAMES[dialogPlan.tier]}`}>
            <ul className="list-disc space-y-1 pl-4">
              {lostFeatures.length > 0 && <li>Dejarás de tener: {lostFeatures.join(', ')}.</li>}
              {overSeats && <li>Tienes {activeUsers} usuarios activos y {TIER_NAMES[dialogPlan.tier]} permite {dialogPlan.max_users}. Seguirán entrando, pero no podrás dar acceso a nadie más hasta quedar en {dialogPlan.max_users}.</li>}
            </ul>
          </Alert>}
          {opensCheckout && <Input label="Correo de tu cuenta de Mercado Pago" type="email" autoComplete="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} hint="Usa el correo con el que entras a Mercado Pago. Si lo dejas vacío usamos el de tu cuenta de TallerFlow." />}
        </div>}
      </Dialog>

      <ConfirmDialog open={cancelOpen} title={`¿Cancelar la suscripción de ${profile?.workshop?.name ?? 'tu taller'}?`}
        description={`Mercado Pago dejará de cobrarte. Conservas el acceso hasta ${nextCharge ? `el ${nextCharge}` : 'el final del periodo pagado'}; después el taller no podrá usar TallerFlow hasta contratar de nuevo.`}
        confirmLabel="Cancelar suscripción" cancelLabel="Mantener mi plan" busy={busy} onConfirm={cancelSubscription} onCancel={() => setCancelOpen(false)} />
    </div>
  )
}
