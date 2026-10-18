# CARLOSTECH AI

Sistema interno de gestión para servicio técnico de celulares: clientes, dispositivos, reparaciones, diagnósticos, cotizaciones, inventario, pagos, garantías, reportes y asistente de IA.

> **Estado (octubre 2026):** en producción en Railway. Multi-taller (OWNER, ADMINISTRADOR, TÉCNICO, RECEPCIÓN, CAJERO y SUPER_ADMIN), reparaciones, seguimiento público con QR/PDF, cotizaciones, inventario, pagos, garantías, reportes, IA, WhatsApp y Device Tools (ADB/Fastboot). La interfaz se presenta como **FixCore**. Ver `AUDITORIA_FASES.md` y `DEPLOYMENT.md`.

---

## Autenticación y Supabase (Fase 2)

La plataforma usa **Supabase Auth** + **Row Level Security**. El login es real: las rutas protegidas redirigen a `/login` si no hay sesión.

### 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) → **New project**.
2. Copia del panel **Settings → API**:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY` (frontend)
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` (backend, **nunca** exponerla en el frontend)

### 2. Cargar el esquema

Abre **SQL Editor** en el panel de Supabase, pega el contenido de `database/schema.sql` y ejecuta. Crea las tablas, índices, triggers, numeración automática de órdenes (`CAR-2026-XXXX`), perfiles y todas las políticas RLS por rol.

Opcional: ejecuta también `database/seed.sql` para cargar datos de demostración.

### 3. Configurar variables de entorno

Consulta el apartado **Variables de entorno** de abajo. Ya existen `frontend/.env` y `backend/.env` a partir de los ejemplos.

### 4. Crear el primer usuario administrador

Con el esquema cargado, crea el admin directamente en **Authentication → Users → Add user** (correo + contraseña) y luego promuévelo en **Table Editor → profiles** cambiando su `role` a `ADMINISTRADOR`. El resto del personal puede crearse desde la API por un admin:

```bash
# Desde el panel de administración (Fase 3) o con esta llamada:
curl -X POST http://localhost:4000/api/auth/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_del_admin>" \
  -d '{"email":"tecnico@carlostech.mx","password":"cambia-esta-clave","full_name":"Técnico Demo","role":"TECNICO"}'
```

### Endpoints de autenticación

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `login` (Supabase Auth, desde el frontend) | Público |
| `GET` | `/api/auth/me` | Autenticado |
| `GET` | `/api/auth/users` | ADMINISTRADOR |
| `POST` | `/api/auth/users` | ADMINISTRADOR (crear personal) |
| `PATCH` | `/api/auth/users/:id/role` | ADMINISTRADOR |
| `PATCH` | `/api/auth/users/:id/status` | ADMINISTRADOR |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 · Vite 8 · JavaScript moderno · Tailwind CSS 4 · React Router 7 · Lucide Icons |
| Backend | Node.js · Express.js |
| Base de datos | Supabase / PostgreSQL |
| Autenticación | Supabase Auth |
| IA | OpenAI (vía backend, nunca expone API keys en el frontend) |
| Despliegue | Vercel/Netlify (frontend) · Render/Railway/Vercel Functions (backend) · Supabase (BD) |

## Estructura del proyecto

```
CARLOSTECH-AI/
├── backend/               # API Express modular
│   ├── config/            # Configuración (env, servicios)
│   ├── controllers/       # Lógica de cada recurso
│   ├── middleware/        # Auth, roles, manejo de errores
│   ├── routes/            # Definición de rutas
│   ├── services/          # Lógica de negocio e integraciones (OpenAI, Supabase)
│   ├── utils/             # Utilidades
│   └── server.js          # Arranque del servidor
├── database/
│   ├── migrations/        # Migraciones SQL versionadas
│   └── schema.sql         # Esquema principal (tablas, índices, RLS)
├── frontend/
│   ├── public/
│   └── src/
│       ├── assets/        # Recursos estáticos
│       ├── components/    # Componentes reutilizables (sidebar, navbar, dashboard, ui)
│       ├── context/       # Contextos globales (sidebar, auth)
│       ├── hooks/         # Hooks personalizados
│       ├── layouts/       # Layouts (MainLayout)
│       ├── pages/         # Páginas por módulo
│       ├── services/      # Cliente HTTP / API
│       ├── utils/         # Constantes y formateadores
│       ├── App.jsx        # Definición de rutas
│       └── main.jsx       # Punto de entrada
└── .env.example
```

## Puesta en marcha

### ⚡ Inicio rápido (Windows)

