import { NavLink, Link } from 'react-router-dom'
import { Bot, MessageCircle, Settings as SettingsIcon, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import PageHeader from '../components/ui/PageHeader.jsx'

const tabs = [
  { label: 'Mi taller', path: '/configuracion', icon: SettingsIcon, end: true },
  { label: 'Usuarios', path: '/personal', icon: Users },
  { label: 'Roles y permisos', path: '/roles', icon: ShieldCheck },
  { label: 'WhatsApp', path: '/comunicaciones', icon: MessageCircle },
  { label: 'Device Agent', path: '/herramientas-dispositivo', icon: Bot },
]

export default function Settings() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/whatsapp/status').then((response) => setStatus(response.data)).catch((err) => setError(err.message))
  }, [])

  return <div className="ct-page space-y-6">
    <PageHeader eyebrow="Configuración" title="Configuración del negocio" description="Administra integraciones y accesos sin mezclar la operación diaria." />
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Secciones de configuración" className="ct-surface h-fit p-2">
        {tabs.map(({ label, path, icon: Icon, end }) => <NavLink key={path} to={path} end={end} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition ${isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'}`}><Icon size={16} strokeWidth={1.8} />{label}</NavLink>)}
      </nav>
      <section className="ct-surface-raised max-w-2xl p-6"><div className="flex items-center gap-3 border-b border-slate-800 pb-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><MessageCircle size={18} /></span><div><h2 className="font-semibold text-slate-100">WhatsApp Business</h2><p className="mt-0.5 text-xs text-slate-500">Estado de la integración del taller</p></div></div>{error ? <p className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : <p className={`mt-5 rounded-lg border p-3 text-sm ${status?.configured || status?.simulate ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>{status?.simulate ? 'Modo simulado activado explícitamente.' : status?.configured ? 'Integración de WhatsApp configurada.' : 'Integración de WhatsApp no configurada.'}</p>}<p className="mt-4 text-sm leading-6 text-slate-400">Los tokens se configuran exclusivamente en el backend. El frontend nunca recibe credenciales de Meta.</p><Link to="/comunicaciones" className="mt-5 ct-btn ct-btn-primary"><MessageCircle size={16} />Gestionar automatizaciones</Link></section>
    </div>
  </div>
}
