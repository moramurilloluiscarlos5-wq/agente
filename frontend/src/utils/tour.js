import { MODULE_HELP } from './help.js'
import { FEATURE_BY_PATH, FEATURE_MIN_TIER, TIER_NAMES, planIncludes } from './billing.js'

// Recorrido guiado sobre la pantalla real: un paso por cada opción del menú que la persona
// puede ver y los controles de la barra superior. Los textos salen de la ayuda del menú
// (utils/help.js) para que el recorrido, el globo del menú y "Cómo funciona" digan lo mismo.
// `area` indica dónde vive el elemento: en celular el menú lateral se abre para mostrarlo.

export const tourDoneKey = (userId) => `tf-tour-done:${userId ?? 'anon'}`

export function buildTourSteps({ items, profile, canCreateRepairs }) {
  const steps = [
    { id: 'welcome', title: 'Te damos la bienvenida a TallerFlow', body: 'En un par de minutos te mostramos qué hace cada opción del menú. Puedes salir cuando quieras con Omitir y repetirlo después.' },
    { id: 'workspace', target: '[data-tour="workspace"]', area: 'sidebar', title: 'Tu taller', body: 'El nombre de tu taller y el estado de tu plan: prueba gratuita, plan activo o pago pendiente.' },
  ]
  for (const item of items) {
    const help = MODULE_HELP[item.path]
    const feature = FEATURE_BY_PATH[item.path]
    const lockedTier = planIncludes(profile, feature) ? null : TIER_NAMES[FEATURE_MIN_TIER[feature]]
    steps.push({
      id: `nav:${item.path}`,
      target: `[data-tour="nav:${item.path}"]`,
      area: 'sidebar',
      title: item.title ?? item.label,
      body: help?.description ?? '',
      hint: lockedTier ? { label: 'Tu plan:', text: `disponible desde el plan ${lockedTier}.` } : help?.when ? { label: 'Cuándo usarla:', text: help.when } : null,
    })
  }
  steps.push({ id: 'search', target: '[data-tour="search"]', area: 'navbar', title: 'Buscar', body: 'Encuentra un cliente, una orden o un IMEI desde cualquier pantalla.', hint: { label: 'Atajo:', text: 'Ctrl K en computadora.' } })
  if (canCreateRepairs) steps.push({ id: 'new-repair', target: '[data-tour="new-repair"]', area: 'navbar', title: 'Registrar reparación', body: 'El atajo más usado: abre una orden nueva en cuanto llega un equipo al mostrador.' })
  steps.push({ id: 'notifications', target: '[data-tour="notifications"]', area: 'navbar', title: 'Notificaciones', body: 'Avisos del sistema, como refacciones por agotarse o cambios importantes en tus órdenes.' })
  steps.push({ id: 'theme', target: '[data-tour="theme"]', area: 'navbar', title: 'Apariencia', body: 'Elige el tema claro u oscuro y el color de TallerFlow. Se recuerda en este navegador.' })
  steps.push({ id: 'account', target: '[data-tour="account"]', area: 'navbar', title: 'Tu cuenta', body: 'Tus datos, la guía completa, la facturación y el botón para cerrar sesión.' })
  steps.push({ id: 'finish', target: '[data-tour="tour-launcher"]', area: 'sidebar', title: '¡Listo!', body: 'Ya conoces cada opción de TallerFlow. Repite este recorrido cuando quieras desde aquí.' })
  return steps
}

// Solo los pasos cuyo elemento está en pantalla (p. ej. el botón de reparación se oculta en celular).
export function visibleSteps(steps, doc = document) {
  return steps.filter((step) => {
    if (!step.target) return true
    const element = doc.querySelector(step.target)
    return Boolean(element && element.getClientRects().length)
  })
}
