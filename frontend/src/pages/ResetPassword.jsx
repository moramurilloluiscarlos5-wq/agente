import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, LockKeyhole, LoaderCircle } from 'lucide-react'
import { supabase } from '../services/supabase.js'
import BrandLogo from '../components/branding/BrandLogo.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    document.title = 'Restablecer contraseña | CARLOSTECH AI'
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    if (!supabase) return setError('La autenticación no está configurada.')
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSaved(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (updateError) {
      setError(updateError.message || 'El enlace expiró. Solicita uno nuevo desde el inicio de sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-10">
        <div className="flex justify-center"><BrandLogo variant="symbol" size="lg" priority /></div>
        {saved ? <div className="mt-8 text-center"><CheckCircle2 size={42} className="mx-auto text-emerald-300" /><h1 className="mt-5 text-2xl font-semibold">Contraseña actualizada</h1><p className="mt-3 text-sm leading-6 text-slate-400">Ya puedes iniciar sesión con tu nueva contraseña.</p></div> : <>
          <h1 className="mt-8 text-2xl font-semibold">Restablecer contraseña</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Elige una contraseña nueva para tu cuenta.</p>
          <form onSubmit={submit} className="mt-7 space-y-5">
            <label className="block text-sm text-slate-300">Nueva contraseña<div className="relative mt-2"><LockKeyhole size={17} className="absolute left-3 top-3 text-slate-500" /><input autoFocus required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="ct-input w-full pl-10 pr-10" autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-slate-500" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <label className="block text-sm text-slate-300">Confirmar contraseña<input required minLength={8} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="ct-input mt-2 w-full" autoComplete="new-password" /></label>
            {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{loading && <LoaderCircle size={17} className="animate-spin" />}{loading ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500"><Link to="/login" className="text-cyan-300">Volver al inicio de sesión</Link></p>
        </>}
      </section>
    </main>
  )
}
