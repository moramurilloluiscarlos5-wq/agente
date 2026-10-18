import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './layouts/RequireAuth.jsx'
import RequirePermission from './layouts/RequirePermission.jsx'
import LicenseRedirect from './components/billing/LicenseRedirect.jsx'
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
const DeviceTools = lazy(() => import('./pages/DeviceTools.jsx'))

const Billing = lazy(() => import('./pages/Billing.jsx'))
const Pricing = lazy(() => import('./pages/Pricing.jsx'))

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
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reparaciones" element={<Repairs />} />
          <Route path="/reparaciones/nueva" element={<NewRepair />} />
          <Route path="/reparaciones/:orderNumber" element={<RepairDetail />} />
          <Route path="/clientes" element={<Customers />} />
          <Route path="/dispositivos" element={<Devices />} />
          <Route path="/herramientas-dispositivo" element={<RequirePermission permission="devices.view"><DeviceTools /></RequirePermission>} />
          <Route path="/diagnostico-ia" element={<AIDiagnostic />} />
          <Route path="/cotizaciones" element={<Quotes />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/pagos" element={<Payments />} />
          <Route path="/garantias" element={<Warranties />} />
          <Route path="/comunicaciones" element={<Communications />} />
          <Route path="/reportes" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
          <Route path="/configuracion" element={<RequirePermission permission="settings.view"><Settings /></RequirePermission>} />
          <Route path="/facturacion" element={<Billing />} />
          <Route path="/personal" element={<RequirePermission permission="users.view"><Staff /></RequirePermission>} />
          <Route path="/auditoria" element={<RequirePermission permission="audit.view"><Audit /></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.view"><Roles /></RequirePermission>} />
          <Route path="/buscar" element={<SearchResults />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}
