import { useRef } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme.js'
import { ACCENTS, MODES } from '../../utils/theme.js'

const MODE_ICONS = { light: Sun, dark: Moon, system: Monitor }

// La onda del cambio de tema sale del centro del control que se usó (también con teclado).
const centerOf = (element) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

// Grupo de opciones con flechas del teclado: una sola parada de Tab y las flechas cambian de opción.
function RadioGroup({ label, value, options, onSelect, className, children }) {
  const group = useRef(null)
  // Un solo manejador en el grupo: las flechas pasan al siguiente o al anterior.
  const onKeyDown = (event) => {
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
    if (!delta) return
    const radios = [...group.current.querySelectorAll('[role="radio"]')]
    const index = radios.indexOf(document.activeElement)
    if (index < 0) return
    event.preventDefault()
    const target = radios[(index + delta + radios.length) % radios.length]
    target.focus()
    onSelect(target.dataset.id, centerOf(target))
  }
  return (
    <div ref={group} role="radiogroup" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {options.map((option) => children({
        option,
        props: {
          type: 'button', role: 'radio', 'data-id': option.id, 'aria-checked': value === option.id, tabIndex: value === option.id ? 0 : -1,
          onClick: (event) => onSelect(option.id, centerOf(event.currentTarget)),
        },
      }))}
    </div>
  )
}

// Tema (claro, oscuro o el del equipo) y color de acento. Se recuerda en este navegador.
export default function ThemeSwitcher() {
  const { mode, accent, setMode, setAccent } = useTheme()
  const current = ACCENTS.find((item) => item.id === accent) ?? ACCENTS[0]
  return (
    <>
      <fieldset>
        <legend>Tema</legend>
        <RadioGroup label="Tema" value={mode} options={MODES} onSelect={setMode} className="tf-theme-modes">
          {({ option, props }) => {
            const Icon = MODE_ICONS[option.id]
            return <button key={option.id} className="tf-theme-mode" {...props}><Icon size={17} aria-hidden="true" />{option.label}</button>
          }}
        </RadioGroup>
      </fieldset>
      <fieldset>
        <legend>Color</legend>
        <RadioGroup label="Color" value={accent} options={ACCENTS} onSelect={setAccent} className="tf-theme-accents">
          {({ option, props }) => (
            <button key={option.id} className="tf-theme-swatch" style={{ '--swatch': option.swatch }} aria-label={option.label} {...props}>
              <Check size={16} strokeWidth={3} aria-hidden="true" />
            </button>
          )}
        </RadioGroup>
        <p className="tf-theme-caption" aria-live="polite">{current.label}. Cambia botones, enlaces y el elemento activo del menú.</p>
      </fieldset>
    </>
  )
}
