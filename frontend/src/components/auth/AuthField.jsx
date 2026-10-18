import { useState } from 'react'
import { Eye, EyeOff, Mail, Lock, Phone, User } from 'lucide-react'

const ICON_FOR_TYPE = {
  email: Mail,
  password: Lock,
  tel: Phone,
  text: User,
}

export default function AuthField({ id, label, hint, error, type = 'text', className = '', startIcon, ...inputProps }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, inputProps['aria-describedby']].filter(Boolean).join(' ') || undefined
  const Icon = startIcon ?? ICON_FOR_TYPE[type]

  return (
    <div className={`ct-auth-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`ct-auth-input-wrap${isPassword ? ' ct-auth-input-wrap--password' : ''}${Icon ? ' ct-auth-input-wrap--icon' : ''}`}>
        {Icon && <Icon size={17} className="ct-auth-input-icon" aria-hidden="true" />}
        <input {...inputProps} id={id} type={isPassword && visible ? 'text' : type} className="ct-auth-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
        {isPassword && (
          <button type="button" className="ct-auth-password-toggle" onClick={() => setVisible((current) => !current)} disabled={inputProps.disabled}
            aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}>
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {hint && <p id={`${id}-hint`} className="ct-auth-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="ct-auth-field-error" role="alert">{error}</p>}
    </div>
  )
}
