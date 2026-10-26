# CARLOSTECH AI

Sistema interno de gestión para servicio técnico de celulares: clientes, dispositivos, reparaciones, diagnósticos, cotizaciones, inventario, pagos, garantías, reportes y asistente de IA.

> **Estado (octubre 2026):** en producción en Railway. Multi-taller (OWNER, ADMINISTRADOR, TÉCNICO, RECEPCIÓN, CAJERO y SUPER_ADMIN), reparaciones, seguimiento público con QR/PDF, cotizaciones, inventario, pagos, garantías, reportes, IA, WhatsApp y Device Tools (ADB/Fastboot). La interfaz se presenta como **TallerFlow**. Ver `AUDITORIA_FASES.md` y `DEPLOYMENT.md`.

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

## Licencias por suscripción (Mercado Pago)

Cada taller necesita una licencia vigente para usar el sistema. Mercado Pago es la
fuente de verdad del cobro; la base de datos solo refleja su estado, y **únicamente
la notificación firmada de Mercado Pago** (o una acción del dueño confirmada por su
API) lo modifica, nunca el navegador.

### Planes

| Plan | Mensual | Anual | Usuarios activos | Incluye |
| --- | --- | --- | --- | --- |
| **Plus** | $299 MXN | $2,990 MXN | 3 | Reparaciones, clientes, equipos, cotizaciones, pagos, inventario, garantías y seguimiento con QR |
| **Pro** | $549 MXN | $5,490 MXN | 10 | Todo Plus + WhatsApp, reportes y auditoría |
| **Max** | $899 MXN | $8,990 MXN | Sin límite | Todo Pro + Diagnóstico IA y Herramientas ADB/Fastboot |

- Los precios viven en la tabla `plans` (migración 020); lo que incluye cada nivel, en `backend/config/plans.js`.
- La **prueba gratuita** (`TRIAL_DAYS`) incluye todo lo de Max.
- El servidor aplica los límites: `requireFeature()` responde 402 `PLAN_UPGRADE_REQUIRED` (IA, ADB, reportes,
  auditoría, WhatsApp) y Personal no deja crear ni reactivar cuentas por encima del límite de usuarios.
  La interfaz muestra un candado en el menú y explica en qué plan está cada sección.

### Flujo de compra

1. El dueño se registra (`/registro`): se crea el taller y una **prueba sin tarjeta**.
2. En `/facturacion` elige plan. El backend crea una suscripción de Mercado Pago (`POST /preapproval`,
   `status: pending`) con el monto del plan guardado y `external_reference` = taller de la **sesión** (nunca del body).
3. El dueño paga con tarjeta en Mercado Pago y vuelve a `/facturacion?checkout=success`.
4. Mercado Pago llama a `POST /api/billing/webhook`; el backend verifica la firma, vuelve a leer la suscripción
   en la API de Mercado Pago y activa la licencia con su plan.
5. **Cambiar de plan** (solo OWNER): con el mismo cobro se ajusta el monto de la suscripción y el plan cambia ya
   (el nuevo monto se cobra desde el siguiente pago). Entre mensual y anual se paga el plan nuevo y, al
   autorizarse, la suscripción anterior se cancela sola para no cobrar doble.
6. **Cancelar** (solo OWNER): se cancela en Mercado Pago y el taller conserva el acceso hasta el último día pagado.

**Al iniciar sesión** `/api/auth/me` incluye la licencia (`profile.license`: estado, días de prueba, motivo del
bloqueo). Con la licencia vencida, el dueño o administrador entra directo a Facturación y técnicos, recepción
y caja ven a quién pedir la renovación (`/licencia-vencida`), sin cargar datos del taller. Durante la prueba,
con un cobro rechazado o con el plan cancelado, un aviso arriba muestra los días que quedan.

| Estado | Acceso |
| --- | --- |
| `trialing` | Mientras `trial_end` esté en el futuro |
| `active` | Sí (si se canceló, hasta `current_period_end`) |
| `past_due` | Sí, durante `BILLING_GRACE_DAYS` desde el cobro rechazado (Mercado Pago reintenta 10 días) |
| `canceled`, `unpaid`, `incomplete`, sin suscripción | No: 402 `LICENSE_REQUIRED` |

### Endpoints

| Ruta | Acceso |
| --- | --- |
| `GET /api/billing/plans` | Público |
| `GET /api/billing/subscription` | OWNER / ADMINISTRADOR (estado, plan, lo que incluye y usuarios activos) |
| `POST /api/billing/checkout` `{ plan, payer_email? }` | OWNER / ADMINISTRADOR (limitado a 10/min) |
| `POST /api/billing/change-plan` `{ plan, payer_email? }` | OWNER |
| `POST /api/billing/cancel` | OWNER |
| `POST /api/billing/webhook` | Mercado Pago (firma `x-signature`, idempotente por id de notificación) |

