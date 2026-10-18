// Un deploy borra los assets con hash de la versión anterior: una pestaña abierta antes del deploy
// falla al importar una pantalla y solo se arregla recargando para obtener el index.html nuevo.
const CHUNK_ERROR = /dynamically imported module|importing a module script failed|unable to preload css/i
const RELOAD_KEY = 'tf:chunk-reload-at'
const RELOAD_WINDOW_MS = 30_000

export function isChunkLoadError(error) {
  return CHUNK_ERROR.test(String(error?.message ?? error ?? ''))
}

// Recarga una sola vez por ventana de tiempo: si el fallo persiste (no era una versión nueva)
// se muestra el aviso en lugar de entrar en un bucle de recargas.
export function reloadForNewVersion({ storage = globalThis.sessionStorage, now = Date.now(), reload = () => globalThis.location.reload() } = {}) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY))
    if (last && now - last < RELOAD_WINDOW_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}
