import { NavLink, Link } from 'react-router-dom'
import { Bot, CreditCard, MessageCircle, Settings as SettingsIcon, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import PageHeader from '../components/ui/PageHeader.jsx'
import LicenseCard from '../components/billing/LicenseCard.jsx'

const tabs = [
  { label: 'Mi taller', path: '/configuracion', icon: SettingsIcon, end: true },
  { label: 'Licencia y pagos', path: '/facturacion', icon: CreditCard },
  { label: 'Usuarios', path: '/personal', icon: Users },
  { label: 'Roles y permisos', path: '/roles', icon: ShieldCheck },
  { label: 'WhatsApp', path: '/comunicaciones', icon: MessageCircle },
  { label: 'Device Agent', path: '/herramientas-dispositivo', icon: Bot },
]

export default function Settings() {
  const { profile } = useAuth()
  const canSeeLicense = ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/whatsapp/status').then((response) => setStatus(response.data)).catch((err) => setError(err.message))
  }, [])

  return <div className="ct-page space-y-6">
    <PageHeader title="Configuración del negocio" description="Administra integraciones y accesos sin mezclar la operación diaria." />
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Secciones de configuración" className="ct-surface h-fit p-2">
        {tabs.map(({ label, path, icon: Icon, end }) => <NavLink key={path} to={path} end={end} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition ${isActive ? 'bg-[rgba(148,163,184,.08)] text-[var(--tf-text)]' : 'text-[var(--tf-text-subtle)] hover:bg-[rgba(148,163,184,.08)] hover:text-[var(--tf-text)]'}`}><Icon size={16} strokeWidth={1.8} />{label}</NavLink>)}
      </nav>
      <div className="space-y-5">
      <section className="ct-surface-raised max-w-2xl p-6"><div className="flex items-center gap-3 border-b border-[var(--tf-border)] pb-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--tf-success-soft)] text-[#86efac]"><MessageCircle size={18} /></span><div><h2 className="font-semibold text-[var(--tf-text)]">WhatsApp Business</h2><p className="mt-0.5 text-xs text-[var(--tf-text-subtle)]">Estado de la integración del taller</p></div></div>{error ? <p className="mt-5 rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-3 text-sm text-[#fca5a5]">{error}</p> : <p className={`mt-5 rounded-lg border p-3 text-sm ${status?.configured || status?.simulate ? 'border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]' : 'border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] text-[#fcd34d]'}`}>{status?.simulate ? 'Modo simulado activado explícitamente.' : status?.configured ? 'Integración de WhatsApp configurada.' : 'Integración de WhatsApp no configurada.'}</p>}<p className="mt-4 text-sm leading-6 text-[var(--tf-text-muted)]">Los tokens se configuran exclusivamente en el backend. El frontend nunca recibe credenciales de Meta.</p><Link to="/comunicaciones" className="mt-5 ct-btn ct-btn-primary"><MessageCircle size={16} />Gestionar automatizaciones</Link></section>
      {canSeeLicense && <LicenseCard />}
      </div>
    </div>
  </div>
}
