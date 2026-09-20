import assert from 'node:assert/strict'
import test from 'node:test'
import { effectivePermissions, hasPermission } from '../middleware/rbac.js'
import { auditSafe } from '../services/auditService.js'

test('RBAC legacy fallback grants only the intended technician permissions', () => {
  const permissions = effectivePermissions({ role: 'TECNICO' })
  assert.equal(hasPermission({ role: 'TECNICO' }, 'repairs.view'), true)
  assert.equal(hasPermission({ role: 'TECNICO' }, 'users.create'), false)
  assert.equal(permissions.includes('payments.delete'), false)
})

test('administrator wildcard grants complete access and unknown roles are denied', () => {
  assert.equal(hasPermission({ role: 'ADMINISTRADOR' }, 'anything.new'), true)
  assert.equal(hasPermission({ role: 'UNKNOWN' }, 'dashboard.view'), false)
})

test('auditSafe prevents an audit failure from breaking the business operation', async () => {
  const result = await auditSafe(Promise.reject(new Error('audit unavailable')))
  assert.equal(result, null)
})
