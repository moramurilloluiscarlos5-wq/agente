import PDFDocument from 'pdfkit'

import { maskImei, trackingStatusMeta } from '../utils/tracking.js'

const INK = '#10241d'
const MUTED = '#52665f'
const BRAND = '#0b5a47'
const GOLD = '#e6b62e'
const LINE = '#d5dfdb'
const PANEL = '#f2f6f4'

// El servidor corre en UTC: sin zona fija el cliente veía la hora de recepción corrida 6 horas.
const TIME_ZONE = process.env.APP_TIMEZONE || 'America/Mexico_City'

function customerName(customer) {
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Sin registrar'
}

function deviceName(order) {
  return [order?.brand ?? order?.device?.brand, order?.model ?? order?.device?.model].filter(Boolean).join(' ') || 'Sin registrar'
}

function formatDate(value) {
  if (!value) return 'Sin registrar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registrar'
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(date)
}

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0))

function formatPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return value || ''
}

const check = (value) => (value == null ? 'Sin revisar' : value ? 'Sí' : 'No')

function section(doc, title) {
  doc.moveDown(0.7).font('Helvetica-Bold').fontSize(9).fillColor(BRAND).text(title.toUpperCase(), { characterSpacing: 0.6 })
  doc.moveDown(0.25).strokeColor(LINE).lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
  doc.moveDown(0.45)
}

// Pares etiqueta/valor en dos columnas para que el comprobante quepa en una hoja.
function grid(doc, pairs) {
  const left = doc.page.margins.left
  const width = (doc.page.width - left - doc.page.margins.right) / 2
  for (let index = 0; index < pairs.length; index += 2) {
    const y = doc.y
    let bottom = y
    for (const [column, [label, value]] of pairs.slice(index, index + 2).entries()) {
      const x = left + column * width
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x, y, { width: width - 12 })
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(value || 'Sin registrar', x, doc.y + 1, { width: width - 12 })
      bottom = Math.max(bottom, doc.y)
    }
    doc.x = left
    doc.y = bottom + 6
  }
}

export async function generateRepairReceiptPdf({ order, history = [], qrPng = null, trackingUrl = '', workshopName = 'Taller técnico', workshopPhone = '' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Comprobante ${order?.order_number ?? ''} - ${workshopName}`, Author: workshopName } })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right

    // Encabezado: banda verde con el nombre del taller y el folio.
    doc.rect(0, 0, doc.page.width, 92).fill(BRAND)
    doc.rect(0, 92, doc.page.width, 4).fill(GOLD)
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text(workshopName, left, 26, { width: 330 })
    if (workshopPhone) doc.font('Helvetica').fontSize(10).fillColor('#d9ece5').text(`Tel. ${formatPhone(workshopPhone)}`, left, doc.y + 2, { width: 330 })
    doc.font('Helvetica').fontSize(9).fillColor('#d9ece5').text('Comprobante de recepción', 380, 28, { width: right - 380, align: 'right' })
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text(order?.order_number ?? '', 380, doc.y + 2, { width: right - 380, align: 'right' })
    doc.font('Helvetica').fontSize(9).fillColor('#d9ece5').text(formatDate(order?.received_at), 380, doc.y + 2, { width: right - 380, align: 'right' })
    doc.x = left
    doc.y = 116

    section(doc, 'Cliente')
    grid(doc, [['Nombre', customerName(order?.customer)], ['Teléfono', formatPhone(order?.customer?.phone)]])

    section(doc, 'Equipo recibido')
    grid(doc, [
      ['Equipo', deviceName(order)], ['Color', order?.device?.color],
      ['IMEI', maskImei(order?.device?.imei)], ['Número de serie', order?.device?.serial_number],
      ['Accesorios recibidos', order?.accessories_received || 'Ninguno'], ['Estado físico', order?.physical_condition],
    ])

    section(doc, 'Falla reportada')
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(order?.reported_problem || 'Sin registrar', left, doc.y, { width: right - left })
    doc.moveDown(0.5)
    grid(doc, [
      ['Enciende', check(order?.powers_on)], ['Carga', check(order?.charges)],
      ['Muestra imagen', check(order?.displays_image)], ['Táctil', check(order?.touch_works)],
    ])

    section(doc, 'Cobro')
    const cost = Number(order?.estimated_cost || 0)
    const deposit = Number(order?.deposit || 0)
    const boxY = doc.y
    doc.roundedRect(left, boxY, right - left, 52, 6).fill(PANEL)
    const third = (right - left) / 3
    for (const [index, [label, value]] of [['Costo estimado', money(cost)], ['Anticipo', money(deposit)], ['Saldo pendiente', money(Math.max(0, cost - deposit))]].entries()) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, left + 14 + index * third, boxY + 11, { width: third - 20 })
      doc.font('Helvetica-Bold').fontSize(14).fillColor(index === 2 ? BRAND : INK).text(value, left + 14 + index * third, boxY + 24, { width: third - 20 })
    }
    doc.x = left
    doc.y = boxY + 60
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('El costo es un estimado y puede cambiar después del diagnóstico; el taller te avisará antes de cualquier cargo adicional.', left, doc.y, { width: right - left })

    if (qrPng) {
      section(doc, 'Sigue tu reparación')
      const qrSize = 116
      const startY = doc.y
      doc.image(qrPng, left, startY, { width: qrSize, height: qrSize })
      const textX = left + qrSize + 18
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Escanea el código con la cámara de tu celular', textX, startY + 8, { width: right - textX })
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Verás en qué etapa está tu equipo y cuándo está listo para recoger, sin tener que llamar.', textX, doc.y + 4, { width: right - textX })
      if (trackingUrl) doc.font('Helvetica').fontSize(8).fillColor(BRAND).text(trackingUrl, textX, doc.y + 6, { width: right - textX, link: trackingUrl })
      doc.x = left
      doc.y = startY + qrSize + 4
    }

    const latest = Array.isArray(history) && history.length ? history[history.length - 1] : null
    if (latest) {
      doc.moveDown(0.6).font('Helvetica').fontSize(8).fillColor(MUTED).text(`Estado al imprimir: ${trackingStatusMeta(latest.status)?.label ?? latest.status} (${formatDate(latest.created_at)})`, left, doc.y, { width: right - left })
    }

    // Firmas al pie de la hoja.
    const signY = Math.max(doc.y + 40, doc.page.height - doc.page.margins.bottom - 70)
    const half = (right - left - 40) / 2
    for (const [index, label] of ['Firma del cliente', `Recibió (${workshopName})`].entries()) {
      const x = left + index * (half + 40)
      doc.strokeColor(MUTED).lineWidth(0.8).moveTo(x, signY).lineTo(x + half, signY).stroke()
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x, signY + 6, { width: half, align: 'center' })
    }
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('Generado con ServiTrack', left, signY + 30, { width: right - left, align: 'center' })
    doc.end()
  })
}
