import { Component } from 'react'
import { canReloadForNewVersion, isChunkLoadError, reloadForNewVersion } from '../utils/chunkErrors.js'

// Evita la pantalla en blanco cuando una pantalla falla al cargarse o al dibujarse.
// Si es una versión nueva desplegada mientras la pestaña seguía abierta, recarga sola una vez.
export default class ErrorBoundary extends Component {
  state = { error: null, reloading: false }

  // Se decide al dibujar si viene una recarga, para no mostrar el aviso un instante antes de recargar.
  static getDerivedStateFromError(error) {
    return { error, reloading: isChunkLoadError(error) && canReloadForNewVersion() }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
    if (isChunkLoadError(error) && !reloadForNewVersion()) this.setState({ reloading: false })
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    if (reloading) return <p role="status" className="py-16 text-center text-sm text-[var(--tf-text-muted)]">Actualizando TallerFlow…</p>
    const outdated = isChunkLoadError(error)
    const notice = (
      <section role="alert" className="ct-surface-raised w-full max-w-md rounded-xl border border-[var(--tf-border)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--tf-text)]">{outdated ? 'Hay una versión nueva de TallerFlow' : 'No pudimos mostrar esta pantalla'}</h2>
        <p className="mt-2 text-sm text-[var(--tf-text-muted)]">{outdated ? 'Actualizamos la aplicación mientras la tenías abierta. Recarga la página para continuar.' : 'Ocurrió un error inesperado. Puedes reintentar o recargar la página.'}</p>
        <div className="mt-5 flex justify-center gap-3">
          {!outdated && <button type="button" className="ct-btn ct-btn-secondary" onClick={() => this.setState({ error: null })}>Reintentar</button>}
          <button type="button" className="ct-btn ct-btn-primary" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      </section>
    )
    return this.props.fullPage
      ? <main className="grid min-h-screen place-items-center bg-[var(--tf-surface-sunken)] p-6">{notice}</main>
      : <div className="grid place-items-center py-16">{notice}</div>
  }
}
