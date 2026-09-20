const LEGACY_PERMISSIONS = {
  OWNER: ['*'],
  ADMINISTRADOR: ['*'],
  SUPER_ADMIN: ['*'],
  TECNICO: ['dashboard.view', 'repairs.view', 'repairs.update', 'repairs.change_status', 'clients.view', 'devices.view', 'diagnostics.view', 'diagnostics.create', 'diagnostics.ai', 'inventory.view', 'inventory.adjust_stock', 'whatsapp.view', 'whatsapp.send'],
  RECEPCION: ['dashboard.view', 'clients.view', 'clients.create', 'clients.update', 'devices.view', 'devices.create', 'devices.update', 'repairs.view', 'repairs.create', 'repairs.update', 'repairs.change_status', 'quotes.view', 'quotes.create', 'quotes.update', 'payments.view', 'payments.create', 'warranties.view', 'warranties.create', 'whatsapp.view', 'whatsapp.send'],
  CAJERO: ['dashboard.view', 'repairs.view', 'quotes.view', 'payments.view', 'payments.create', 'payments.update'],
}

export function effectivePermissions(profile) {
  // Cuando el rol existe en las tablas RBAC (roles/role_permissions), su conjunto de
  // permisos es la fuente autoritativa incluso si está vacío: revocar todos los
  // permisos debe revocar el acceso real y no restaurar los permisos heredados.
  if (profile?.permissionsSource === 'rbac') {
    return Array.isArray(profile.permissions) ? profile.permissions : []
  }
  return Array.isArray(profile?.permissions) && profile.permissions.length
    ? profile.permissions
    : LEGACY_PERMISSIONS[profile?.role] ?? []
}

export function hasPermission(profile, permission) {
  const permissions = effectivePermissions(profile)
  return permissions.includes('*') || permissions.includes(permission)
}

export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.profile) return res.status(401).json({ message: 'No autorizado' })
    if (!permissions.some((permission) => hasPermission(req.profile, permission))) {
      return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' })
    }
    next()
  }
}
