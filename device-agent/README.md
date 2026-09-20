# CarlosTech Device Agent

Agente local Windows x64 de **CARLOSTECH AI**, versión **1.0.1**.
Ejecuta ADB y Fastboot en el PC del técnico; Railway no ejecuta comandos USB.

## Configuración e instalación

El instalador crea `%LOCALAPPDATA%\CarlosTech\DeviceAgent\.env` si no existe.
Las actualizaciones conservan la configuración. El ejecutable carga ese archivo
antes de iniciar, independientemente del directorio desde el que se ejecute.
Las variables del proceso tienen prioridad. El dominio de producción permitido
es `https://carlostech-ai-production.up.railway.app`; agrega cualquier dominio
adicional exacto a `DEVICE_AGENT_ALLOWED_ORIGINS` y reinicia el agente.

`ADB_PATH` y `FASTBOOT_PATH` vacíos seleccionan las herramientas incluidas.
`DEVICE_AGENT_SECRET` y `DEVICE_AGENT_WORKSHOP_ID` se dejan vacíos para vincular
desde la web. No se incluyen secretos de talleres en el instalador.

Para desarrollo, con Node.js 22+, ejecuta `npm ci`, copia `.env.example` a `.env`
y ejecuta `npm start` desde esta carpeta. Para generar solo un ejecutable de
prueba, `npm run build:exe` escribe en `dist/unsigned`; `npm run test:exe`
comprueba su arranque sin acceder a teléfonos ni a una vinculación existente.
Este ejecutable no se publica ni se anuncia como firmado.

## Publicación oficial 1.0.1

El workflow `.github/workflows/device-agent-release.yml` se dispara al subir
`device-agent-v1.0.1`. `workflow_dispatch` permite reintentar sobre ese tag,
pero rechaza ramas y tags cuya versión no coincida con `package.json`.
El repositorio de releases debe ser público para permitir descargas sin sesión.

Configura en **GitHub → Settings → Secrets and variables → Actions**:

- `WINDOWS_SIGNING_CERT_BASE64`: PFX real codificado en Base64.
- `WINDOWS_SIGNING_CERT_PASSWORD`: contraseña del PFX.

El certificado debe tener clave privada, EKU Code Signing, vigencia y cadena
de confianza válidas, con editor `CARLOSTECH AI` realmente certificado.
Si el nombre legal emitido es diferente, este flujo se detiene; no se cambia
ni se inventa la identidad del certificado. No envíes el PFX o su contraseña
por chat ni los guardes en Git. Si el proveedor exige hardware/HSM o firma
remota y no proporciona un PFX utilizable, este flujo requiere adaptar ese
proveedor; no puede convertir una clave no exportable en un PFX.

La secuencia real de este proyecto Node.js es:

1. Validar secretos, Base64, contraseña, PFX y certificado.
2. Restaurar dependencias con `npm ci` y ejecutar pruebas.
3. Crear un bundle de producción y un EXE `node22-win-x64` con herramientas
   fijadas en `package-lock.json`; comprobar su arranque.
4. Firmar el agente con SignTool SHA-256 y timestamp RFC 3161.
5. Verificar con `signtool verify /pa /all /v /tw` y Authenticode.
6. Crear el instalador Inno Setup con el agente ya firmado y Platform-Tools
   oficiales de Google; firmarlo y verificarlo de la misma manera.
7. Calcular SHA-256 del instalador final; generar `version.json`,
   `SHA256SUMS.txt` y notas con ese hash.
8. Crear un borrador de GitHub Release, subir los tres archivos, descargarlos
   de nuevo y comprobar hashes y firma. Solo entonces hacer pública la release.
9. Verificar la descarga anónima del instalador publicado.

El PFX temporal `windows-signing-cert.pfx` se crea fuera del repositorio en un
directorio con acceso restringido y se elimina tras importar. La clave temporal
del almacén del runner se elimina al terminar. Un paso `always()` refuerza la
limpieza tras interrupciones. La contraseña solo se mantiene en memoria.
No hay opción de publicar sin firma: cualquier fallo impide llegar a la
publicación. Si falla la verificación final de descarga anónima, una release
ya verificada puede estar publicada; consulta el paso que falló.

Los resultados verificados están en una carpeta nueva `dist/release-1.0.1-*`.
No se reutilizan los instaladores anteriores de `dist/` ni `releases/`.
El `version.json` que se instala contiene la versión del agente; el manifiesto
adjunto a la release contiene además `signed: true`, tag, hash final, tamaño,
editor y huella pública del certificado, generados después de verificar firmas.

## Conexión con Railway y actualizaciones

En Railway configura `DEVICE_AGENT_GITHUB_REPOSITORY=propietario/repositorio`
con el repositorio público real, y despliega estos cambios de backend/frontend.
Opcional: `DEVICE_AGENT_GITHUB_TOKEN`, solo en backend, para límites de la API.
No es necesario copiar cada EXE al contenedor ni fijar una URL para cada versión.
Las antiguas variables `DEVICE_AGENT_RELEASE_URL` y `DEVICE_AGENT_RELEASE_PAGE`
ya no se usan para evitar servir el instalador local 1.0.0 sin firmar.

`/api/device-agent/latest-version` consulta la mayor versión estable con tag
`device-agent-vX.Y.Z` y valida los tres assets públicos. `/api/device-agent/download`
redirige a su instalador oficial. La web consulta cada minuto y al recuperar el
foco; si detecta 1.0.1 frente a un agente 1.0.0 muestra
`Nueva versión disponible: 1.0.1` y `Actualizar`.

Si GitHub/configuración/metadatos no son válidos, se informa un error real y se
permite reintentar; no se fabrica una descarga. `signed` representa lo verificado
por el pipeline Windows: el backend Linux no ejecuta Authenticode.

## Comprobaciones

- `npm test`: configuración del agente.
- `npm run build:exe` y `npm run test:exe`: binario local sin firma, aislado.
- `powershell -NoProfile -ExecutionPolicy Bypass -File installer/test-signing-failures.ps1`:
  rechazo de secretos ausentes, Base64/PFX inválidos y archivos ausentes.
- `npm run build:installer`: flujo firmado completo; exige los dos secretos
  como variables de proceso y un entorno Windows con Inno Setup y Windows SDK.

Referencia de verificación: [Microsoft SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool).
Publicación por borrador: [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
