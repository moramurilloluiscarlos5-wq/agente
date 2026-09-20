import QRCode from 'qrcode'

const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 512,
  color: { dark: '#0f172a', light: '#ffffff' },
}

export async function generateRepairQrPng(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Se requiere la URL de seguimiento para generar el QR')
  }
  return QRCode.toBuffer(text.trim(), { ...QR_OPTIONS, type: 'png' })
}

export async function generateRepairQrDataUrl(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Se requiere la URL de seguimiento para generar el QR')
  }
  return QRCode.toDataURL(text.trim(), QR_OPTIONS)
}