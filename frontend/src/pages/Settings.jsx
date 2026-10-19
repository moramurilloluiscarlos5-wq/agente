import { NavLink, Link } from 'react-router-dom'
import { Bot, CreditCard, MessageCircle, Settings as SettingsIcon, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import PageHeader from '../components/ui/PageHeader.jsx'
import LicenseCard from '../components/billing/LicenseCard.jsx'
import { Alert, Card, ErrorAlert, Skeleton } from '../components/ui/DesignSystem.jsx'

const SECTIONS = [
  { label: 'Mi taller', path: '/configuracion', icon: SettingsIcon, end: true },
  { label: 'Licencia y pagos', path: '/facturacion', icon: CreditCard, roles: ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN'] },
  { label: 'Personal', path: '/personal', icon: Users, permission: 'users.view' },
  { label: 'Roles y permisos', path: '/roles', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
  { label: 'WhatsApp', path: '/comunicaciones', icon: MessageCircle, permission: 'whatsapp.view' },
  { label: 'Agente de dispositivos', path: '/herramientas-dispositivo', icon: Bot, permission: 'devices.view' },
]

export default function Settings() {
  const { profile, hasPermission } = useAuth()
  const canSeeLicense = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN'].includes(profile?.role)
  const [state, setState] = useState({ key: -1, status: null, error: null })
  const [revision, setRevision] = useState(0)
  const sections = SECTIONS.filter((item) => (!item.roles || item.roles.includes(profile?.role)) && (!item.permission || hasPermission(item.permission)))

  useEffect(() => {
    let active = true
    api.get('/whatsapp/status').then((response) => { if (active) setState({ key: revision, status: response.data, error: null }) })
      .catch((error) => { if (active) setState({ key: revision, status: null, error }) })
    return () => { active = false }
  }, [revision])

  const { status } = state
  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Integraciones, accesos y suscripción del taller." />
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Secciones de configuración" className="tf-card p-2">
          <ul className="space-y-1">
            {sections.map(({ label, path, icon: Icon, end }) => (
              <li key={path}><NavLink to={path} end={end} className={({ isActive }) => `tf-nav-link ${isActive ? 'is-active' : ''}`}><Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}</NavLink></li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <Card title="WhatsApp Business" description="Avisos de reparación para tus clientes" className="max-w-3xl">
            {state.key !== revision ? <Skeleton className="h-10 w-full" />
              : state.error ? <ErrorAlert error={state.error} action="consultar WhatsApp" onRetry={() => setRevision((value) => value + 1)} />
                : <div className="space-y-4">
                  <Alert tone={status?.simulate ? 'info' : status?.configured ? 'success' : 'warning'}>
                    {status?.simulate ? 'Modo de prueba: los mensajes se registran pero no salen a WhatsApp.' : status?.configured ? 'Conectado. Los avisos se envían a los clientes que los autorizaron.' : 'Sin conectar. Pide a soporte que configure la cuenta de WhatsApp Business del taller.'}
                  </Alert>
                  <p className="text-sm text-[var(--tf-text-muted)]">Las credenciales de Meta se guardan solo en el servidor; nadie del equipo puede verlas desde aquí.</p>
                  {hasPermission('whatsapp.view') && <Link to="/comunicaciones" className="ct-btn ct-btn-secondary"><MessageCircle size={16} aria-hidden="true" />Configurar avisos automáticos</Link>}
                </div>}
          </Card>
          {canSeeLicense && <LicenseCard />}
        </div>
      </div>
    </div>
  )
}
