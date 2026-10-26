import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, CircleAlert, CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { workspaceDestination } from '../utils/workspace.js'
import { supabase } from '../services/supabase.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'

// Only the email is remembered; Supabase still manages session persistence.
const REMEMBERED_EMAIL_KEY = 'ct-login-remembered-email'

function rememberedEmail() {
  try { return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '' } catch { return '' }
}

function friendlyAuthError(error, code) {
  if (!error) return null
  if (code === 'email_not_confirmed') return 'Tu correo está pendiente de confirmación. Abre el enlace que recibiste o solicita uno nuevo.'
  if (/invalid|credential|password|usuario/i.test(error)) return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.'
  if (/rate|too many|429/i.test(error)) return 'Espera un momento antes de volver a iniciar sesión.'
  if (/fetch|network|conexión|conectar|servidor|responder/i.test(error)) return 'No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.'
  if (/inactiv|suspend|desactiv/i.test(error)) return 'Tu cuenta no tiene acceso en este momento. Contacta al administrador de tu taller.'
  return 'No pudimos iniciar sesión. Verifica tus datos e inténtalo de nuevo.'
}

export default function Login() {
  const { isConfigured, status, profile, login, error, errorCode } = useAuth()
  const navigate = useNavigate()
  const inFlight = useRef(false)
  const [email, setEmail] = useState(rememberedEmail)
  const [remember, setRemember] = useState(() => Boolean(rememberedEmail()))
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [resending, setResending] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState(null)
  const busy = loading || resending || resetting
  const friendlyError = formError || friendlyAuthError(error, errorCode)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Iniciar sesión | TallerFlow'
    return () => { document.title = previousTitle }
  }, [])

  const validateEmail = () => {
    const input = document.getElementById('login-email')
    const message = !email.trim() ? 'Ingresa tu correo electrónico.' : !input.validity.valid ? 'Ingresa un correo electrónico válido.' : null
    if (message) {
      setFieldErrors({ email: message })
      input.focus()
      return false
    }
    setFieldErrors({})
    return true
  }

  const resendConfirmation = async () => {
    if (!supabase || inFlight.current || busy) return
    setFormError(null)
    setConfirmationMessage(null)
    if (!validateEmail()) return
    inFlight.current = true
    setResending(true)
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (resendError) {
        setFormError(resendError.status === 429
          ? 'Espera un minuto antes de solicitar otro correo de confirmación.'
          : 'No se pudo reenviar la confirmación. Intenta más tarde o contacta al administrador.')
      } else {
        setConfirmationMessage('Solicitud enviada. Revisa tu bandeja de entrada y spam, confirma el correo y vuelve a iniciar sesión.')
      }
    } catch {
      setFormError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      inFlight.current = false
      setResending(false)
    }
  }

  const sendPasswordReset = async () => {
    if (!supabase || inFlight.current || busy) return
    setFormError(null)
    setConfirmationMessage(null)
    if (!validateEmail()) return
    inFlight.current = true
    setResetting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/restablecer-contrasena',
      })
      if (resetError) throw resetError
      setConfirmationMessage('Te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.')
    } catch {
      setFormError('No se pudo enviar el enlace. Verifica el correo e inténtalo de nuevo.')
    } finally {
      inFlight.current = false
      setResetting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (inFlight.current || busy || !isConfigured) return
    setFormError(null)
    setConfirmationMessage(null)
    if (!validateEmail()) return
    if (!password) {
      setFieldErrors({ password: 'Ingresa tu contraseña.' })
      document.getElementById('login-password').focus()
      return
    }
    inFlight.current = true
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result?.ok) {
        try {
          if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim())
          else localStorage.removeItem(REMEMBERED_EMAIL_KEY)
        } catch { /* Storage may be unavailable in private browsing. */ }
        navigate(workspaceDestination(result.profile), { replace: true })
      }
    } catch {
      setFormError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  if (status === 'authenticated') return <Navigate to={workspaceDestination(profile)} replace />

  return (
    <AuthLayout>
      <header className="ct-auth-heading">
        <h1>Iniciar sesión</h1>
        <p>Entra con el correo y la contraseña de tu taller.</p>
      </header>

      {!isConfigured && <p role="alert" className="ct-auth-notice ct-auth-notice--info">El acceso aún no está disponible. Contacta al administrador para completar la configuración.</p>}

      <form onSubmit={handleSubmit} className="ct-auth-form" noValidate aria-busy={busy}>
        <AuthField id="login-email" name="email" label="Correo electrónico" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          required value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: null })) }}
          placeholder="nombre@tutaller.com" error={fieldErrors.email} disabled={busy} />
        <AuthField id="login-password" name="password" label="Contraseña" type="password" autoComplete="current-password"
          required value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: null })) }}
          placeholder="Ingresa tu contraseña" error={fieldErrors.password} disabled={busy} />
        <div className="ct-auth-options">
          <label className="ct-auth-remember" htmlFor="login-remember">
            <input id="login-remember" type="checkbox" checked={remember} disabled={busy} aria-describedby="login-remember-hint" onChange={(event) => {
              setRemember(event.target.checked)
              if (!event.target.checked) { try { localStorage.removeItem(REMEMBERED_EMAIL_KEY) } catch { /* Optional preference. */ } }
            }} />
            Recordarme
          </label>
          <button type="button" onClick={sendPasswordReset} disabled={busy || !isConfigured} className="ct-auth-link">{resetting ? 'Enviando enlace…' : '¿Olvidaste tu contraseña?'}</button>
          <p id="login-remember-hint" className="ct-auth-hint">Guarda solo tu correo en este navegador.</p>
        </div>
        {friendlyError && !confirmationMessage && <p role="alert" className="ct-auth-notice ct-auth-notice--error"><CircleAlert size={17} aria-hidden="true" />{friendlyError}</p>}
        {confirmationMessage && <p role="status" className="ct-auth-notice ct-auth-notice--success"><CheckCircle2 size={17} aria-hidden="true" />{confirmationMessage}</p>}
        <button type="submit" disabled={busy || !isConfigured || status === 'loading'} className="ct-auth-primary">
          {loading && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
          {loading ? 'Iniciando sesión…' : status === 'loading' ? 'Comprobando sesión…' : 'Iniciar sesión'}
        </button>
        {errorCode === 'email_not_confirmed' && <button type="button" onClick={resendConfirmation} disabled={busy || Boolean(confirmationMessage)} className="ct-auth-secondary">{resending ? 'Enviando…' : 'Reenviar correo de confirmación'}</button>}
      </form>

      <div className="ct-auth-divider" aria-hidden="true">o</div>
      {/* El segundo camino: activar un taller nuevo comprando su licencia. */}
      <Link to="/precios" className="ct-auth-license">
        <span className="ct-auth-license-icon" aria-hidden="true"><KeyRound size={20} strokeWidth={2.2} /></span>
        <span className="ct-auth-license-text">
          <strong>Comprar licencia de activación</strong>
          <span>Elige tu plan, crea tu taller y paga con Mercado Pago.</span>
        </span>
        <ArrowRight size={18} className="ct-auth-license-arrow" aria-hidden="true" />
      </Link>
    </AuthLayout>
  )
}
