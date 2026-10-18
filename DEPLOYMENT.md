# Despliegue CARLOSTECH AI

## Arquitectura

Un servicio Node/Express sirve la API y el frontend React/Vite compilado.
JavaScript, npm, sin ORM: las consultas usan Supabase JS y migraciones SQL.
La base de datos y Supabase Auth existentes se conservan. No crear PostgreSQL
adicional en Railway ni ejecutar el seed de demostración en producción.

- Build: `npm run build`.
- Inicio: `npm start`.
- Healthcheck: `/health` (también existe `/api/health`).
- Puerto: `PORT` proporcionado por Railway; host `0.0.0.0`.
- Rutas SPA: Express sirve `index.html` fuera de `/api`; un `/assets/*` que ya no
  existe (pestaña abierta antes de un deploy) responde 404 y el frontend recarga
  solo una vez para tomar la versión nueva.
- Node 22 en Nixpacks; compatible con Node 24 para las pruebas locales.

## Variables

Configurar antes del build:

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `CORS_ORIGIN` | Dominio HTTPS real de la aplicación |
| `VITE_API_URL` | `/api` |
| `VITE_SUPABASE_URL` | URL pública del Supabase existente |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon; nunca service role |
| `SUPABASE_URL` | URL del mismo Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto exclusivo del backend |
| `WHATSAPP_ENABLED` | `false` mientras no se configure Meta |
| `WHATSAPP_SIMULATE` | `false` en producción |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `APP_PUBLIC_URL` | **Obligatorias en producción**: sin ellas el backend no arranca y el mensaje indica cuáles faltan. Ver README → Licencias |
| `TRIAL_DAYS`, `BILLING_GRACE_DAYS` | Opcionales (14 y 7 por defecto) |
| `LICENSING_ENABLED` | `false` apaga las licencias (no exige Stripe ni bloquea talleres). Úsalo hasta aplicar la migración 019 y configurar Stripe; luego bórrala o ponla en `true` |
| `TRUST_PROXY` | Opcional. En producción vale `1` por defecto (proxy de Railway) para que los límites de peticiones y la auditoría usen la IP real del usuario |
| `CSP_ENFORCE` | Opcional. `true` aplica la Content-Security-Policy; por defecto solo la reporta (ver Cabeceras de seguridad) |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Recomendado: `15`. Segundos entre SIGTERM y SIGKILL cuando Railway reemplaza el deploy; vale 0 por defecto y entonces el proceso muere al instante y el cierre ordenado no llega a ejecutarse (ver Cierre ordenado) |
| `DEVICE_AGENT_GITHUB_REPOSITORY` | `propietario/repositorio` con las releases firmadas del agente. Tiene prioridad sobre cualquier descarga externa |
| `DEVICE_AGENT_EXTERNAL_RELEASE_URL` + `DEVICE_AGENT_EXTERNAL_VERSION` | Respaldo temporal sin firma (Mediafire). Solo se usa si no hay repositorio o si GitHub todavía no publica una release firmada válida. Ya no existe un valor por defecto en el código |

No fijar `PORT` en Railway. Las variables VITE se incorporan al navegador.
Las variables opcionales de WhatsApp se documentan en `backend/.env.example`.
La autenticación usa Supabase Auth y Bearer tokens, no cookies del backend.

## Base de datos

El esquema inicial ya existe. Revisar y aplicar las migraciones pendientes en
orden, mediante acceso administrativo a Supabase. No ejecutar `schema.sql`
ni `seed.sql` sobre la base existente y no hacer reset.

1. `database/migrations/003_phase3.sql`
2. `database/migrations/004_inventory_rpc.sql`
3. `database/migrations/005_whatsapp.sql`
4. `database/migrations/006_security_rbac.sql`
5. `database/migrations/011_tracking.sql`
6. `database/migrations/012_inventory_low_stock.sql`
7. `database/migrations/013_workshops.sql`
8. `database/migrations/014_workshops_roles.sql`
9. `database/migrations/015_ai_provider.sql`
10. `database/migrations/016_provision_workshop.sql`
11. `database/migrations/018_device_tools.sql`
12. `database/migrations/019_licensing.sql` (licencias; ver README → Licencias)

## Device Tools (ADB / Fastboot)

Device Tools no ejecuta USB en Railway. Cada PC de técnico necesita una copia
de `device-agent`, Android SDK Platform-Tools (`adb.exe` y `fastboot.exe`) y un
`.env` local con:

- `DEVICE_AGENT_SECRET` y `DEVICE_AGENT_WORKSHOP_ID` pueden quedar vacíos para
  el pairing automático desde la web; solo se usan para instalaciones manuales.
- `DEVICE_AGENT_ALLOWED_ORIGINS`: el dominio HTTPS de la aplicación y los
  orígenes locales de desarrollo.
- `DEVICE_AGENT_FILES_DIR`: carpeta permitida para archivos de soporte.

El agente escucha exclusivamente en `127.0.0.1`. En el primer uso la web muestra
un código de pairing y el agente intercambia la sesión autenticada con Railway;
el técnico no necesita copiar secretos, URLs ni puertos. Después guarda el
secreto en `%LOCALAPPDATA%` y la web emite tokens de cinco minutos vinculados al
taller y usuario. No existe un endpoint de ejecución arbitraria; las acciones
ADB/Fastboot están en lista blanca y las escrituras de particiones/FRP/MDM no
están implementadas.

