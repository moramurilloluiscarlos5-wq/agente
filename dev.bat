@echo off
title CARLOSTECH AI - Launcher
color 0B
echo ============================================
echo    CARLOSTECH AI - Iniciando servidores
echo ============================================
echo.
cd /d "%~dp0"

if not exist "frontend\node_modules" (
  echo [FRONTEND] Instalando dependencias...
  cd frontend
  call npm install
  cd ..
)

if not exist "backend\node_modules" (
  echo [BACKEND] Instalando dependencias...
  cd backend
  call npm install
  cd ..
)

echo.
echo Abriendo ventanas de servidor...
start "CARLOSTECH AI - Backend :4000" cmd /k "cd /d %~dp0backend && npm run dev"
start "CARLOSTECH AI - Frontend :5173" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Esperando a que el frontend arranque...
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
echo.
echo  Navegador abierto en http://localhost:5173
echo.
echo  Para DETENER el proyecto, cierra las dos ventanas de servidor
echo  ("CARLOSTECH AI - Backend" y "CARLOSTECH AI - Frontend").
echo.
pause