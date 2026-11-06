@echo off
chcp 65001 >nul
set "PATH=%USERPROFILE%\.nodejs\node-v20.18.0-win-x64;%PATH%"
echo ============================================================================
echo   Gerando Link Publico HTTPS (Para abrir no 4G/5G ou em qualquer outro IP)
echo ============================================================================
echo.
echo Aguarde alguns segundos. O link "https://..." aparecera abaixo:
echo.
npx --yes cloudflared tunnel --url http://localhost:5173
pause
