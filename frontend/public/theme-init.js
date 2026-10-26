// Aplica el tema guardado antes de que el navegador pinte, para que no haya un destello
// del tema equivocado al abrir la página. Va como archivo (no inline) por la política CSP.
// Las llaves y los valores válidos son los mismos de src/utils/theme.js.
(function () {
  var root = document.documentElement
  var mode = 'dark'
  var accent = 'blue'
  try {
    var savedMode = localStorage.getItem('tf-theme-mode')
    var savedAccent = localStorage.getItem('tf-theme-accent')
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') mode = savedMode
    if (/^(blue|emerald|violet|copper|coral)$/.test(savedAccent || '')) accent = savedAccent
  } catch { /* Sin almacenamiento (modo privado): se queda el tema por defecto. */ }
  var dark = mode === 'system' ? !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) : mode === 'dark'
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.accent = accent
  root.style.colorScheme = dark ? 'dark' : 'light'
})()
