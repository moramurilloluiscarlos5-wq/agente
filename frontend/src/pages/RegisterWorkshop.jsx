import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'
import BuySteps from '../components/auth/BuySteps.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'
import { supabase } from '../services/supabase.js'
import { workspaceDestination } from '../utils/workspace.js'
import { daysText, formatPrice, TIER_NAMES } from '../utils/billing.js'

function registrationError(error, existingUser, accountCreated) {
  if (accountCreated || error.code === 'REGISTRATION_COMMITTED') return 'Tu taller se creó. Inicia sesión para continuar.'
  if (error.status === 409) {
    return existingUser
      ? 'Tu cuenta ya pertenece a un taller. Inicia sesión para acceder.'
      : 'Ya existe una cuenta con este correo. Inicia sesión para continuar.'
  }
  if (error.code === 'API_OFFLINE') return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
  if (error.code === 'API_TIMEOUT') return 'El servidor está tardando en responder. Inténtalo de nuevo en unos momentos.'
  if (error.status === 429) return 'Se han realizado varios intentos. Espera unos minutos antes de volver a intentarlo.'
  if (error.status === 401 || error.status === 403) return 'Tu sesión ha caducado. Inicia sesión de nuevo para continuar.'
  return 'No pudimos crear tu taller. Revisa los datos e inténtalo de nuevo.'
}

