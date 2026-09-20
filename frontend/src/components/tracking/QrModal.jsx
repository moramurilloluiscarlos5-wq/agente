import { useEffect, useState } from 'react'
import { authHeaders, baseApiUrl } from './trackingApi.js'

export default function QrModal({ orderNumber, trackingUrl, onClose }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let active = true; authHeaders().then((headers) => fetch(`${baseApiUrl()}/repairs/${encodeURIComponent(orderNumber)}/tracking.png`, { headers })).then((response) => response.ok ? response.blob() : null).then((blob) => { if (active && blob) setSrc(URL.createObjectURL(blob)) }).catch(() => {}); return () => { active = false } }, [orderNumber])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Código QR de seguimiento">
    <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 text-center"><h2 className="font-semibold text-white">Seguimiento {orderNumber}</h2>{src ? <img className="mx-auto mt-4 h-56 w-56 rounded-lg bg-white p-2" src={src} alt="Código QR de seguimiento" /> : <p className="mt-8 text-sm text-slate-400">Generando QR…</p>}<p className="mt-3 break-all text-xs text-slate-400">{trackingUrl}</p><button type="button" className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={onClose}>Cerrar</button></div>
  </div>
}
