import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

function blurMessage(input) {
  const v = input.validity
  if (v.valueMissing) return 'Completa este dato para continuar.'
  if (v.typeMismatch && input.type === 'email') return 'Escribe un correo como nombre@taller.com.'
  if (v.tooShort) return `Usa al menos ${input.minLength} caracteres.`
  if (v.patternMismatch) return input.title || 'Revisa el formato de este dato.'
  return input.validationMessage
}

// Campo de acceso: etiqueta visible, validación al salir del campo y botón para ver la contraseña.
export default function AuthField({ id, label, hint, error, type = 'text', className = '', onBlur, onChange, ...inputProps }) {
  const [visible, setVisible] = useState(false)
  const [blurError, setBlurError] = useState('')
  const isPassword = type === 'password'
  const shown = error || blurError
  const describedBy = [hint && !shown && `${id}-hint`, shown && `${id}-error`, inputProps['aria-describedby']].filter(Boolean).join(' ') || undefined

  return (
    <div className={`ct-auth-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`ct-auth-input-wrap${isPassword ? ' ct-auth-input-wrap--password' : ''}`}>
        <input {...inputProps} id={id} type={isPassword && visible ? 'text' : type} className="ct-auth-input" aria-invalid={shown ? true : undefined} aria-describedby={describedBy}
          onBlur={(event) => { if (!event.target.checkValidity()) setBlurError(blurMessage(event.target)); onBlur?.(event) }}
          onChange={(event) => { if (blurError) setBlurError(''); onChange?.(event) }} />
        {isPassword && (
          <button type="button" className="ct-auth-password-toggle" onClick={() => setVisible((current) => !current)} disabled={inputProps.disabled}
            aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}>
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {shown ? <p id={`${id}-error`} className="ct-auth-field-error" role="alert">{shown}</p> : hint ? <p id={`${id}-hint`} className="ct-auth-hint">{hint}</p> : null}
    </div>
  )
}
