import PDFDocument from 'pdfkit'

import { maskImei } from '../utils/tracking.js'

const NAVY = '#0f172a'
const MUTED = '#475569'
const ACCENT = '#0284c7'
const LIGHT_LINE = '#cbd5e1'

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
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function section(doc, title) {
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(title.toUpperCase())
  doc.moveDown(0.2).strokeColor(LIGHT_LINE).lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
  doc.moveDown(0.4)
}

function field(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label, { continued: true })
  doc.font('Helvetica').fillColor(NAVY).text(` ${value || 'Sin registrar'}`)
  doc.moveDown(0.15)
}

export async function generateRepairReceiptPdf({ order, history = [], qrPng = null, trackingUrl = '' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Comprobante ${order?.order_number ?? ''} - CARLOSTECH`, Author: 'CARLOSTECH AI' } })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text('CARLOSTECH')
    doc.font('Helvetica').fontSize(11).fillColor(ACCENT).text('Servicio Técnico')
    doc.moveDown(0.2)
    doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('COMPROBANTE DE RECEPCIÓN')
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`Orden ${order?.order_number ?? ''} · Recibido: ${formatDate(order?.received_at)}`)
    doc.moveDown(0.4)

    section(doc, 'Datos del cliente')
    field(doc, 'Nombre: ', customerName(order?.customer))
    field(doc, 'Teléfono: ', order?.customer?.phone)

    section(doc, 'Datos del equipo')
    field(doc, 'Equipo: ', deviceName(order))
    field(doc, 'Color: ', order?.device?.color)
    field(doc, 'Serie: ', order?.device?.serial_number)
    field(doc, 'IMEI: ', maskImei(order?.device?.imei))

    section(doc, 'Problema reportado')
    doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(order?.reported_problem || 'Sin registrar', { width: 500 })
    doc.moveDown(0.2)
    field(doc, 'Estado inicial: ', 'Recibido')
    field(doc, 'Costo estimado: ', order?.estimated_cost != null ? `$${Number(order.estimated_cost).toFixed(2)}` : 'Sin registrar')

    if (Array.isArray(history) && history.length) {
      section(doc, 'Seguimiento inicial')
      history.slice(0, 4).forEach((entry) => {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${formatDate(entry.created_at)} · ${entry.status}${entry.public_message ? ` — ${entry.public_message}` : ''}`, { width: 500 })
      })
    }

    if (qrPng) {
      doc.moveDown(0.6)
      section(doc, 'Seguimiento de tu reparación')
      const qrSize = 148
      const startY = doc.y
      doc.image(qrPng, doc.page.margins.left, startY, { width: qrSize, height: qrSize })
      doc.font('Helvetica').fontSize(10).fillColor(NAVY)
      doc.text('Escanea este código para consultar el estado de tu reparación.', doc.page.margins.left + qrSize + 16, startY, { width: 320 })
      doc.moveDown(0.3)
      doc.font('Helvetica-Bold').text(`Orden: ${order?.order_number ?? ''}`, { width: 320 })
      if (trackingUrl) {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(trackingUrl, { width: 320 })
      }
    }

    doc.moveDown(1)
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Gracias por confiar en CARLOSTECH Servicio Técnico.', { align: 'center' })
    doc.end()
  })
}