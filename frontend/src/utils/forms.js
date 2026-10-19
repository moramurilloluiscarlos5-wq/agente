// Lleva el foco al primer campo con error después de un envío incompleto.
export function focusFirstInvalid(formId) {
  requestAnimationFrame(() => {
    const target = document.getElementById(formId)?.querySelector('[aria-invalid="true"]')
    if (!target) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })
}

