import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <AlertTriangle className="mb-4 text-amber-400" size={40} />
      <h1 className="text-xl font-bold text-white">Página no encontrada</h1>
      <p className="mt-2 text-sm text-slate-500">La ruta que buscas no existe o fue movida.</p>
      <Link to="/" className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
        Volver al panel
      </Link>
    </div>
  )
}