Doble clic en **`dev.bat`** en la raíz del proyecto: instala dependencias si faltan, abre el backend (`:4000`) y el frontend (`:5173`) en ventanas propias y lanza el navegador. Para detener, cierra esas dos ventanas.

### Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### Backend

```bash
cd backend
npm install
npm run dev
# http://localhost:4000/api/health
```

### Variables de entorno

Copia cada `.env.example` a `.env` según corresponda:

- `frontend/.env` → `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `backend/.env` → `PORT`, `CORS_ORIGIN`, `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, credenciales de Supabase

> ⚠️ Nunca subir `.env` a git. Las API keys (OpenAI, roles de servicio) viven **solo en el backend**.

### Migración WhatsApp (Fase 7)

Después de cargar `database/schema.sql` y las migraciones anteriores, ejecuta
`database/migrations/005_whatsapp.sql` completo en **Supabase → SQL Editor**.
Esta migración agrega consentimiento, teléfonos normalizados, automatizaciones,
historial de mensajes y eventos del webhook. Es segura para volver a ejecutar si
una aplicación anterior quedó incompleta.

## Licencias por suscripción (Stripe)

Cada taller necesita una licencia vigente para usar el sistema. Stripe es la
fuente de verdad; la base de datos solo refleja su estado, y **únicamente el
webhook firmado** lo modifica (nunca el cliente).

### Flujo de compra

1. El dueño se registra (`/registro`): se crea el taller y una **prueba de `TRIAL_DAYS` días sin tarjeta**.
2. En `/precios` (o `/facturacion` dentro del panel) elige plan y pulsa **Comprar**. El backend crea una Checkout Session usando el taller de la **sesión** (nunca del body).
3. Paga en Stripe Checkout y vuelve a `/facturacion?checkout=success`.
4. Stripe llama a `POST /api/billing/webhook`; el backend actualiza `subscriptions` y la licencia queda activa.
5. **Gestionar pago** (solo OWNER) abre el Customer Portal para cambiar tarjeta o cancelar.

| Estado | Acceso |
| --- | --- |
| `trialing` | Mientras `trial_end` esté en el futuro |
| `active` | Sí |
| `past_due` | Sí, durante `BILLING_GRACE_DAYS` desde que falló el cobro |
| `canceled`, `unpaid`, `incomplete`, sin suscripción | No: 402 `LICENSE_REQUIRED` |

### Endpoints

| Ruta | Acceso |
| --- | --- |
| `GET /api/billing/plans` | Público |
| `GET /api/billing/subscription` | OWNER / ADMINISTRADOR |
| `POST /api/billing/checkout` `{ plan }` o `{ interval: "month"\|"year" }` | OWNER / ADMINISTRADOR (limitado a 10/min) |
| `POST /api/billing/portal` | OWNER |
| `POST /api/billing/webhook` | Stripe (firma `Stripe-Signature`, cuerpo crudo, idempotente) |

El middleware `backend/middleware/license.js` responde 402 en las rutas de negocio.
**Rutas con licencia obligatoria:** dashboard, inventario, cotizaciones, pagos, garantías,
IA, búsqueda, seguridad/auditoría, reportes, notificaciones, WhatsApp (panel), device-tools,
operaciones (reparaciones, clientes, dispositivos) y las rutas autenticadas de seguimiento.
**Excluidas** para no bloquear el pago ni el acceso: `/api/auth/*`, `/api/billing/*`, `/health`,
seguimiento público por token, webhook de WhatsApp y `/api/device-agent`. SUPER_ADMIN no se bloquea.

### Variables nuevas (solo Railway / `backend/.env`)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`,
`APP_PUBLIC_URL` (https, sin barra final), `TRIAL_DAYS` (14), `BILLING_GRACE_DAYS` (7).
En producción faltar o tener mal formato cualquiera de las cinco primeras detiene el arranque
con un mensaje que lista los nombres (nunca los valores). Fuera de producción `/api/billing`
responde 503 `BILLING_NOT_CONFIGURED`. El frontend no necesita ninguna clave de Stripe.

### Configurar Stripe

1. **Products**: crea un producto con dos precios recurrentes (mensual y anual) y copia sus `price_…`.
2. **Customer Portal** (Settings → Billing → Customer portal): activa cambio de método de pago y cancelación.
3. **Webhook** (Developers → Webhooks → Add endpoint): URL `https://TU-DOMINIO/api/billing/webhook` y los eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Copia el `whsec_…`.

### Probar en modo test

