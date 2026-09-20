import { LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

export default function WorkshopSuspended() {
  const { profile, logout } = useAuth()
  const inactive = profile?.workspace_access === 'INACTIVE' || profile?.workshop?.status === 'INACTIVE'
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100"><section className="w-full max-w-lg rounded-3xl border border-amber-500/30 bg-slate-900/80 p-8 text-center shadow-2xl"><ShieldAlert size={44} className="mx-auto text-amber-300" /><h1 className="mt-5 text-2xl font-semibold">Taller {inactive ? 'inactivo' : 'temporalmente suspendido'}</h1><p className="mt-3 text-sm leading-6 text-slate-400">El acceso a este espacio de trabajo se encuentra {inactive ? 'inactivo' : 'suspendido'}. La información se conserva. Contacta al administrador de la plataforma para reactivarlo.</p><button type="button" onClick={logout} className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm text-slate-200 hover:border-slate-500"><LogOut size={16} /> Cerrar sesión</button></section></main>
}
