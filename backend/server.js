import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
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
import { securityHeaders } from './middleware/security.js'


const app = express()
const PORT = process.env.PORT || 4000
const HOST = process.env.HOST || '0.0.0.0'

const defaultOrigins = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins).split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(securityHeaders)
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }))
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json' }), whatsappWebhookRoutes)
app.use(express.json())

app.use('/api/health', healthRoutes)
app.use('/health', healthRoutes)
app.use('/api/auth', authRoutes)
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
const publicDir = path.join(__dirname, 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }))
}
// Fallback SPA para rutas que no sean API. (El 404 JSON sigue activo para el resto.)
app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
  if (!fs.existsSync(publicDir)) return next()
  res.sendFile(path.join(publicDir, 'index.html'))
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(PORT, HOST, () => {
  console.log(`CARLOSTECH AI backend escuchando en http://${HOST}:${PORT}`)
  startWhatsAppWorker(supabaseAdmin)
})
