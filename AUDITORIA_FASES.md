# Auditoría de fases — 19 de septiembre de 2026

Dictamen actualizado: el aislamiento de datos, RBAC y la capa IA ya están implementados en código y cubiertos por pruebas locales. Queda pendiente aplicar las migraciones nuevas en Supabase/Railway y ejecutar una validación con credenciales de producción.

## Alcance y evidencia

Revisión de documentación, rutas, middleware, migraciones, páginas y pruebas. Después de los cambios: compilación frontend correcta, 49/49 pruebas backend aprobadas, 5/5 pruebas E2E aprobadas, sintaxis backend correcta y lint sin errores bloqueantes. Las pruebas SQL usan PGlite y las pruebas API/E2E usan dobles controlados; no sustituyen una validación remota con login real, migraciones aplicadas, proveedor IA real o despliegue productivo.

La numeración no es consistente: README define siete fases, mientras las migraciones identifican WhatsApp como fase 7, RBAC como 9, inventario como 10, seguimiento como 11 y multi-taller como 12. No hay una definición suficiente para certificar una fase 8 independiente. Los números de archivo SQL no equivalen necesariamente al número de fase.

## Estado por alcance documentado

| Fase | Estado | Evidencia y pendientes |
| --- | --- | --- |
| 1: estructura y UI | Implementada en su alcance base | React, Vite, Tailwind, layout, sidebar, rutas y dashboard conectado a API. Compila. |
| 2: autenticación, roles, BD y RLS | Implementada en código | Supabase Auth, perfiles activos, talleres activos, RBAC y RLS presentes. Falta confirmar migraciones remotas. |
| 3: clientes, equipos, reparaciones e historial | Avanzada, no cerrada | CRUD y RPC transaccionales presentes; pruebas SQL y flujos simulados. Dos pruebas de operaciones fallan y la UI omite OWNER en acciones importantes. |
| 4: cotizaciones, inventario, pagos y garantías | Implementada en código | Listas, detalles, altas, cambios y borrados filtran taller; altas sellan `workshop_id` desde la sesión. |
| 5: IA y asistente | Implementada en backend | `AIProvider`, `OpenAIProvider`, `AIService`, validación estructurada, timeout, rate limit y errores. Requiere configurar el proveedor para usar IA real. |
| 6: reportes, gráficas, notificaciones y búsqueda | Implementada en alcance base | Reportes, búsqueda, notificaciones recientes y filtros por taller están implementados. Las gráficas avanzadas pueden ampliarse. |
| 7: optimización, seguridad y producción (README) | Parcial | Build y pruebas pasan; lint conserva advertencias de estilo y el bundle principal supera 500 kB. Falta validación productiva. |
| 7: WhatsApp (migración) | Implementada en código | Proveedor, consentimiento, cola, automatizaciones, webhook y filtros por taller presentes. Falta probar Meta real. |
| 8 | No verificable | Falta definición de alcance inequívoca en los documentos revisados. |
| 9: RBAC y auditoría | Implementada en código | Los permisos globales solo los modifica `SUPER_ADMIN`; auditoría y consultas se filtran por taller. |
| 10: filtro de stock bajo | Implementado en alcance identificado | Migración y prueba específica presentes; no implica que todo inventario esté cerrado. |
| 11: seguimiento público | Implementada en código | API, ruta pública frontend, QR, PDF y acciones de regeneración presentes. |
| 12: multi-taller | Implementada en código | Consultas comerciales, dashboard, búsqueda, IA, WhatsApp, reportes y auditoría aplican alcance de sesión; las pruebas API y SQL cubren aislamiento. |

## Hallazgos prioritarios

1. **Corregido: aislamiento en API.** Las rutas de cotizaciones, pagos, garantías, inventario, dashboard, búsqueda, IA, WhatsApp, reportes y auditoría usan el taller del perfil autenticado. Las altas eliminan cualquier `workshop_id` del cuerpo y lo sellan desde la sesión.

2. **Corregido: cambios globales de permisos.** La edición de `role_permissions` requiere `SUPER_ADMIN`; la pantalla también se oculta para administradores de taller.

3. **Corregido: rol OWNER en frontend y backend.** Las acciones de clientes, dispositivos, reparaciones, personal y comunicaciones contemplan OWNER; el middleware reconoce también SUPER_ADMIN.

4. **Corregido: seguimiento público.** Existe la ruta `/seguimiento/:token`, QR, PDF, copia de enlace y regeneración.

5. **Pendiente menor: IA configurada y visualizaciones.** La integración IA ya consume un proveedor OpenAI compatible cuando se configura; sin variables devuelve 503 entendible. El centro de notificaciones muestra notificaciones recientes; se pueden añadir acciones de marcado como leído más adelante.

6. **Corregido: auditoría de acceso.** La actualización de `last_login_at` se espera correctamente y el cambio de rol registra el rol anterior del usuario objetivo.

7. **Pendiente operativo: producción.** Las pruebas locales están verdes. Hay que aplicar 011–015 en Supabase, configurar variables en Railway y comprobar login, proveedor IA, WhatsApp y RLS con datos reales.

## Orden recomendado de cierre

1. Aplicar las migraciones 003, 004, 005, 006 y 011-015 en Supabase. La migración 006 crea `profiles.last_login_at` y `audit_logs`; la 013 agrega `workshop_id` y sus políticas.
2. Configurar `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL` y `AI_MODEL` solo en Railway.
3. Ejecutar pruebas autenticadas con dos talleres y confirmar los endpoints en producción.
4. Añadir marcado como leído y optimizar el bundle si el rendimiento lo requiere.

No se asigna un porcentaje global: falta una lista única de criterios de aceptación y mezclar archivos existentes con funciones validadas produciría una cifra engañosa.

## Corrección de esquema para Personal y Auditoría

El backend es compatible con una base remota que todavía no tenga `profiles.last_login_at`: las consultas de Personal no seleccionan esa columna y el registro del último acceso se intenta de forma opcional. Auditoría aplica el alcance del taller; si falta `audit_logs.workshop_id`, usa los usuarios del taller como respaldo, y si falta la tabla completa devuelve una instrucción de migración con estado 503.

Para cerrar el esquema remoto hay que ejecutar en Supabase SQL Editor, sin saltar pasos: `003_phase3.sql`, `004_inventory_rpc.sql`, `005_whatsapp.sql`, `006_security_rbac.sql`, `011_tracking.sql`, `012_inventory_low_stock.sql`, `013_workshops.sql`, `014_workshops_roles.sql` y `015_ai_provider.sql`. La migración 006 crea `profiles.last_login_at` y `audit_logs`; la 013 agrega `workshop_id` y sus políticas.


## Aplicación remota confirmada

El 19 de septiembre de 2026 se aplicaron directamente al proyecto Supabase enlazado las migraciones `003`, `004`, `005`, `006`, `011`, `012`, `013`, `014` y `015`. Se verificaron las tablas `roles` y `audit_logs`, las columnas `profiles.last_login_at`, `profiles.workshop_id`, `audit_logs.workshop_id` y las columnas IA `diagnostics.provider` y `diagnostics.tokens_used`.

La migración `016_provision_workshop.sql` añade la función transaccional usada por `/api/auth/register-workshop` y `/api/auth/create-workshop`. La cuenta Auth se crea primero y se elimina si la transacción PostgreSQL falla; el taller, el perfil OWNER y la configuración inicial se confirman juntos.
