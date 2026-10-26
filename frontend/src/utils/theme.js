// Temas de TallerFlow. El oscuro es el "banco de trabajo" (tapete antiestático) y el claro
// es el "papel" (papel térmico de las órdenes). Además hay cinco colores de acento.
// Las llaves y los valores válidos son los mismos de public/theme-init.js.

export const MODE_KEY = 'tf-theme-mode'
export const ACCENT_KEY = 'tf-theme-accent'
export const DEFAULT_MODE = 'dark'
export const DEFAULT_ACCENT = 'blue'

export const MODES = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
]

// `swatch` es el color de la muestra en el selector: el mismo --tf-primary de cada acento.
export const ACCENTS = [
  { id: 'blue', label: 'Azul señal', swatch: '#2563eb' },
  { id: 'emerald', label: 'Esmeralda', swatch: '#047857' },
  { id: 'violet', label: 'Violeta', swatch: '#6d28d9' },
  { id: 'copper', label: 'Cobre', swatch: '#c2410c' },
  { id: 'coral', label: 'Coral', swatch: '#e11d48' },
]

function read(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function save(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* Preferencia opcional. */ }
}

export const readMode = () => {
  const value = read(MODE_KEY)
  return MODES.some((mode) => mode.id === value) ? value : DEFAULT_MODE
}

export const readAccent = () => {
  const value = read(ACCENT_KEY)
  return ACCENTS.some((accent) => accent.id === value) ? value : DEFAULT_ACCENT
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
export const systemIsDark = () => !(window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false)
export const resolveMode = (mode) => (mode === 'system' ? (systemIsDark() ? 'dark' : 'light') : mode)

// Escribe el tema en <html>; todos los colores del sistema salen de variables CSS que dependen de estos atributos.
export function applyTheme(mode, accent, root = document.documentElement) {
  const resolved = resolveMode(mode)
  root.dataset.theme = resolved
  root.dataset.accent = accent
  root.style.colorScheme = resolved
}
