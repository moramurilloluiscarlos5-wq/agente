import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './auth.js'
import { supabase, isSupabaseConfigured } from '../services/supabase.js'
import { api, ApiError } from '../services/api.js'


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

// Reintentos al restaurar la sesión mientras el API está inalcanzable.
const RESTORE_RETRY_DELAYS_MS = [800, 1600, 3200]

function isInvalidSessionError(error) {
  // Sólo un rechazo del backend (401/403) significa "sesión inválida".
  // Un fallo de red (API_OFFLINE/API_TIMEOUT/5xx) NO invalida la sesión.
  return error instanceof ApiError && (error.code === 'AUTH_REQUIRED' || error.status === 401 || error.status === 403)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  // IMPORTANTE: un fallo transitorio de red no debe cerrar la sesión del
  // usuario. Se reintenta con backoff y, si el API sigue inalcanzable, la
  // app queda en estado 'offline' CON la sesión de Supabase preservada;
  // sólo un rechazo explícito del backend (401/403) cierra la sesión.
  const restoreSession = useCallback(async () => {
    if (!isSupabaseConfigured) return 'unconfigured'
    const version = ++generation.current
    let lastError = null
    for (let attempt = 0; attempt <= RESTORE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const { data } = await supabase.auth.getSession()
        if (version !== generation.current) return 'stale'

        if (!data.session?.user) {
          setAuth((prev) => ({ ...prev, status: 'anonymous', user: null, profile: null }))
          return 'anonymous'
        }

        const { profile } = await api.get('/auth/me')
        if (version !== generation.current) return 'stale'
        setAuth({ status: 'authenticated', user: data.session.user, profile, error: null })
        return 'authenticated'
      } catch (error) {
        lastError = error
        if (version !== generation.current) return 'stale'
        if (isInvalidSessionError(error)) {
          await supabase.auth.signOut().catch(() => null)
          clearPrivateSessionCache()
          setAuth({ status: 'anonymous', user: null, profile: null, error: null })
          return 'signed-out'
        }
        if (attempt < RESTORE_RETRY_DELAYS_MS.length) await wait(RESTORE_RETRY_DELAYS_MS[attempt])
      }
    }
    // El API sigue inalcanzable: conservar la sesión y reportar offline.
    const { data } = await supabase.auth.getSession().catch(() => ({ data: null }))
    if (version !== generation.current) return 'stale'
    setAuth((prev) => ({
      status: 'offline',
      user: data?.session?.user ?? prev.user,
      profile: prev.profile,
      error: lastError?.message ?? 'TallerFlow no pudo conectarse con el servidor.',
    }))
    return 'offline'
  }, [])

  useEffect(() => {
    // Session restoration updates state after Supabase/API requests settle.
    // oxlint-disable-next-line react/set-state-in-effect
    restoreSession()
    return () => { generation.current += 1 }
  }, [restoreSession])

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
      // La sesión de Supabase quedó persistida: un fallo de red del API no
      // la destruye; restoreSession la recuperará cuando vuelva la conexión.
      if (!isInvalidSessionError(err)) {
        setAuth((prev) => ({ ...prev, status: 'anonymous', error: err.message }))
        return { ok: false }
      }
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

  const retryConnection = useCallback(async () => {
    setAuth((prev) => ({ ...prev, status: 'loading', error: null }))
    await restoreSession()
  }, [restoreSession])

  const roleLabel = ROLE_LABELS[auth.profile?.role] ?? auth.profile?.role

  const value = {
    ...auth,
    isConfigured: isSupabaseConfigured,
    roleLabel,
    login,
    logout,
    retryConnection,
    hasPermission: (permission) => hasPermission(auth.profile, permission),
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
