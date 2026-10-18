import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { supabase } from '../services/supabase.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import AuthField from '../components/auth/AuthField.jsx'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    document.title = 'Restablecer contraseña | TallerFlow'
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
      setError(/expired|invalid|token/i.test(updateError?.message ?? '') || !updateError?.message ? 'El enlace expiró o ya se usó. Solicita uno nuevo desde el inicio de sesión.' : 'No pudimos guardar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout variant="reset">
      {saved ? (
        <div className="ct-auth-success">
          <CheckCircle2 size={36} strokeWidth={1.5} aria-hidden="true" />
          <header className="ct-auth-heading">
            <h1>Contraseña actualizada</h1>
            <p>Ya puedes iniciar sesión con tu nueva contraseña. Te llevamos al inicio de sesión.</p>
          </header>
        </div>
      ) : <>
        <header className="ct-auth-heading">
          <h1>Restablecer contraseña</h1>
          <p>Elige una contraseña nueva para tu cuenta. Usa al menos 8 caracteres.</p>
        </header>
        <form onSubmit={submit} className="ct-auth-form" noValidate aria-busy={loading}>
          <AuthField id="reset-password" label="Nueva contraseña" type="password" autoFocus required minLength={8} value={password}
            onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" disabled={loading} />
          <AuthField id="reset-confirmation" label="Confirmar contraseña" type="password" required minLength={8} value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" disabled={loading} />
          {error && <p role="alert" className="ct-auth-notice ct-auth-notice--error"><CircleAlert size={17} aria-hidden="true" />{error}</p>}
          <button type="submit" disabled={loading} className="ct-auth-primary">{loading && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}{loading ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
        </form>
        <p className="ct-auth-switch"><Link to="/login" className="ct-auth-link">Volver al inicio de sesión</Link></p>
      </>}
    </AuthLayout>
  )
}
