import { useEffect, useState } from 'react'
import { Copy, FileDown, QrCode, RefreshCw } from 'lucide-react'
import { api } from '../../services/api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useToast } from '../../hooks/useToast.js'
import { friendlyError } from '../../utils/errors.js'
import { Button, Card, ConfirmDialog, Dialog, ErrorAlert, Skeleton } from '../ui/DesignSystem.jsx'
import { authHeaders, baseApiUrl, copyText } from './trackingApi.js'

const ADMIN_ROLES = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN']

async function fetchBlob(path) {
  const response = await fetch(`${baseApiUrl()}${path}`, { headers: await authHeaders() })
  if (!response.ok) {
    const error = new Error(`Error ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.blob()
}

function QrDialog({ orderNumber, trackingUrl, onClose }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let objectUrl = ''
    fetchBlob(`/repairs/${encodeURIComponent(orderNumber)}/tracking.png`)
      .then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [orderNumber])
  return (
    <Dialog open title={`Código QR de ${orderNumber}`} description="El cliente lo escanea con la cámara para ver el avance de su reparación." onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Cerrar</Button>}>
      <div className="grid place-items-center gap-4">
        {src ? <img className="h-56 w-56 rounded-[var(--tf-radius-control)] bg-white p-2" src={src} alt={`Código QR para seguir la orden ${orderNumber}`} />
          : failed ? <p className="text-sm text-[var(--tf-text-muted)]">No pudimos generar el QR. Copia el enlace y compártelo directamente.</p>
            : <Skeleton className="h-56 w-56" />}
        <p className="break-all text-center text-xs text-[var(--tf-text-subtle)]">{trackingUrl}</p>
      </div>
    </Dialog>
  )
}

// Enlace público de seguimiento, QR y comprobante PDF de una orden.
export default function RepairTrackingPanel({ orderNumber }) {
  const { profile } = useAuth()
  const toast = useToast()
  const canRegenerate = ADMIN_ROLES.includes(profile?.role)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [revision, setRevision] = useState(0)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [busy, setBusy] = useState('')
  const key = `${orderNumber}#${revision}`
  const loading = state.key !== key
  const data = state.data

  useEffect(() => {
    let active = true
    api.get(`/repairs/${encodeURIComponent(orderNumber)}/tracking`)
      .then((response) => { if (active) setState({ key, data: response.data, error: null }) })
      .catch((error) => { if (active) setState({ key, data: null, error }) })
    return () => { active = false }
  }, [orderNumber, key])

  async function copy() {
    try { await copyText(data.trackingUrl); toast.success('Enlace copiado. Pégalo en tu mensaje al cliente.') }
    catch { toast.error('No se pudo copiar. Selecciona el enlace y cópialo manualmente.') }
  }

  async function downloadReceipt() {
    setBusy('pdf')
    try {
      const blob = await fetchBlob(`/repairs/${encodeURIComponent(orderNumber)}/receipt.pdf`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = `comprobante-${orderNumber}.pdf`; link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(friendlyError(error, 'descargar el comprobante'))
    } finally {
      setBusy('')
    }
  }

  async function regenerate() {
    setBusy('regenerate')
    try {
      const response = await api.post(`/repairs/${encodeURIComponent(orderNumber)}/tracking/regenerate`, {})
      setState({ key, data: { ...data, ...response.data }, error: null })
      toast.success('Enlace nuevo listo. El anterior ya no funciona.')
    } catch (error) {
      toast.error(friendlyError(error, 'generar el enlace'))
    } finally {
      setBusy(''); setConfirmRegenerate(false)
    }
  }

  const active = data?.trackingUrl && data.trackingEnabled !== false
  return (
    <Card title="Seguimiento del cliente" description="Enlace público, QR y comprobante de recepción.">
      {loading ? <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-8 w-40" /></div>
        : state.error ? <ErrorAlert error={state.error} action="cargar el enlace de seguimiento" onRetry={() => setRevision((value) => value + 1)} />
          : <div className="space-y-4">
            {active ? <div className="tf-field">
              <label htmlFor={`tracking-${orderNumber}`} className="tf-label">Enlace para el cliente</label>
              <input id={`tracking-${orderNumber}`} readOnly value={data.trackingUrl} className="ct-input tf-num text-[var(--tf-text-muted)]" onFocus={(event) => event.target.select()} />
            </div> : <p className="text-sm text-[var(--tf-text-muted)]">{data?.trackingEnabled === false ? 'El seguimiento público de esta orden está desactivado.' : 'Esta orden todavía no tiene enlace de seguimiento.'}</p>}
            <div className="flex flex-wrap gap-2">
              {active && <Button size="sm" icon={Copy} onClick={copy}>Copiar enlace</Button>}
              {active && <Button size="sm" icon={QrCode} onClick={() => setQrOpen(true)}>Mostrar QR</Button>}
              <Button size="sm" icon={FileDown} busy={busy === 'pdf'} onClick={downloadReceipt}>Descargar comprobante</Button>
              {canRegenerate && <Button size="sm" variant="ghost" icon={RefreshCw} busy={busy === 'regenerate'} onClick={() => (active ? setConfirmRegenerate(true) : regenerate())}>{active ? 'Regenerar enlace' : 'Generar enlace'}</Button>}
            </div>
          </div>}
      {qrOpen && active && <QrDialog orderNumber={orderNumber} trackingUrl={data.trackingUrl} onClose={() => setQrOpen(false)} />}
      <ConfirmDialog open={confirmRegenerate} busy={busy === 'regenerate'} confirmLabel="Regenerar enlace"
        title={`¿Regenerar el enlace de ${orderNumber}?`}
        description="El enlace y el QR que ya tiene el cliente dejarán de funcionar. Tendrás que enviarle el nuevo."
        onConfirm={regenerate} onCancel={() => setConfirmRegenerate(false)} />
    </Card>
  )
}