```bash
# backend/.env con claves de PRUEBA (sk_test_…, price_… de test) y APP_PUBLIC_URL=http://localhost:5173
stripe login
stripe listen --forward-to localhost:4000/api/billing/webhook   # imprime el whsec_… local → STRIPE_WEBHOOK_SECRET
stripe trigger invoice.payment_failed                            # simula eventos
```

Compra completa: regístrate, entra a `/precios`, **Comprar**, usa la tarjeta `4242 4242 4242 4242`
(cualquier fecha futura y CVC). Para un pago fallido usa `4000 0000 0000 0341`.
Pruebas automáticas: `npm --prefix backend test` (`billing.test.js` cubre firma, idempotencia, transiciones,
middleware y rutas con eventos simulados; `licensing-sql.test.js` valida RLS de la migración 019).
Pasar a producción solo cambia las variables a claves live, el `whsec_` del endpoint live y los `price_` live.

### Decisiones por defecto y riesgos

- La migración es la **019** (017 y 018 ya existían). Una suscripción por taller; el historial vive en `billing_events` y `audit_logs`.
- `workshops.status` **no** lo modifica el webhook (es la suspensión manual y provoca 403 en vez de llevar a facturación); el acceso se corta con el 402. El webhook solo refleja `workshops.plan` (PRO/FREE).
- Columnas extra: `past_due_since` (inicio de la gracia) y `last_event_at` (descarta eventos viejos); estado extra `incomplete`.
- La migración da 14 días de prueba a los talleres existentes para no bloquearlos al desplegar.
- Moneda USD y planes semilla `base_monthly` (29 USD) y `base_yearly` (290 USD): **ajusta los precios** en la tabla `plans` y en Stripe.
- Riesgo: cada registro recibe prueba gratis (abuso por múltiples registros). Mitiga con TRIAL_DAYS bajo o verificación adicional.
- Riesgo: la caché de licencia (15 s por instancia) puede retrasar el bloqueo/desbloqueo ese tiempo.
- Si faltan webhooks, una suscripción `active` se bloquea pasados `BILLING_GRACE_DAYS` desde `current_period_end`.

### Despliegue

1. Aplicar `019_licensing.sql` en Supabase (SQL Editor).
2. Configurar las variables en Railway (con claves test primero).
3. Crear productos y precios en Stripe.
4. Registrar el endpoint del webhook con los 6 eventos.
5. Probar una compra completa en test mode (y cancelación desde el portal).
6. Cambiar a claves live (secret, webhook secret y price ids live).

## Módulos del panel

- **Dashboard** — estadísticas del taller, ingresos, alertas, próximas entregas, clientes recientes y reparaciones recientes.
- **Reparaciones** — órdenes con estados, bitácora e historial.
- **Clientes y Dispositivos** — agenda de clientes y equipos asociados.
- **Diagnóstico IA** — asistencia preliminar de diagnóstico (a confirmar por un técnico).
- **Cotizaciones, Inventario, Pagos, Garantías** — gestión del negocio.
- **Reportes** — métricas e ingresos.
- **Configuración** — datos del negocio y apariencia.

## Estados de reparación

`Recibido` · `Diagnóstico` · `Esperando autorización` · `Esperando refacción` · `En reparación` · `En pruebas` · `Listo para entregar` · `Entregado` · `Cancelado`

## Roles

`ADMINISTRADOR` (todo) · `TECNICO` (órdenes asignadas, estados, diagnósticos, IA) · `RECEPCIÓN` (clientes, equipos, órdenes, pagos).

Los permisos están aplicados en tres capas:
1. **Base de datos**: políticas RLS por rol en todas las tablas (`database/schema.sql`).
2. **Backend**: middleware `requireAuth` (JWT) + `requireRole(...)` en Express.
3. **Frontend**: rutas protegidas con `RequireAuth` (la seguridad no depende de ocultar botones).

## Hoja de ruta

| Fase | Alcance |
|---|---|
| 1 ✅ | Proyecto React + Vite, Tailwind, layout, sidebar, dashboard, rutas |
| 2 ✅ | Supabase, autenticación, esquema de BD, roles y RLS |
| 3 ✅ | Clientes, dispositivos, reparaciones e historial |
| 4 🟡 | Cotizaciones, inventario, pagos, garantías (API completa; en la web solo hay listados) |
| 5 ✅ | Proveedor IA desacoplado, diagnóstico validado y asistente |
| 6 ✅ | Reportes, búsqueda por taller y notificaciones |
| 7 🟡 | Optimización, seguridad, pruebas y producción |