La release firmada se genera con `.github/workflows/device-agent-release.yml`
al subir `device-agent-v1.0.1`. El flujo exige los secretos
`WINDOWS_SIGNING_CERT_BASE64` y `WINDOWS_SIGNING_CERT_PASSWORD`, firma y verifica
agente e instalador, calcula el hash final y publica los assets en GitHub.
En Railway configura `DEVICE_AGENT_GITHUB_REPOSITORY=propietario/repositorio`
con el repositorio público real. El backend consulta la última versión estable
del agente y la web ofrece su descarga y aviso de actualización. Ya no se usa
el instalador local ni `DEVICE_AGENT_RELEASE_URL`/`DEVICE_AGENT_RELEASE_PAGE`.
Consulta `device-agent/README.md` para firma, validación y operación.

Después de aplicar la migración 018, los snapshots y comandos aparecen en la
auditoría multi-taller. La ruta web es `/herramientas-dispositivo`.

La consulta previa confirmó conexión y dos perfiles administradores activos,
pero faltaban funciones de reparaciones y tablas de roles/auditoría.
Las pruebas SQL locales no sustituyen la aplicación de migraciones remotas.

## Integraciones y almacenamiento

El diagnóstico usa una capa `AIService` desacoplada de `OpenAIProvider`.
En producción responde `El servicio de IA todavía no está configurado.` si
faltan `AI_PROVIDER`, `AI_API_KEY` o `AI_MODEL`; agregar una clave por sí sola
no selecciona un proveedor. El historial existente se conserva.
WhatsApp deshabilitado no inicia su temporizador de procesamiento.
No se encontró un flujo de uploads persistentes implementado. Los archivos
estáticos del diseño son parte del build; el disco de Railway no debe usarse
para conservar adjuntos entre despliegues.

## Cierre ordenado

En cada deploy Railway envía SIGTERM al proceso anterior. El backend
(`backend/utils/lifecycle.js`) deja de aceptar conexiones, espera hasta 10 s a que
terminen las peticiones en curso y sale con código 0; si no terminan, corta las
conexiones y sale con código 1. Para que le dé tiempo, configura
`RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` (por defecto Railway manda SIGKILL al
instante). En los logs aparece como `Cierre ordenado (SIGTERM)`.

Una promesa rechazada sin capturar se registra y el servidor sigue; una excepción sin
capturar se registra, cierra en orden y sale con código 1 para que Railway reinicie el
servicio. El CI comprueba con la imagen real que el SIGTERM llega a Node tanto con el
arranque del Dockerfile como con `npm run start`, que es el comando del servicio.

## Cabeceras de seguridad

Todas las respuestas llevan `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy` y `Permissions-Policy`; en producción y tras HTTPS también
`Strict-Transport-Security` (1 año). Las rutas `/api` salen con `Cache-Control: no-store`.

La Content-Security-Policy se envía como `Content-Security-Policy-Report-Only`: no bloquea
nada y el navegador reporta cada violación a `POST /api/csp-report`, que la deja en los logs
de Railway como `[csp-report] {...}` (sin query ni tokens, con los ids enmascarados). La
política permite Google Fonts, el Supabase de `SUPABASE_URL`, el Device Agent local
(`127.0.0.1:5391`) y los estilos en línea de React; se define en `buildCsp`
(`backend/middleware/security.js`).

Para aplicarla: navega la app unos días, revisa los logs, ajusta la política si hay
violaciones legítimas y pon `CSP_ENFORCE=true`. Si algo se rompe, quita la variable y
vuelves al modo reporte sin tocar código.

## Validación y operación

`npm --prefix backend test`, `npm --prefix frontend run lint` y
`npm --prefix frontend run test:e2e`. No hay script de typecheck (JavaScript).
Las pruebas de navegador existentes usan API/sesiones simuladas; no prueban
el login real ni la persistencia de Supabase en producción.

El workflow `.github/workflows/ci.yml` corre en cada push y pull request: pruebas
del backend, lint y build del frontend, e2e de Playwright, pruebas del Device
Agent y la construcción de la imagen Docker de producción, que además se arranca
y se comprueba (`/health` y la SPA con su CSP). En CI los e2e usan
`PLAYWRIGHT_CHANNEL=chromium`; en local, `PLAYWRIGHT_PORT` permite ejecutarlos en
otro puerto si ya tienes un servidor de desarrollo abierto en el 5173.

La cuenta Railway consultada el 19/09/2026 tenía prueba gratuita de 30 días,
US$5 de crédito y consumo US$0. Aunque el enum del workspace decía HOBBY,
`isTrialing=true`, `isUsageSubscriber=false` y `state=INACTIVE` confirmaron
que no había suscripción de consumo activa. No se contrató ningún plan.
No se garantiza disponibilidad ilimitada ni costo cero permanente.

El archivo `railway.json` sigue siendo aceptado al momento de la consulta;
la CLI anuncia su retirada el 01/12/2026. Migrar la configuración antes de
esa fecha. Conservar despliegues anteriores para rollback y revisar el plan
y crédito disponible antes de cualquier operación futura.

