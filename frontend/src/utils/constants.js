import {
  LayoutDashboard,
  Wrench,
  Users,
  Smartphone,
  Bot,
  Receipt,
  Package,
  CreditCard,
  ShieldCheck,
  MessageCircle,
  BarChart3,
  Settings,
  ClipboardList,
  KeyRound,
  Cpu,
} from 'lucide-react'

export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, section: 'Operación', permission: 'dashboard.view' },
  { label: 'Reparaciones', path: '/reparaciones', icon: Wrench, section: 'Operación', permission: 'repairs.view' },
  { label: 'Clientes', path: '/clientes', icon: Users, section: 'Operación', permission: 'clients.view' },
  { label: 'Dispositivos', path: '/dispositivos', icon: Smartphone, section: 'Operación', permission: 'devices.view' },
  { label: 'Herramientas ADB', path: '/herramientas-dispositivo', icon: Cpu, section: 'Operación', permission: 'devices.view' },
  { label: 'Diagnóstico IA', path: '/diagnostico-ia', icon: Bot, section: 'Operación', permission: 'diagnostics.view' },
  { label: 'Cotizaciones', path: '/cotizaciones', icon: Receipt, section: 'Finanzas', permission: 'quotes.view' },
  { label: 'Inventario', path: '/inventario', icon: Package, section: 'Taller', permission: 'inventory.view' },
  { label: 'Pagos', path: '/pagos', icon: CreditCard, section: 'Finanzas', permission: 'payments.view' },
  { label: 'Garantías', path: '/garantias', icon: ShieldCheck, section: 'Taller', permission: 'warranties.view' },
  { label: 'Comunicaciones', path: '/comunicaciones', icon: MessageCircle, section: 'Taller', permission: 'whatsapp.view' },
  { label: 'Reportes', path: '/reportes', icon: BarChart3, section: 'Gestión', permission: 'reports.view' },
  { label: 'Configuración', path: '/configuracion', icon: Settings, section: 'Configuración', permission: 'settings.view' },
  { label: 'Personal', path: '/personal', icon: Users, section: 'Configuración', permission: 'users.view' },
  { label: 'Roles y permisos', path: '/roles', icon: KeyRound, section: 'Configuración', roles: ['SUPER_ADMIN'], permission: 'roles.view' },
  { label: 'Auditoría', path: '/auditoria', icon: ClipboardList, section: 'Configuración', permission: 'audit.view' },
]

// Estados oficiales del flujo de reparación con estilos ya resueltos para Tailwind (evita clases dinámicas).
export const REPAIR_STATUSES = {
  recibido: { label: 'Recibido', badgeClass: 'ct-status ct-status-neutral' },
  diagnostico: { label: 'Diagnóstico', badgeClass: 'ct-status ct-status-info' },
  esperando_autorizacion: { label: 'Esperando autorización', badgeClass: 'ct-status ct-status-warning' },
  esperando_refaccion: { label: 'Esperando refacción', badgeClass: 'ct-status ct-status-warning' },
  en_reparacion: { label: 'En reparación', badgeClass: 'ct-status ct-status-info' },
  en_pruebas: { label: 'En pruebas', badgeClass: 'ct-status ct-status-info' },
  listo_para_entregar: { label: 'Listo para entregar', badgeClass: 'ct-status ct-status-success' },
  entregado: { label: 'Entregado', badgeClass: 'ct-status ct-status-success' },
  cancelado: { label: 'Cancelado', badgeClass: 'ct-status ct-status-danger' },
}
