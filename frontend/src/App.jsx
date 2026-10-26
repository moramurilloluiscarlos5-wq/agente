import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './layouts/RequireAuth.jsx'
import RequirePermission from './layouts/RequirePermission.jsx'
import LicenseRedirect from './components/billing/LicenseRedirect.jsx'
import PlanGate from './components/billing/PlanGate.jsx'
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Repairs = lazy(() => import('./pages/Repairs.jsx'))
const NewRepair = lazy(() => import('./pages/NewRepair.jsx'))
const RepairDetail = lazy(() => import('./pages/RepairDetail.jsx'))
const Customers = lazy(() => import('./pages/Customers.jsx'))
const Devices = lazy(() => import('./pages/Devices.jsx'))
const AIDiagnostic = lazy(() => import('./pages/AIDiagnostic.jsx'))
const Quotes = lazy(() => import('./pages/Quotes.jsx'))
const Inventory = lazy(() => import('./pages/Inventory.jsx'))
const Payments = lazy(() => import('./pages/Payments.jsx'))
const Warranties = lazy(() => import('./pages/Warranties.jsx'))
const Communications = lazy(() => import('./pages/Communications.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Staff = lazy(() => import('./pages/Staff.jsx'))
const SearchResults = lazy(() => import('./pages/SearchResults.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const Audit = lazy(() => import('./pages/Audit.jsx'))
const Roles = lazy(() => import('./pages/Roles.jsx'))
const PublicTracking = lazy(() => import('./pages/PublicTracking.jsx'))
const RegisterWorkshop = lazy(() => import('./pages/RegisterWorkshop.jsx'))
const WorkshopSuspended = lazy(() => import('./pages/WorkshopSuspended.jsx'))
const LicenseExpired = lazy(() => import('./pages/LicenseExpired.jsx'))
const DeviceTools = lazy(() => import('./pages/DeviceTools.jsx'))

const PaymentFormPage = lazy(() => import('./pages/Payments.jsx').then((m) => ({ default: m.PaymentFormPage })))
const QuoteFormPage = lazy(() => import('./pages/Quotes.jsx').then((m) => ({ default: m.QuoteFormPage })))
const WarrantyFormPage = lazy(() => import('./pages/Warranties.jsx').then((m) => ({ default: m.WarrantyFormPage })))
const ItemFormPage = lazy(() => import('./pages/Inventory.jsx').then((m) => ({ default: m.ItemFormPage })))
const StockFormPage = lazy(() => import('./pages/Inventory.jsx').then((m) => ({ default: m.StockFormPage })))
const RepairEditPage = lazy(() => import('./pages/RepairDetail.jsx').then((m) => ({ default: m.RepairEditPage })))
const CustomerDetailPage = lazy(() => import('./pages/Customers.jsx').then((m) => ({ default: m.CustomerDetailPage })))
const DeviceDetailPage = lazy(() => import('./pages/Devices.jsx').then((m) => ({ default: m.DeviceDetailPage })))
const CustomerFormPage = lazy(() => import('./pages/Customers.jsx').then((m) => ({ default: m.CustomerFormPage })))
const DeviceFormPage = lazy(() => import('./pages/Devices.jsx').then((m) => ({ default: m.DeviceFormPage })))
const StaffFormPage = lazy(() => import('./pages/Staff.jsx').then((m) => ({ default: m.StaffFormPage })))
const Billing = lazy(() => import('./pages/Billing.jsx'))
const Pricing = lazy(() => import('./pages/Pricing.jsx'))
const Guide = lazy(() => import('./pages/Guide.jsx'))

export default function App() {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-[var(--tf-text-muted)]">Cargando página…</p>}>
    <LicenseRedirect />
    <Routes>
      {/* Público */}
      <Route path="/precios" element={<Pricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/restablecer-contrasena" element={<ResetPassword />} />
      <Route path="/registro" element={<RegisterWorkshop />} />
      <Route path="/seguimiento/:token" element={<PublicTracking />} />

      {/* Protegidas: requieren sesión (Supabase Auth) */}
      <Route element={<RequireAuth />}>
        <Route path="/crear-taller" element={<RegisterWorkshop />} />
        <Route path="/taller-suspendido" element={<WorkshopSuspended />} />
        <Route path="/licencia-vencida" element={<LicenseExpired />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reparaciones" element={<Repairs />} />
          <Route path="/reparaciones/nueva" element={<NewRepair />} />
          <Route path="/reparaciones/:orderNumber" element={<RepairDetail />} />
          <Route path="/reparaciones/:orderNumber/editar" element={<RepairEditPage />} />
          <Route path="/clientes" element={<Customers />} />
          <Route path="/dispositivos" element={<Devices />} />
          <Route path="/herramientas-dispositivo" element={<RequirePermission permission="devices.view"><PlanGate feature="device_tools"><DeviceTools /></PlanGate></RequirePermission>} />
          <Route path="/diagnostico-ia" element={<PlanGate feature="ai"><AIDiagnostic /></PlanGate>} />
          <Route path="/cotizaciones" element={<Quotes />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/pagos" element={<Payments />} />
          <Route path="/garantias" element={<Warranties />} />
          <Route path="/comunicaciones" element={<PlanGate feature="whatsapp"><Communications /></PlanGate>} />
          <Route path="/reportes" element={<RequirePermission permission="reports.view"><PlanGate feature="reports"><Reports /></PlanGate></RequirePermission>} />
          <Route path="/configuracion" element={<RequirePermission permission="settings.view"><Settings /></RequirePermission>} />
          <Route path="/facturacion" element={<Billing />} />
          <Route path="/personal" element={<RequirePermission permission="users.view"><Staff /></RequirePermission>} />
          <Route path="/auditoria" element={<RequirePermission permission="audit.view"><PlanGate feature="audit"><Audit /></PlanGate></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.view"><Roles /></RequirePermission>} />
          <Route path="/clientes/nuevo" element={<RequirePermission permission="clients.create"><CustomerFormPage /></RequirePermission>} />
          <Route path="/clientes/:id/editar" element={<RequirePermission permission="clients.update"><CustomerFormPage /></RequirePermission>} />
          <Route path="/dispositivos/nuevo" element={<RequirePermission permission="devices.create"><DeviceFormPage /></RequirePermission>} />
          <Route path="/dispositivos/:id/editar" element={<RequirePermission permission="devices.update"><DeviceFormPage /></RequirePermission>} />
          <Route path="/cotizaciones/nueva" element={<RequirePermission permission="quotes.create"><QuoteFormPage /></RequirePermission>} />
          <Route path="/cotizaciones/:id/editar" element={<RequirePermission permission="quotes.update"><QuoteFormPage /></RequirePermission>} />
          <Route path="/inventario/nuevo" element={<RequirePermission permission="inventory.create"><ItemFormPage /></RequirePermission>} />
          <Route path="/inventario/:id/editar" element={<RequirePermission permission="inventory.update"><ItemFormPage /></RequirePermission>} />
          <Route path="/inventario/:id/movimiento" element={<RequirePermission permission="inventory.adjust_stock"><StockFormPage /></RequirePermission>} />
          <Route path="/pagos/nuevo" element={<RequirePermission permission="payments.create"><PaymentFormPage /></RequirePermission>} />
          <Route path="/pagos/:id/editar" element={<RequirePermission permission="payments.update"><PaymentFormPage /></RequirePermission>} />
          <Route path="/garantias/nueva" element={<RequirePermission permission="warranties.create"><WarrantyFormPage /></RequirePermission>} />
          <Route path="/garantias/:id/editar" element={<RequirePermission permission="warranties.update"><WarrantyFormPage /></RequirePermission>} />
          <Route path="/personal/nuevo" element={<RequirePermission permission="users.create"><StaffFormPage /></RequirePermission>} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/dispositivos/:id" element={<DeviceDetailPage />} />
          <Route path="/buscar" element={<SearchResults />} />
          <Route path="/guia" element={<Guide />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}
