import { Copy, Download, ExternalLink, Printer, RefreshCw } from 'lucide-react'
import { api } from '../../services/api.js'
import { authHeaders, baseApiUrl, copyText } from './trackingApi.js'
import { repairButtonClass, repairSecondaryClass } from '../repairs/repairForm.js'

export default function TrackingActions({ orderNumber, snapshot, onSnapshot, onLoading, onQr }) {
  return <TrackingActionsBody orderNumber={orderNumber} snapshot={snapshot} onSnapshot={onSnapshot} onLoading={onLoading} onQr={onQr} />
}

function TrackingActionsBody({ orderNumber, snapshot, onSnapshot, onLoading, onQr }) {
  async function load() {
    onLoading(true)
    try { const response = await api.get(`/repairs/${encodeURIComponent(orderNumber)}/tracking`); onSnapshot(response.data) } finally { onLoading(false) }
  }
  async function regenerate() {
    onLoading(true)
    try { const response = await api.post(`/repairs/${encodeURIComponent(orderNumber)}/tracking/regenerate`, {}); onSnapshot(response.data) } finally { onLoading(false) }
  }
  async function copyUrl() {
    if (snapshot?.trackingUrl) await copyText(snapshot.trackingUrl)
  }
  async function download(path, filename) {
    const response = await fetch(`${baseApiUrl()}${path}`, { headers: await authHeaders() })
    if (!response.ok) throw new Error('No se pudo descargar el archivo')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="flex flex-wrap gap-2">
    <button type="button" className={repairSecondaryClass} onClick={load}><ExternalLink size={15} />Ver enlace</button>
    {snapshot?.trackingUrl && <><button type="button" className={repairSecondaryClass} onClick={copyUrl}><Copy size={15} />Copiar</button><button type="button" className={repairSecondaryClass} onClick={onQr}><ExternalLink size={15} />QR</button><button type="button" className={repairSecondaryClass} onClick={() => download(`/repairs/${encodeURIComponent(orderNumber)}/tracking.png`, `qr-${orderNumber}.png`)}><Download size={15} />PNG</button><button type="button" className={repairSecondaryClass} onClick={() => download(`/repairs/${encodeURIComponent(orderNumber)}/receipt.pdf`, `comprobante-${orderNumber}.pdf`)}><Printer size={15} />PDF</button></>}
    <button type="button" className={repairButtonClass} onClick={regenerate}><RefreshCw size={15} />Regenerar</button>
  </div>
}
