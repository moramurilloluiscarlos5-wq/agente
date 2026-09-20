// Autorización por rol: requireRole('ADMINISTRADOR') o requireRole('ADMINISTRADOR', 'TECNICO')
// OWNER equivale a ADMINISTRADOR en todos los puntos de control del taller: así el
// dueño recién registrado hereda el acceso operativo sin tocar cada router.
export function requireRole(...roles) {
  // SUPER_ADMIN is the platform role and may operate every protected module.
  // OWNER is the workshop equivalent of ADMINISTRADOR, but neither role grants
  // access to another workshop because every query is scoped separately.
  const expanded = new Set(roles)
  if (roles.includes('ADMINISTRADOR')) expanded.add('OWNER')
  expanded.add('SUPER_ADMIN')
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(401).json({ message: 'No autorizado' })
    }
    if (!expanded.has(req.profile.role)) {
      return res.status(403).json({ message: 'Permiso insuficiente para realizar esta acción' })
    }
    next()
  }
}
