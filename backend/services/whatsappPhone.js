export function normalizeWhatsAppPhone(value, defaultCountry = '52') {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('El teléfono de WhatsApp no es válido')
  let digits = String(value).trim().replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(defaultCountry) && digits.length === defaultCountry.length + 10) return digits
  if (defaultCountry === '52' && digits.length === 10) return `52${digits}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  throw new Error('El teléfono de WhatsApp debe incluir un número válido')
}

export function displayWhatsAppPhone(value) {
  const normalized = normalizeWhatsAppPhone(value)
  return `+${normalized}`
}
