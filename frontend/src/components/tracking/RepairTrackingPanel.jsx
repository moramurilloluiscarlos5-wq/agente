import { useState } from 'react'
import { QrCode } from 'lucide-react'
import QrModal from './QrModal.jsx'
import TrackingActions from './TrackingActions.jsx'

export default function RepairTrackingPanel({ order }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  if (!order?.order_number) return null

  return (
    <section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><QrCode size={18} className="text-[var(--tf-link)]" /> Seguimiento público y comprobante</h2>
        <TrackingActions
          orderNumber={order.order_number}
          snapshot={snapshot}
          onSnapshot={setSnapshot}
          onLoading={setLoading}
          onQr={() => setQrOpen(true)}
        />
      </div>
      {loading && <p className="text-sm text-[var(--tf-text-muted)]">Cargando enlace de seguimiento…</p>}
      {qrOpen && snapshot?.trackingUrl && (
        <QrModal orderNumber={snapshot.orderNumber} trackingUrl={snapshot.trackingUrl} onClose={() => setQrOpen(false)} />
      )}
    </section>
  )
}
