// El endpoint /auth/me se ejecuta en cada carga de la aplicación, no solo al iniciar
// sesión. Registrar "último acceso" y un evento de auditoría en cada llamada inflaba
// audit_logs y falseaba la fecha real de inicio de sesión.
export const LOGIN_AUDIT_WINDOW_MS = 30 * 60 * 1000

export function shouldRecordLogin(profile, now = Date.now()) {
  const previous = Date.parse(profile?.last_login_at ?? '')
  if (!Number.isFinite(previous)) return true
  return now - previous >= LOGIN_AUDIT_WINDOW_MS
}
