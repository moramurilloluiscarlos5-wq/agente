export function workspaceDestination(profile) {
  if (profile?.role === 'SUPER_ADMIN') return '/'
  if (!profile?.workshop_id) return '/crear-taller'
  if (profile?.workshop?.status !== 'ACTIVE' || !['ACTIVE', undefined].includes(profile?.workspace_access)) return '/taller-suspendido'
  return '/'
}
