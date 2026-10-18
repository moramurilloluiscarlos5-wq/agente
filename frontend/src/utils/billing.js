import { api } from '../services/api.js'

export const formatPrice = (cents, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)

// Redirige a una URL de Stripe (Checkout o Portal) devuelta por el backend.
export async function goToStripe(path, body) {
  const response = await api.post(path, body)
  if (!response?.data?.url) throw new Error('No se recibió la dirección de pago.')
  window.location.assign(response.data.url)
}
