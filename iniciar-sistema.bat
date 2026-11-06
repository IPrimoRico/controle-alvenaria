@echo off
chcp 65001 >nul
set "PATH=%USERPROFILE%\.nodejs\node-v20.18.0-win-x64;%PATH%"
echo ============================================================================
echo   Iniciando Sistema Controle de Medicao de Alvenaria NEW LIFE (3D + DWG)
echo ============================================================================

start "Backend - Controle Alvenaria (Porta 3001)" cmd /k "set PATH=%USERPROFILE%\.nodejs\node-v20.18.0-win-x64;%PATH% && cd /d "%~dp0backend" && node src/server.js"
timeout /t 2 /nobreak >nul
start "Frontend - Controle Alvenaria (Porta 5173)" cmd /k "set PATH=%USERPROFILE%\.nodejs\node-v20.18.0-win-x64;%PATH% && cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173
