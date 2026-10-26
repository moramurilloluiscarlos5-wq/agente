// Traduce errores técnicos a mensajes que entiende cualquier persona del taller.
// `action` describe lo que se intentaba hacer: "guardar el pago", "cargar los clientes".
export function friendlyError(error, action = 'completar la acción') {
  const code = error?.code
  const status = error?.status
  if (code === 'API_OFFLINE') return `No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.`
  if (code === 'API_TIMEOUT') return `El servidor tardó demasiado en responder. Inténtalo de nuevo en unos segundos.`
  if (code === 'PLAN_UPGRADE_REQUIRED') return error?.message || 'Tu plan no incluye esta función. Cambia de plan en Mi plan para usarla.'
  if (code === 'LICENSE_REQUIRED' || status === 402) return 'La suscripción del taller no está activa. Revisa la sección Mi plan.'
  if (code === 'PAYMENT_PROVIDER_ERROR' || (status === 502 && /Mercado Pago/.test(error?.message ?? ''))) return error?.message || 'Mercado Pago no respondió. Inténtalo de nuevo en unos minutos.'
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (status === 403) return error?.message && !/forbidden/i.test(error.message) ? error.message : 'No tienes permiso para realizar esta acción.'
  if (status === 404) return error?.message && !/not found/i.test(error.message) ? error.message : 'No encontramos el registro. Es posible que se haya eliminado.'
  if (status === 409 || status === 400 || status === 422) return error?.message || `Revisa los datos e inténtalo de nuevo.`
  if (status === 503) return error?.message || 'El servicio no está disponible por el momento. Inténtalo más tarde.'
  return `No pudimos ${action}. Inténtalo de nuevo.`
}
