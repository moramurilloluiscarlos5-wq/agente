# CARLOSTECH AI

Sistema interno de gestión para servicio técnico de celulares: clientes, dispositivos, reparaciones, diagnósticos, cotizaciones, inventario, pagos, garantías, reportes y asistente de IA.

> **Estado:** Fase 2 completada — Supabase configurado: esquema completo de BD con RLS, roles (ADMINISTRADOR/TÉCNICO/RECEPCIÓN), autenticación con Supabase Auth, rutas protegidas y API de usuarios.

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
| 3 | Clientes, dispositivos, reparaciones e historial |
| 4 | Cotizaciones, inventario, pagos, garantías |
| 5 | Proveedor IA desacoplado, diagnóstico validado y asistente |
| 6 | Reportes filtrados, búsqueda por taller y notificaciones |
| 7 | Optimización, seguridad, pruebas y producción |
