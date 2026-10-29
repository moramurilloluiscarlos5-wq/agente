import { Link } from 'react-router-dom'
import { supportMailto } from '../../utils/constants.js'

// Enlaces a las páginas legales y al correo de soporte, para pies de página públicos.
export default function LegalLinks({ className = '' }) {
  return (
    <nav aria-label="Información legal" className={`tf-legal-links ${className}`}>
      <Link to="/privacidad">Aviso de privacidad</Link>
      <Link to="/terminos">Términos</Link>
      <a href={supportMailto()}>Soporte</a>
    </nav>
  )
}
