import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { workspaceDestination } from '../utils/workspace.js'
import { supabase } from '../services/supabase.js'
import loginHero from '../assets/login-hero.png'
import BrandLogo from '../components/branding/BrandLogo.jsx'

export default function Login() {
  const { isConfigured, status, profile, login, error, errorCode } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [resending, setResending] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState(null)
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Iniciar sesión | CARLOSTECH AI'
    return () => { document.title = previousTitle }
  }, [])

  const friendlyError = errorCode === 'email_not_confirmed'
    ? error
    : formError || (/invalid|credential|password|usuario/i.test(error ?? '') ? 'Correo o contraseña incorrectos.' : error)

  const resendConfirmation = async () => {
    if (!supabase || resending || loading) return
    setFormError(null)
    setConfirmationMessage(null)
    if (!email.trim()) {
      setFormError('Ingresa tu correo para reenviar la confirmación.')
      return
    }
    setResending(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
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
      setResending(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return
    setFormError(null)
    setConfirmationMessage(null)

    if (!email.trim() || !password) {
      setFormError('Ingresa tu correo y contraseña.')
      return
    }

    setLoading(true)
    try {
      const result = await login(email, password)
      if (result?.ok) navigate(workspaceDestination(result.profile), { replace: true })
    } catch {
      setFormError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'authenticated') return <Navigate to={workspaceDestination(profile)} replace />

  return (
    <div className="ct-login-shell min-h-screen overflow-hidden bg-[#050b15] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.35fr_0.9fr]">
        <section className="ct-login-visual relative hidden overflow-hidden px-10 py-10 lg:flex xl:px-16" aria-label="Presentación de CARLOSTECH AI">
          <div className="ct-login-image absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, rgba(3, 11, 25, 0.28) 0%, rgba(3, 11, 25, 0.48) 52%, rgba(3, 11, 25, 0.82) 100%), url(${loginHero})` }} />
          <div className="ct-login-grid absolute inset-0 opacity-50" />
          <div className="ct-login-orb ct-login-orb-one absolute -left-32 top-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="ct-login-orb ct-login-orb-two absolute bottom-[-8rem] right-[-5rem] h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative z-10 flex w-full max-w-3xl flex-col">
            <BrandLogo variant="compact" size="lg" priority />
            <div className="my-auto max-w-2xl py-16 xl:py-20">
              <p className="mb-5 text-[10px] font-semibold tracking-[0.36em] text-cyan-300/75">OPERATIONS PLATFORM <span className="mx-2 text-slate-600">/</span> 01</p>
              <h2 className="max-w-xl text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.025em] text-white xl:text-[4.15rem]">Control técnico.<br /><span className="ct-login-gradient">Decisiones inteligentes.</span></h2>
              <p className="mt-7 max-w-md text-[15px] leading-7 text-slate-300/80">Gestiona reparaciones, clientes, diagnósticos y operaciones desde una sola plataforma.</p>
              <div className="ct-login-trust mt-12 flex max-w-xl items-center gap-4 border-t border-white/[0.1] pt-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200"><ShieldCheck size={17} /></span><div><p className="text-xs font-medium tracking-wide text-slate-200">Acceso seguro</p><p className="mt-1 text-[11px] text-slate-500">Cada taller tiene su propio espacio</p></div><span className="ml-2 h-1 w-1 rounded-full bg-cyan-300/60" /><span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Control operativo</span></div>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-600">CARLOSTECH AI <span className="mx-2 text-cyan-500/50">/</span> Sistema interno de gestión técnica</p>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
          <div className="ct-login-panel w-full max-w-[30rem] rounded-[30px] border border-white/[0.1] bg-slate-900/60 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-10">
            <div className="ct-login-panel-topline"><span className="ct-login-status-dot" /> ESPACIO DE TRABAJO PRIVADO</div>
            <div className="mb-8 mt-7 flex justify-center"><BrandLogo variant="symbol" size="lg" priority /></div>
            <div className="mb-7 border-t border-white/[0.08] pt-6"><h1 className="text-xl font-semibold tracking-tight text-white">Bienvenido de nuevo</h1><p className="mt-2 text-sm leading-6 text-slate-400">Accede a tu plataforma de gestión técnica.</p></div>

            {!isConfigured && <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-200"><p className="font-semibold">Supabase no está configurado.</p><p className="mt-1">Agrega las variables de Supabase en <code className="rounded bg-slate-800 px-1">frontend/.env</code> y reinicia el servidor.</p></div>}

            {<> 
              <form onSubmit={handleSubmit} className="space-y-6">
                <div><label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="login-email">Correo electrónico</label><div className="ct-login-input-wrap"><Mail size={17} aria-hidden="true" /><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@ejemplo.com" className="ct-login-input" /></div></div>
                <div><label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="login-password">Contraseña</label><div className="ct-login-input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="ct-login-input pr-10" /><button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-3 text-slate-500 transition hover:text-cyan-300" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
                <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400" />Recordarme</label><button type="button" disabled className="text-xs text-slate-600" title="La recuperación de contraseña aún no está habilitada">¿Olvidaste tu contraseña?</button></div>
                {friendlyError && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-3 py-3 text-xs leading-relaxed text-red-300"><LockKeyhole size={14} className="mt-0.5 shrink-0" />{friendlyError}</p>}
                <button type="submit" disabled={loading || resending} className="ct-login-submit group inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition duration-200 disabled:cursor-not-allowed disabled:opacity-60">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />}{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}{!loading && <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />}</button>
                <p className="ct-login-secure-note flex items-center justify-center gap-2 text-[11px] text-slate-500"><LockKeyhole size={13} className="text-cyan-300/70" /> Acceso seguro para personal autorizado</p>
              </form>
              {errorCode === 'email_not_confirmed' && <button type="button" onClick={resendConfirmation} disabled={resending || loading || Boolean(confirmationMessage)} className="mt-4 w-full rounded-xl border border-cyan-500/30 px-3 py-2.5 text-xs text-cyan-300 transition hover:bg-cyan-400/[0.06] disabled:opacity-60">{resending ? 'Enviando…' : 'Reenviar correo de confirmación'}</button>}
              {confirmationMessage && <p role="status" className="mt-4 text-center text-xs leading-relaxed text-emerald-300">{confirmationMessage}</p>}
              <div className="mt-9 flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-slate-600"><span className="h-px flex-1 bg-slate-800" />o<span className="h-px flex-1 bg-slate-800" /></div>
              <p className="mt-6 text-center text-xs text-slate-400">¿Aún no tienes una cuenta? <Link to="/registro" className="font-semibold text-cyan-300 hover:text-cyan-200">Registra tu taller gratis</Link></p>
              <p className="mt-2 text-center text-[11px] text-slate-500">¿Tu taller ya utiliza CARLOSTECH AI? Solicita tu acceso al administrador.</p>
            </>}
          </div>
        </main>
      </div>
    </div>
  )
}
