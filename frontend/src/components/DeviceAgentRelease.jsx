import { useEffect, useState } from 'react'
import { Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { api } from '../services/api.js'
import { isNewerAgentVersion, validateAgentRelease } from '../utils/deviceAgentRelease.js'

export default function DeviceAgentRelease({ installedVersion }) {
  const [release, setRelease] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    let inFlight = false
    let controller
    let timeout
    async function checkRelease() {
      if (inFlight) return
      inFlight = true
      setLoading(true)
      controller = new AbortController()
      timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await api.get('/device-tools/release', { signal: controller.signal })
        const latest = validateAgentRelease(response.data)
        if (active) { setRelease(latest); setError('') }
      } catch (err) {
        if (active) {
          setRelease(null)
          setError(`No se pudo consultar la descarga oficial. ${err.message}`)
        }
      } finally {
        clearTimeout(timeout)
        inFlight = false
        if (active) setLoading(false)
      }
    }
    const onFocus = () => { if (!document.hidden) checkRelease() }
    checkRelease()
    const interval = setInterval(onFocus, 60000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active = false
      controller?.abort()
      clearTimeout(timeout)
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [retry])

  const updateAvailable = release && isNewerAgentVersion(release.version, installedVersion)

  return <section className="ct-surface-raised p-5" aria-label="Descarga y actualizaciones del agente">
    <h2 className="text-lg font-semibold">CarlosTech Device Agent</h2>
    <p className="mt-1 text-sm text-slate-400">Windows 10 / Windows 11 · x64{installedVersion ? ` · Versión instalada: ${installedVersion}` : ''}</p>
    {loading && !release && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Consultando versión oficial…</p>}
    {error && <div className="mt-4 flex flex-wrap items-center gap-3">
      <p role="alert" className="text-sm text-amber-200">{error}</p>
      <button className="ct-btn ct-btn-secondary" disabled={loading} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /> Reintentar descarga</button>
    </div>}
    {release && <>
      {updateAvailable && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4">
        <p className="text-sm text-cyan-100">Nueva versión disponible: {release.version}</p>
        <a className="ct-btn ct-btn-primary" href={release.downloadUrl}><Download size={16} /> Actualizar</a>
      </div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a className="ct-btn ct-btn-primary" href={release.downloadUrl}><Download size={16} /> Descargar CarlosTech Device Agent</a>
        <a className="text-sm text-cyan-300 underline underline-offset-4" href={release.releaseUrl} target="_blank" rel="noreferrer">Ver release v{release.version}</a>
      </div>
    </>}
  </section>
}
