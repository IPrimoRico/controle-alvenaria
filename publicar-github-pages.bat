@echo off
chcp 65001 >nul
set "PATH=%USERPROFILE%\.nodejs\node-v20.18.0-win-x64;%USERPROFILE%\.mingit\cmd;%PATH%"

echo ============================================================================
echo   PUBLICAR APLICATIVO NO GITHUB PAGES (github.io)
echo ============================================================================
echo.
echo 1. Acesse https://github.com/new no seu navegador
echo 2. Crie um repositorio Publico chamado: controle-alvenaria
echo 3. Copie o link do repositorio (ex: https://github.com/SEU_USUARIO/controle-alvenaria.git)
echo.
set /p REPO_URL="Cole aqui o link do seu repositorio GitHub e aperte ENTER: "

if "%REPO_URL%"=="" (
    echo Nenhum link informado. Operacao cancelada.
    pause
    exit /b
)

echo.
echo Compilando versao atualizada para o GitHub Pages...
cd /d "%~dp0frontend"
call npm run build
cd /d "%~dp0"
if not exist "docs" mkdir docs
xcopy /E /I /Y "frontend\dist\*" "docs\" >nul
xcopy /E /I /Y "frontend\dist\*" ".\" >nul

git init
git branch -M main
git add .
git commit -m "Deploy Controle de Medicao de Alvenaria NEW LIFE para GitHub Pages"
git remote remove origin 2>nul
git remote add origin %REPO_URL%
echo.
echo Enviando arquivos para o GitHub...
git push -u origin main --force

echo.
echo ============================================================================
echo   PRONTO! Agora no seu repositorio do GitHub:
echo   1. Clique na aba "Settings" (Configuracoes) -> "Pages" (no menu esquerdo)
echo   2. Em "Build and deployment" -> "Branch", selecione "main" e pasta "/docs" (ou "/root") e clique em Save!
echo   3. Em 1 minuto seu site estara no ar em:
echo      https://SEU_USUARIO.github.io/controle-alvenaria/
echo ============================================================================
pause