export default function RegisterWorkshop() {
  const { status, profile, refreshProfile, logout } = useAuth()
  const { pathname } = useLocation()
  const existingUser = pathname === '/crear-taller'
  // Paso 2 de la compra: el plan elegido en Precios viaja en ?plan= hasta el pago.
  const [params] = useSearchParams()
  const planCode = params.get('plan')
  const [plan, setPlan] = useState(null)
  // Sin plan elegido hay que saber si las licencias están activas: apagadas, el registro sigue libre.
  const [licensing, setLicensing] = useState(planCode || existingUser ? 'on' : null)
  const inFlight = useRef(false)
  const noticeRef = useRef(null)
  const successRef = useRef(null)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm_password: '', workshop_name: '', workshop_phone: '', workshop_city: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Crea tu taller · TallerFlow'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!planCode && existingUser) return undefined
    let active = true
    api.get('/billing/plans').then((response) => {
      if (!active) return
      setLicensing(response.disabled ? 'off' : 'on')
      if (planCode) setPlan((response.data ?? []).find((item) => item.code === planCode) ?? null)
    }).catch(() => { if (active && !planCode) setLicensing('off') })
    return () => { active = false }
  }, [planCode, existingUser])

  useEffect(() => {
    if (error) noticeRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (created) successRef.current?.focus()
  }, [created])

  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '', ...(name === 'password' ? { confirm_password: '' } : {}) }))
  }

  function invalidField(name, message) {
    setFieldErrors({ [name]: message })
    document.getElementById('register-' + name)?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current) return
    setError('')
    setFieldErrors({})
    if (!existingUser && !form.full_name.trim()) return invalidField('full_name', 'Ingresa tu nombre completo.')
    if (!form.workshop_name.trim()) return invalidField('workshop_name', 'Ingresa el nombre de tu taller.')
    if (!existingUser && form.password !== form.confirm_password) return invalidField('confirm_password', 'Las contraseñas no coinciden.')
    inFlight.current = true
    setLoading(true)
    let accountCreated = false
    try {
      const payload = existingUser
        ? { workshop_name: form.workshop_name, workshop_phone: form.workshop_phone, workshop_city: form.workshop_city }
        : form
      const { data } = await api.post(existingUser ? '/auth/create-workshop' : '/auth/register-workshop', payload)
      accountCreated = true
      setCreated(data)
      if (!existingUser) {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
        if (loginError) throw new Error('Tu taller se creó. Inicia sesión para continuar.')
      }
      await refreshProfile()
      setForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (requestError) {
      if (requestError.code === 'REGISTRATION_COMMITTED') setCreated({ workshop: { name: form.workshop_name } })
      setError(registrationError(requestError, existingUser, accountCreated))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  if (!created && status === 'authenticated' && (!existingUser || profile?.workshop_id || profile?.role === 'SUPER_ADMIN')) {
    return <Navigate to={workspaceDestination(profile)} replace />
  }
  // Una cuenta nueva solo se crea comprando una licencia: sin plan elegido, primero los planes.
  if (!existingUser && !planCode && !created) {
    if (licensing === null) return <AuthLayout variant="register"><p role="status" className="ct-auth-heading"><LoaderCircle size={20} className="animate-spin" aria-label="Cargando" /></p></AuthLayout>
    if (licensing === 'on') return <Navigate to="/precios" replace />
  }
  // Taller creado y sin licencia activa: paso 3, el pago del plan elegido.
  if (created && planCode && !loading && profile?.license?.allowed === false) {
    return <Navigate to={`/facturacion?plan=${encodeURIComponent(planCode)}`} replace />
  }
  const ready = status === 'authenticated' && profile?.workshop?.status === 'ACTIVE'

  return (
    <AuthLayout variant="register">
      {created ? (
        <div className="ct-auth-success">
          <CheckCircle2 size={36} strokeWidth={1.5} aria-hidden="true" />
          <header className="ct-auth-heading">
            <p className="ct-auth-eyebrow">Registro completado</p>
            <h1 ref={successRef} tabIndex={-1}>Tu taller está listo</h1>
            <p>{created.workshop?.name} ya tiene su configuración inicial. Tu cuenta tiene acceso como propietario.{profile?.license?.status === 'trialing' ? ` Tu prueba gratuita de ${daysText(profile.license.days_left)} ya empezó, con todo incluido.` : ''}</p>
          </header>
          {loading && <p role="status" className="ct-auth-notice ct-auth-notice--info"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Preparando tu sesión…</p>}
          {error && <p ref={noticeRef} tabIndex={-1} role="alert" className="ct-auth-notice ct-auth-notice--info">{error}</p>}
          {!loading && (
            <div className="ct-auth-form">
              {ready && planCode ? (
                <>
                  {/* Con prueba gratis el taller ya entra, pero el plan elegido sigue esperando su pago (paso 3). */}
                  <Link to={`/facturacion?plan=${encodeURIComponent(planCode)}`} className="ct-auth-primary">Continuar al pago <ArrowRight size={16} aria-hidden="true" /></Link>
                  <Link to="/dashboard" className="ct-auth-secondary">Ir a mi taller</Link>
                </>
              ) : ready ? (
                <>
                  <Link to="/dashboard" className="ct-auth-primary">Ir a mi taller <ArrowRight size={16} aria-hidden="true" /></Link>
                  <Link to="/clientes" className="ct-auth-secondary">Registrar primer cliente</Link>
                  <Link to="/personal" className="ct-auth-link">Invitar a mi equipo</Link>
                </>
              ) : <Link to="/login" className="ct-auth-primary">Iniciar sesión <ArrowRight size={16} aria-hidden="true" /></Link>}
            </div>
          )}
        </div>
      ) : (
        <>
          {!existingUser && planCode && <BuySteps current={1} />}
          <header className="ct-auth-heading">
            <h1>Crea tu taller en TallerFlow</h1>
            <p>{existingUser
              ? 'Tu cuenta está lista. Completa los datos del taller para entrar a tu espacio de trabajo.'
              : 'Configura tu espacio de trabajo y comienza a gestionar reparaciones, clientes y equipos.'}</p>
          </header>

          {plan && (
            <div className="ct-buy-plan">
              <div><span>Plan elegido</span><strong>{TIER_NAMES[plan.tier] ?? plan.name} · {formatPrice(plan.price_cents, plan.currency)} {plan.interval === 'year' ? 'al año' : 'al mes'}</strong></div>
              <Link to="/precios" className="ct-auth-link">Cambiar</Link>
            </div>
          )}

          <form onSubmit={submit} className="ct-auth-form" aria-busy={loading}>
            <fieldset disabled={loading || status === 'loading'} className="ct-auth-fieldset">
              {!existingUser && (
                <section className="ct-auth-section" aria-labelledby="owner-details-title">
                  <h2 id="owner-details-title">Datos del propietario</h2>
                  <div className="ct-auth-fields">
                    <AuthField id="register-full_name" name="full_name" label="Nombre completo" value={form.full_name} onChange={change}
                      maxLength={150} required autoComplete="name" placeholder="Tu nombre y apellido" error={fieldErrors.full_name} />
                    <AuthField id="register-email" name="email" label="Correo electrónico" type="email" value={form.email} onChange={change}
                      maxLength={254} required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="nombre@taller.com" />
                    <AuthField id="register-password" name="password" label="Contraseña" type="password" value={form.password} onChange={change}
                      minLength={8} maxLength={128} required autoComplete="new-password" hint="Usa al menos 8 caracteres." />
                    <AuthField id="register-confirm_password" name="confirm_password" label="Confirmar contraseña" type="password" value={form.confirm_password} onChange={change}
                      minLength={8} maxLength={128} required autoComplete="new-password" error={fieldErrors.confirm_password} />
                  </div>
                </section>
              )}

              <section className="ct-auth-section" aria-labelledby="workshop-details-title">
                <h2 id="workshop-details-title">Datos del taller</h2>
                <div className="ct-auth-fields">
                  <div className="ct-auth-field-wide">
                    <AuthField id="register-workshop_name" name="workshop_name" label="Nombre del taller" value={form.workshop_name} onChange={change}
                      maxLength={120} required autoComplete="organization" placeholder="El nombre de tu negocio" error={fieldErrors.workshop_name} />
                  </div>
                  <AuthField id="register-workshop_phone" name="workshop_phone" label="Teléfono (opcional)" type="tel" value={form.workshop_phone} onChange={change}
                    maxLength={40} autoComplete="tel" />
                  <AuthField id="register-workshop_city" name="workshop_city" label="Ciudad (opcional)" value={form.workshop_city} onChange={change}
                    maxLength={200} autoComplete="address-level2" />
                </div>
              </section>

              {error && <p ref={noticeRef} tabIndex={-1} role="alert" className="ct-auth-notice ct-auth-notice--error">{error}</p>}
              <button type="submit" className="ct-auth-primary" disabled={loading || status === 'loading'}>
                {loading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                {loading ? 'Creando taller…' : planCode ? 'Crear mi taller y continuar al pago' : 'Crear mi taller'}
                {!loading && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </fieldset>
            <span className="sr-only" role="status">{loading ? 'Creando tu taller. Espera un momento.' : ''}</span>
          </form>

          <div className="ct-auth-switch">
            {existingUser
              ? <button type="button" onClick={logout} className="ct-auth-link" disabled={loading}>Cerrar sesión</button>
              : <Link to="/login" className="ct-auth-link">Volver a iniciar sesión</Link>}
          </div>
        </>
      )}
    </AuthLayout>
  )
}
