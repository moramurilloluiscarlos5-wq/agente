// Resolución segura de la base del API de CARLOSTECH.
//
// Regla de oro:
// - El Device Agent local ES la única cosa que vive en 127.0.0.1/localhost.
// - El backend de CARLOSTECH vive en Railway y, en producción, el propio
//   backend sirve el frontend compilado, por lo que la base correcta es
//   la ruta relativa `/api` (mismo origen).
//
// Si un build de producción se generó con VITE_API_URL apuntando a
// localhost/127.0.0.1 (p. ej. porque se usó el .env local de desarrollo) y
// esa página la abre un usuario externo, su navegador intentaría hablar con
// SU propia computadora. Este resolver neutraliza ese caso: cuando la URL
// configurada es local y la página NO se está viendo en localhost, se cae a
// la base relativa `/api`.

function isLocalApiUrl(configured) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(configured)
}

function isLocalViewer(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

export function resolveApiBaseUrl(configured, viewerHostname) {
  const value = (configured ?? '').trim() || '/api'
  if (isLocalApiUrl(value) && !isLocalViewer(viewerHostname ?? 'localhost')) return '/api'
  return value.replace(/\/+$/, '')
}

// Origen del backend a partir de la base resuelta. Se usa para armar URLs
// absolutas (p. ej. enlaces de seguimiento público) sin inventar hosts.
export function apiOriginFromBase(baseUrl, windowOrigin) {
  if (/^https?:\/\//i.test(baseUrl)) return baseUrl.replace(/\/api\/?$/, '')
  return windowOrigin || ''
}
