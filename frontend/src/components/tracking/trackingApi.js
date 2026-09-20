import { supabase } from '../services/supabase.js'

export function baseApiUrl() {
  return import.meta.env.VITE_API_URL ?? '/api'
}

export async function authHeaders() {
  const headers = {}
  if (!supabase) return headers
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function copyText(value) {
  await navigator.clipboard.writeText(value)
}