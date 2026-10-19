@echo off
REM Sube esta carpeta a Railway (servicio CARLOSTECH-AI, entorno production).
cd /d "%~dp0"
set RAILWAY_CLI=npx -y @railway/cli@4
echo ==== %date% %time% ==== > deploy-log.txt
echo Verificando sesion de Railway...
call %RAILWAY_CLI% whoami >> deploy-log.txt 2>&1
if errorlevel 1 (
  echo No hay sesion: se abrira el navegador para iniciar sesion en Railway.
  call %RAILWAY_CLI% login
  call %RAILWAY_CLI% whoami >> deploy-log.txt 2>&1
)
echo Vinculando proyecto CARLOSTECH-AI...
call %RAILWAY_CLI% link --project 1c6d513c-619a-4c83-aec9-ed2595d71b1e --environment production --service CARLOSTECH-AI >> deploy-log.txt 2>&1
echo Subiendo codigo (puede tardar unos minutos)...
call %RAILWAY_CLI% up --service CARLOSTECH-AI --environment production --detach >> deploy-log.txt 2>&1
echo Listo. Resultado en deploy-log.txt
type deploy-log.txt
pause