El middleware `backend/middleware/license.js` responde 402 en las rutas de negocio.
**Rutas con licencia obligatoria:** dashboard, inventario, cotizaciones, pagos, garantías,
IA, búsqueda, seguridad/auditoría, reportes, notificaciones, WhatsApp (panel), device-tools,
operaciones (reparaciones, clientes, dispositivos) y las rutas autenticadas de seguimiento.
**Excluidas** para no bloquear el pago ni el acceso: `/api/auth/*`, `/api/billing/*`, `/health`,
seguimiento público por token, webhook de WhatsApp y `/api/device-agent`. SUPER_ADMIN no se bloquea.

### Variables (solo Railway / `backend/.env`)

`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `APP_PUBLIC_URL` (https, sin barra final), `TRIAL_DAYS` (14),
`BILLING_GRACE_DAYS` (10). En producción faltar o tener mal formato cualquiera de las tres primeras
detiene el arranque con un mensaje que lista los nombres (nunca los valores). Fuera de producción
`/api/billing` responde 503 `BILLING_NOT_CONFIGURED` en las acciones de pago (los planes se ven, pero no se
contratan). El frontend no necesita ninguna clave. Con licencias activas el arranque también comprueba que
existan las tablas de las migraciones 019 y 020: en producción no arranca sin ellas (Railway conserva el
despliegue anterior) y en local lo avisa en la consola.

### Configurar Mercado Pago

1. En [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) crea una aplicación (producto: Suscripciones).
2. **Webhooks → Configurar notificaciones**: URL `https://TU-DOMINIO/api/billing/webhook` y el evento
   **Planes y suscripciones** (`subscription_preapproval`, `subscription_authorized_payment`). Guarda y copia la
   **clave secreta** → `MP_WEBHOOK_SECRET`.
3. **Credenciales de producción → Access Token** (`APP_USR-…`) → `MP_ACCESS_TOKEN`.

### Probar antes de cobrar de verdad

Las suscripciones se prueban con **usuarios de prueba** de Mercado Pago (Tus integraciones → Cuentas de prueba):
uno vendedor y uno comprador.

1. Pon en Railway (o `backend/.env`) el Access Token **del vendedor de prueba** y la clave secreta del webhook.
   `APP_PUBLIC_URL` debe ser una URL https pública (Mercado Pago no regresa a `localhost`).
2. Entra a TallerFlow, elige un plan y, en Mercado Pago, inicia sesión con el **comprador de prueba** usando
   su correo en el campo "Correo de tu cuenta de Mercado Pago". Paga con una de las tarjetas de prueba
   que Mercado Pago lista en su documentación de pruebas.
3. Revisa que la licencia quede activa, prueba un cambio de plan y una cancelación.
4. Para cobrar de verdad cambia solo `MP_ACCESS_TOKEN` por el de producción de tu cuenta.

Pruebas automáticas: `npm --prefix backend test` (`billing.test.js` cubre firma, idempotencia, transiciones,
niveles, límites de usuarios, middleware y rutas con Mercado Pago simulado; `licensing-sql.test.js` valida
las migraciones 019 y 020 y el RLS).

### Decisiones por defecto y riesgos

- Una suscripción por taller; el historial vive en `billing_events` y `audit_logs`.
- `workshops.status` **no** lo modifica el webhook (es la suspensión manual); el acceso se corta con el 402.
  El webhook refleja el nivel en `workshops.plan` (`PLUS`/`PRO`/`MAX`, o `FREE`).
- Contratar durante la prueba termina la prueba: el primer cobro es inmediato.
- Bajar de plan no desactiva cuentas: quien ya tiene acceso sigue entrando, pero no se pueden agregar más.
- Riesgo: cada registro recibe prueba gratis (abuso por múltiples registros). Mitiga con TRIAL_DAYS bajo.
- Riesgo: la caché de licencia (15 s por instancia) puede retrasar el bloqueo/desbloqueo ese tiempo.
- Si faltan notificaciones, una suscripción `active` se bloquea pasados `BILLING_GRACE_DAYS` desde `current_period_end`.

### Despliegue

1. Aplicar `019_licensing.sql` (si no estaba) y `020_mercadopago_tiers.sql` en Supabase (SQL Editor).
2. Configurar las variables en Railway con las credenciales del vendedor de prueba.
3. Registrar el webhook con el evento de suscripciones.
4. Probar una compra completa, un cambio de plan y una cancelación.
5. Cambiar `MP_ACCESS_TOKEN` al de producción y quitar `LICENSING_ENABLED=false`.

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
