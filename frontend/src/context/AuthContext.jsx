import { createContext, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase.js'
import { api } from '../services/api.js'

export const AuthContext = createContext(null)

const ROLE_LABELS = {
  OWNER: 'Dueño del taller',
  ADMINISTRADOR: 'Administrador',
  TECNICO: 'Técnico',
  RECEPCION: 'Recepción',
  CAJERO: 'Cajero',
  SUPER_ADMIN: 'Super administrador',
}

const LEGACY_PERMISSIONS = {
  OWNER: ['*'],
  SUPER_ADMIN: ['*'],
  ADMINISTRADOR: ['*'],
  TECNICO: ['dashboard.view', 'repairs.view', 'repairs.update', 'repairs.change_status', 'clients.view', 'devices.view', 'diagnostics.view', 'diagnostics.create', 'diagnostics.ai', 'inventory.view', 'inventory.adjust_stock', 'whatsapp.view', 'whatsapp.send'],
  RECEPCION: ['dashboard.view', 'clients.view', 'clients.create', 'clients.update', 'devices.view', 'devices.create', 'devices.update', 'repairs.view', 'repairs.create', 'repairs.update', 'repairs.change_status', 'quotes.view', 'quotes.create', 'quotes.update', 'payments.view', 'payments.create', 'warranties.view', 'warranties.create', 'whatsapp.view', 'whatsapp.send'],
  CAJERO: ['dashboard.view', 'repairs.view', 'quotes.view', 'payments.view', 'payments.create', 'payments.update'],
}

function hasPermission(profile, permission) {
  // Refleja la misma fuente autoritativa que valida el backend: cuando el rol está
  // registrado en RBAC, su lista de permisos manda incluso si quedó vacía.
  const permissions = profile?.permissionsSource === 'rbac'
    ? (profile.permissions ?? [])
    : (profile?.permissions?.length ? profile.permissions : LEGACY_PERMISSIONS[profile?.role] ?? [])
  return permissions.includes('*') || permissions.includes(permission)
}

function clearPrivateSessionCache() {
  if (typeof window === 'undefined') return
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith('carlostech-')) storage.removeItem(key)
    }
  }
}

export function AuthProvider({ children }) {
  const generation = useRef(0)
  const [auth, setAuth] = useState(() => ({
    status: isSupabaseConfigured ? 'loading' : 'anonymous',
    user: null,
    profile: null,
    error: null,
  }))

  // Restaura la sesión persistida al cargar la aplicación.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    const version = generation.current

    async function restoreSession() {
      try {
        const { data } = await supabase.auth.getSession()
        if (cancelled || version !== generation.current) return

        if (!data.session?.user) {
          setAuth((prev) => ({ ...prev, status: 'anonymous', user: null, profile: null }))
          return
        }

        const { profile } = await api.get('/auth/me')
        if (cancelled || version !== generation.current) return
        setAuth({ status: 'authenticated', user: data.session.user, profile, error: null })
      } catch {
        if (!cancelled && version === generation.current) {
          await supabase.auth.signOut().catch(() => null)
          clearPrivateSessionCache()
          setAuth({ status: 'anonymous', user: null, profile: null, error: null })
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshProfile() {
    const version = ++generation.current
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session?.user) throw new Error('Inicia sesión para continuar.')
    const { profile } = await api.get('/auth/me')
    if (version !== generation.current) throw new Error('La sesión cambió. Inicia sesión para continuar.')
    setAuth({ status: 'authenticated', user: sessionData.session.user, profile, error: null })
    return profile
  }

  async function login(email, password) {
    const version = ++generation.current
    clearPrivateSessionCache()
    setAuth({ status: 'anonymous', user: null, profile: null, error: null, errorCode: null })

    if (!isSupabaseConfigured) {
      setAuth((prev) => ({
        ...prev,
        status: 'anonymous',
        error: 'Supabase no está configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env',
      }))
      return { ok: false }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (version !== generation.current) return { ok: false }

    if (error || !data.user) {
      const needsConfirmation = error?.code === 'email_not_confirmed' || error?.message === 'Email not confirmed'
      setAuth((prev) => ({
        ...prev,
        status: 'anonymous',
        errorCode: needsConfirmation ? 'email_not_confirmed' : error?.code,
        error: needsConfirmation
          ? 'Tu correo está pendiente de confirmación. Abre el enlace que recibiste por correo o solicita uno nuevo aquí abajo.'
          : error?.message ?? 'No se pudo iniciar sesión',
      }))
      return { ok: false }
    }

    try {
      const { profile } = await api.get('/auth/me')
      if (version !== generation.current) return { ok: false }
      setAuth({ status: 'authenticated', user: data.user, profile, error: null })
      return { ok: true, profile }
    } catch (err) {
      if (version !== generation.current) return { ok: false }
      await supabase.auth.signOut().catch(() => null)
      clearPrivateSessionCache()
      setAuth((prev) => ({ ...prev, status: 'anonymous', error: err.message }))
      return { ok: false }
    }
  }

  async function logout() {
    generation.current += 1
    setAuth({ status: 'anonymous', user: null, profile: null, error: null })
    if (supabase) await supabase.auth.signOut().catch(() => null)
    clearPrivateSessionCache()
  }

  const roleLabel = ROLE_LABELS[auth.profile?.role] ?? auth.profile?.role

  const value = {
    ...auth,
    isConfigured: isSupabaseConfigured,
    roleLabel,
    login,
    logout,
    hasPermission: (permission) => hasPermission(auth.profile, permission),
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
