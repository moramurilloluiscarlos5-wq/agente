import { useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, LoaderCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'
import { supabase } from '../services/supabase.js'
import { workspaceDestination } from '../utils/workspace.js'

const inputClass = 'ct-input mt-2'
const panelClass = 'w-full max-w-2xl rounded-[16px] border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-10'

export default function RegisterWorkshop() {
  const { status, profile, refreshProfile, logout } = useAuth()
  const { pathname } = useLocation()
  const existingUser = pathname === '/crear-taller'
  const inFlight = useRef(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm_password: '', workshop_name: '', workshop_phone: '', workshop_city: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current) return
    setError('')
    if (!form.workshop_name.trim()) return setError('Ingresa el nombre de tu taller.')
    if (!existingUser && form.password !== form.confirm_password) return setError('Las contraseñas no coinciden.')
    inFlight.current = true
    setLoading(true)
    try {
      const payload = existingUser
        ? { workshop_name: form.workshop_name, workshop_phone: form.workshop_phone, workshop_city: form.workshop_city }
        : form
      const { data } = await api.post(existingUser ? '/auth/create-workshop' : '/auth/register-workshop', payload)
      setCreated(data)
      if (!existingUser) {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
        if (loginError) throw new Error('Tu taller se creó. Inicia sesión para continuar.')
      }
      await refreshProfile()
      setForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (requestError) {
      if (requestError.code === 'REGISTRATION_COMMITTED') setCreated({ workshop: { name: form.workshop_name } })
      setError(requestError.message || 'No se pudo crear el taller. Intenta de nuevo.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  if (!created && status === 'authenticated' && (!existingUser || profile?.workshop_id || profile?.role === 'SUPER_ADMIN')) {
    return <Navigate to={workspaceDestination(profile)} replace />
  }
  const ready = status === 'authenticated' && profile?.workshop?.status === 'ACTIVE'
  const field = (name, label, type = 'text', maxLength, required = false, autoComplete) => (
    <label className="block text-sm text-slate-300" key={name}>
      {label}<input name={name} type={type} value={form[name]} onChange={change} className={inputClass}
        maxLength={maxLength} minLength={type === 'password' ? 8 : undefined} required={required} autoComplete={autoComplete} />
    </label>
  )

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section className={panelClass}>
        {created ? <div className="text-center">
          <CheckCircle2 size={42} className="mx-auto text-emerald-300" />
          <h1 className="mt-5 text-2xl font-semibold">¡Tu taller está listo!</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{created.workshop?.name} ya tiene su configuración inicial y tu cuenta quedó como propietario.</p>
          {loading && <p role="status" className="mt-4 text-sm text-slate-400">Preparando tu sesión…</p>}
          {error && <p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}
          {!loading && <div className="mt-7 flex flex-col justify-center gap-3">
            {ready ? <>
              <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950">Ir al Dashboard <ArrowRight size={16} /></Link>
              <Link to="/clientes" className="rounded-xl border border-slate-700 px-5 py-3 text-sm">Registrar primer cliente</Link>
              <Link to="/personal" className="rounded-xl border border-slate-700 px-5 py-3 text-sm">Invitar empleado</Link>
            </> : <Link to="/login" className="text-cyan-300">Iniciar sesión</Link>}
          </div>}
        </div> : <>
          <div className="flex items-center gap-3">
            <Building2 size={32} className="text-cyan-300" />
            <div><p className="text-xs font-semibold tracking-widest text-cyan-300">CARLOSTECH AI</p><h1 className="mt-1 text-2xl font-semibold">{existingUser ? 'Crea tu taller' : 'Registra tu taller gratis'}</h1></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">{existingUser ? 'Tu cuenta está lista. Completa los datos del taller para entrar a tu espacio de trabajo.' : 'Crea tu cuenta y comienza a gestionar tu taller.'}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">¿Tu taller ya utiliza CARLOSTECH AI? Solicita tu acceso al administrador del taller.</p>
          <form onSubmit={submit} className="mt-8 space-y-6">
            <fieldset disabled={loading || status === 'loading'} className="space-y-6">
              {!existingUser && <section aria-label="Datos del propietario">
                <h2 className="mb-4 text-sm font-semibold text-slate-200">Datos del propietario</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('full_name', 'Nombre completo', 'text', 150, true, 'name')}
                  {field('email', 'Correo', 'email', 254, true, 'email')}
                  {field('password', 'Contraseña', 'password', 128, true, 'new-password')}
                  {field('confirm_password', 'Confirmar contraseña', 'password', 128, true, 'new-password')}
                </div>
              </section>}
              <section aria-label="Datos del taller">
                <h2 className="mb-4 text-sm font-semibold text-slate-200">Datos del taller</h2>
                {field('workshop_name', 'Nombre del taller', 'text', 120, true, 'organization')}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {field('workshop_phone', 'Teléfono opcional', 'tel', 40, false, 'tel')}
                  {field('workshop_city', 'Ciudad opcional', 'text', 200)}
                </div>
              </section>
              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3.5 text-sm font-semibold text-slate-950 disabled:opacity-60">
                {loading && <LoaderCircle size={17} className="animate-spin" />}{loading ? 'Creando taller…' : 'Crear mi taller'}
              </button>
            </fieldset>
          </form>
          {existingUser ? <button type="button" onClick={logout} className="mt-6 text-sm text-slate-400">Cerrar sesión</button>
            : <p className="mt-6 text-center text-sm text-slate-500">¿Ya tienes cuenta? <Link to="/login" className="text-cyan-300">Inicia sesión</Link></p>}
        </>}
      </section>
    </main>
  )
}
