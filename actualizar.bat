@echo off
setlocal
cd /d "%~dp0"

rem Version del modpack (solo cosmetica; la sync decide por SHA1). Uso: actualizar.bat 1.1.0
set VERSION=%1
if "%VERSION%"=="" set VERSION=1.0.0

echo ============================================
echo  Actualizando DBR-ASSETS  (version %VERSION%)
echo ============================================
echo.
echo [1/3] Generando manifest...
node "..\DbrLauncher\scripts\gen-manifest.mjs" --dir "%~dp0." --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/ --version %VERSION% --forge 10.13.4.1614 --include mods,config,resourcepacks --out "%~dp0manifest.json"
if errorlevel 1 goto :error

echo.
echo [2/3] Registrando cambios en git...
git add -A
git diff --cached --quiet && echo   (sin cambios que subir) && goto :done
git commit -m "Actualizar modpack v%VERSION%"

echo.
echo [3/3] Subiendo a GitHub (rama assets)...
git push
if errorlevel 1 goto :error

:done
echo.
echo  LISTO. Los jugadores recibiran los cambios al dar Jugar.
pause
exit /b 0

:error
echo.
echo  ERROR. Revisa el mensaje de arriba.
pause
exit /b 1
