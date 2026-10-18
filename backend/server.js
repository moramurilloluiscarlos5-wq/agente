import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import healthRoutes from './routes/health.routes.js'
import authRoutes from './routes/auth.routes.js'
import trackingRoutes from './routes/tracking.routes.js'
import operationsRoutes from './routes/operations.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import inventoryRoutes from './routes/inventory.routes.js'
import quotesRoutes from './routes/quotes.routes.js'
import paymentsRoutes from './routes/payments.routes.js'
import warrantiesRoutes from './routes/warranties.routes.js'
import aiRoutes from './routes/ai.routes.js'
import searchRoutes from './routes/search.routes.js'
import securityRoutes from './routes/security.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import whatsappRoutes from './routes/whatsapp.routes.js'
import whatsappWebhookRoutes from './routes/whatsappWebhook.routes.js'
import deviceToolsRoutes from './routes/deviceTools.routes.js'
import deviceAgentRoutes from './routes/deviceAgent.routes.js'
import { supabaseAdmin } from './config/supabase.js'
import { startWhatsAppWorker } from './services/whatsappService.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { securityHeaders, CSP_REPORT_PATH } from './middleware/security.js'
import { createBillingRouter, createBillingWebhookHandler } from './routes/billing.routes.js'
import { createCspReportRouter } from './routes/cspReport.routes.js'
import { mountSpa } from './middleware/spa.js'
import { installLifecycleHandlers } from './utils/lifecycle.js'
import { assertBillingConfig, loadBillingConfig, licensingEnabled } from './config/billing.js'


const app = express()
// Railway (y cualquier proxy delante de Express) reenvía la IP real en
// X-Forwarded-For. Sin esto todos los usuarios comparten la IP del proxy: los
// límites de peticiones serían globales y la auditoría guardaría una IP falsa.
// TRUST_PROXY permite ajustar el número de saltos; en producción se confía en 1.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '')
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy)
const PORT = process.env.PORT || 4000
const HOST = process.env.HOST || '0.0.0.0'

const defaultOrigins = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins).split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(securityHeaders)
// Producción no arranca sin facturación completa; fuera de producción solo se avisa.
if (!licensingEnabled()) {
  console.warn('Licencias DESACTIVADAS (LICENSING_ENABLED=false): ningún taller se bloquea por licencia.')
} else if (process.env.NODE_ENV === 'production') {
  const billing = assertBillingConfig()
  console.log(`Facturación Stripe en modo ${billing.testMode ? 'PRUEBA (test)' : 'REAL (live)'}`)
} else if (!loadBillingConfig().ok) {
  console.warn('Facturación Stripe sin configurar: las rutas /api/billing responderán 503 (ver README, Licencias).')
}
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }))
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), createBillingWebhookHandler())
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json' }), whatsappWebhookRoutes)
app.use(express.json())

app.use('/api/health', healthRoutes)
app.use('/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/billing', createBillingRouter())
// Público y antes del router genérico `/api` (que exige sesión): el navegador reporta sin credenciales.
app.use(CSP_REPORT_PATH, createCspReportRouter())
// El endpoint de actualización del agente es público para que el instalador
// pueda consultar la descarga antes de que exista una sesión en la aplicación.
// Debe montarse antes del router genérico de tracking (`/api`), que protege
// todas las rutas restantes con autenticación.
app.use('/api/device-agent', deviceAgentRoutes)
app.use('/api', trackingRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/quotes', quotesRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/warranties', warrantiesRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/security', securityRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/device-tools', deviceToolsRoutes)
app.use('/api', operationsRoutes)

// Servir archivos compilados del frontend cuando existan (producción).
// Ignorar el directorio si falta para no romper el modo desarrollo local.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
mountSpa(app, path.join(__dirname, 'public'))

app.use(notFoundHandler)
app.use(errorHandler)

let whatsappWorker = null
const server = app.listen(PORT, HOST, () => {
  console.log(`TallerFlow backend escuchando en http://${HOST}:${PORT}`)
  whatsappWorker = startWhatsAppWorker(supabaseAdmin)
})
// Se instala después de arrancar: un fallo de configuración al iniciar debe seguir tumbando el proceso.
installLifecycleHandlers({ server, onShutdown: () => clearInterval(whatsappWorker) })
