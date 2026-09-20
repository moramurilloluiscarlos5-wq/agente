// Datos de demostración temporales para el Dashboard.
// Se reemplazarán por datos reales del backend/Supabase en la Fase 3.
export const dashboardStats = {
  today: 6,
  pending: 14,
  diagnostics: 4,
  inRepair: 7,
  waitingParts: 3,
  ready: 5,
  delivered: 128,
  revenueToday: 3450,
  revenueMonth: 68420,
}

export const recentRepairs = [
  { orderNumber: 'CAR-2026-0001', customer: 'Juan Pérez', device: 'iPhone 13', status: 'diagnostico', receivedAt: '2026-09-17' },
  { orderNumber: 'CAR-2026-0002', customer: 'María López', device: 'Samsung Galaxy A15', status: 'esperando_autorizacion', receivedAt: '2026-09-17' },
  { orderNumber: 'CAR-2026-0003', customer: 'Carlos Ramírez', device: 'Motorola Edge 40', status: 'en_reparacion', receivedAt: '2026-09-16' },
  { orderNumber: 'CAR-2026-0004', customer: 'Ana Torres', device: 'iPhone 11', status: 'listo_para_entregar', receivedAt: '2026-09-15' },
  { orderNumber: 'CAR-2026-0005', customer: 'Luis Herrera', device: 'Xiaomi Redmi Note 12', status: 'esperando_refaccion', receivedAt: '2026-09-14' },
]

export const inventoryAlerts = [
  { id: 1, type: 'stock', title: 'Stock bajo: Pantalla iPhone 13', description: 'Quedan 2 piezas, mínimo configurado: 5.' },
  { id: 2, type: 'warranty', title: 'Garantía próxima a vencer', description: 'Orden CAR-2026-0032 vence en 3 días.' },
  { id: 3, type: 'overdue', title: 'Equipo excedió fecha estimada', description: 'Orden CAR-2026-0028 debía entregarse ayer.' },
]

export const revenueChartData = [
  { label: 'Lun', value: 2100 },
  { label: 'Mar', value: 2800 },
  { label: 'Mié', value: 1950 },
  { label: 'Jue', value: 3400 },
  { label: 'Vie', value: 3100 },
  { label: 'Sáb', value: 4200 },
  { label: 'Dom', value: 1800 },
]

export const upcomingDeliveries = [
  { orderNumber: 'CAR-2026-0004', customer: 'Ana Torres', device: 'iPhone 11', estDelivery: '2026-09-18', status: 'listo_para_entregar' },
  { orderNumber: 'CAR-2026-0003', customer: 'Carlos Ramírez', device: 'Motorola Edge 40', estDelivery: '2026-09-18', status: 'en_reparacion' },
  { orderNumber: 'CAR-2026-0001', customer: 'Juan Pérez', device: 'iPhone 13', estDelivery: '2026-09-19', status: 'diagnostico' },
]

export const recentCustomers = [
  { name: 'Juan Pérez', phone: '+52 555 246 8101', orders: 3, lastVisit: '2026-09-17' },
  { name: 'María López', phone: '+52 555 369 2580', orders: 1, lastVisit: '2026-09-17' },
  { name: 'Carlos Ramírez', phone: '+52 555 147 8529', orders: 5, lastVisit: '2026-09-16' },
  { name: 'Ana Torres', phone: '+52 555 963 7410', orders: 2, lastVisit: '2026-09-15' },
]
