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
  UserCog,
  WalletCards,
} from 'lucide-react'

// Navegación agrupada por la forma en que trabaja un taller: el día a día
// arriba, el negocio en medio y la administración al final.
export const NAV_SECTIONS = ['Taller', 'Herramientas', 'Negocio', 'Administración']

export const NAV_ITEMS = [
  { label: 'Panel', title: 'Panel de control', path: '/', icon: LayoutDashboard, section: 'Taller', permission: 'dashboard.view' },
  { label: 'Reparaciones', path: '/reparaciones', icon: Wrench, section: 'Taller', permission: 'repairs.view' },
  { label: 'Clientes', path: '/clientes', icon: Users, section: 'Taller', permission: 'clients.view' },
  { label: 'Dispositivos', path: '/dispositivos', icon: Smartphone, section: 'Taller', permission: 'devices.view' },
  { label: 'Diagnóstico IA', path: '/diagnostico-ia', icon: Bot, section: 'Herramientas', permission: 'diagnostics.view' },
  { label: 'Herramientas ADB', title: 'Herramientas ADB / Fastboot', path: '/herramientas-dispositivo', icon: Cpu, section: 'Herramientas', permission: 'devices.view' },
  { label: 'Cotizaciones', path: '/cotizaciones', icon: Receipt, section: 'Negocio', permission: 'quotes.view' },
  { label: 'Pagos', path: '/pagos', icon: CreditCard, section: 'Negocio', permission: 'payments.view' },
  { label: 'Inventario', path: '/inventario', icon: Package, section: 'Negocio', permission: 'inventory.view' },
  { label: 'Garantías', path: '/garantias', icon: ShieldCheck, section: 'Negocio', permission: 'warranties.view' },
  { label: 'Comunicaciones', path: '/comunicaciones', icon: MessageCircle, section: 'Negocio', permission: 'whatsapp.view' },
  { label: 'Reportes', path: '/reportes', icon: BarChart3, section: 'Negocio', permission: 'reports.view' },
  { label: 'Personal', path: '/personal', icon: UserCog, section: 'Administración', permission: 'users.view' },
  { label: 'Roles y permisos', path: '/roles', icon: KeyRound, section: 'Administración', roles: ['SUPER_ADMIN'], permission: 'roles.view' },
  { label: 'Auditoría', path: '/auditoria', icon: ClipboardList, section: 'Administración', permission: 'audit.view' },
  { label: 'Facturación', path: '/facturacion', icon: WalletCards, section: 'Administración', roles: ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN'] },
  { label: 'Configuración', path: '/configuracion', icon: Settings, section: 'Administración', permission: 'settings.view' },
]

// Título visible de cada sección (barra superior y pestaña del navegador).
export function sectionTitle(pathname) {
  if (pathname === '/' || pathname === '/dashboard') return 'Panel de control'
  if (pathname.startsWith('/buscar')) return 'Búsqueda'
  if (pathname.startsWith('/guia')) return 'Guía del sistema'
  const item = NAV_ITEMS.find((entry) => entry.path !== '/' && pathname.startsWith(entry.path))
  return item?.title ?? item?.label ?? 'TallerFlow'
}

// Estados oficiales del flujo de reparación con estilos ya resueltos para Tailwind (evita clases dinámicas).
// `hint` explica el estado en palabras del mostrador (Guía del sistema).
export const REPAIR_STATUSES = {
  recibido: { label: 'Recibido', badgeClass: 'ct-status ct-status-neutral', hint: 'El equipo llegó al mostrador y espera revisión.' },
  diagnostico: { label: 'Diagnóstico', badgeClass: 'ct-status ct-status-info', hint: 'Un técnico está revisando qué tiene.' },
  esperando_autorizacion: { label: 'Esperando autorización', badgeClass: 'ct-status ct-status-warning', hint: 'Ya hay cotización; falta que el cliente apruebe el costo.' },
  esperando_refaccion: { label: 'Esperando refacción', badgeClass: 'ct-status ct-status-warning', hint: 'La reparación está detenida hasta que llegue la pieza.' },
  en_reparacion: { label: 'En reparación', badgeClass: 'ct-status ct-status-info', hint: 'El técnico está trabajando en el equipo.' },
  en_pruebas: { label: 'En pruebas', badgeClass: 'ct-status ct-status-info', hint: 'Ya se reparó; se comprueba que todo funcione.' },
  listo_para_entregar: { label: 'Listo para entregar', badgeClass: 'ct-status ct-status-success', hint: 'Terminado. Avisa al cliente para que pase por él.' },
  entregado: { label: 'Entregado', badgeClass: 'ct-status ct-status-success', hint: 'El cliente recogió su equipo; desde aquí corre la garantía.' },
  cancelado: { label: 'Cancelado', badgeClass: 'ct-status ct-status-danger', hint: 'No se reparó: el cliente no aceptó o el equipo no tuvo arreglo.' },
}

// Etiquetas y tonos de estados del negocio (coinciden con los valores del backend).
export const PAYMENT_METHODS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }
export const PAYMENT_STATUSES = {
  pagado: { label: 'Pagado', tone: 'success' },
  parcial: { label: 'Parcial', tone: 'info' },
  pendiente: { label: 'Pendiente', tone: 'warning' },
}
export const QUOTE_STATUSES = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
  vencida: { label: 'Vencida', tone: 'neutral' },
  completada: { label: 'Completada', tone: 'info' },
}
export const WARRANTY_STATUSES = {
  activa: { label: 'Activa', tone: 'success' },
  vencida: { label: 'Vencida', tone: 'neutral' },
  invalidada: { label: 'Invalidada', tone: 'danger' },
}
export const INVENTORY_CATEGORIES = {
  Pantallas: 'Pantallas', Baterias: 'Baterías', Centros_de_carga: 'Centros de carga', Flex: 'Flex', Camaras: 'Cámaras',
  Bocinas: 'Bocinas', Microfonos: 'Micrófonos', Herramientas: 'Herramientas', Accesorios: 'Accesorios', Otros: 'Otros',
}

// Roles que el backend acepta para escribir en cada módulo (además de OWNER y SUPER_ADMIN).
export const WRITE_ROLES = {
  payments: ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'CAJERO', 'SUPER_ADMIN'],
  quotes: ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN'],
  warranties: ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN'],
  inventory: ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'TECNICO', 'SUPER_ADMIN'],
  admin: ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN'],
}
