import { useContext } from 'react'
import { ToastContext } from '../context/toast.js'

// Devuelve { success, error, info }. Fuera del proveedor no hace nada para no
// romper componentes que se prueban de forma aislada.
const noop = () => {}
const fallback = { success: noop, error: noop, info: noop }

export function useToast() {
  return useContext(ToastContext) ?? fallback
}
