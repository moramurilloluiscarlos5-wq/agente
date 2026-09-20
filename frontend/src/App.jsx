import { Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './layouts/RequireAuth.jsx'
import RequirePermission from './layouts/RequirePermission.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Repairs from './pages/Repairs.jsx'
import NewRepair from './pages/NewRepair.jsx'
import RepairDetail from './pages/RepairDetail.jsx'
import Customers from './pages/Customers.jsx'
import Devices from './pages/Devices.jsx'
import AIDiagnostic from './pages/AIDiagnostic.jsx'
import Quotes from './pages/Quotes.jsx'
import Inventory from './pages/Inventory.jsx'
import Payments from './pages/Payments.jsx'
import Warranties from './pages/Warranties.jsx'
import Communications from './pages/Communications.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Staff from './pages/Staff.jsx'
import SearchResults from './pages/SearchResults.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import NotFound from './pages/NotFound.jsx'
import Audit from './pages/Audit.jsx'
import Roles from './pages/Roles.jsx'
import PublicTracking from './pages/PublicTracking.jsx'
import RegisterWorkshop from './pages/RegisterWorkshop.jsx'
import WorkshopSuspended from './pages/WorkshopSuspended.jsx'
import DeviceTools from './pages/DeviceTools.jsx'

export default function App() {
  return (
    <Routes>
      {/* Público */}
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
          <Route path="/personal" element={<RequirePermission permission="users.view"><Staff /></RequirePermission>} />
          <Route path="/auditoria" element={<RequirePermission permission="audit.view"><Audit /></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.view"><Roles /></RequirePermission>} />
          <Route path="/buscar" element={<SearchResults />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
