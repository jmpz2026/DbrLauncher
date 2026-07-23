@echo off
setlocal
cd /d "%~dp0"

rem Version del modpack (solo cosmetica; la sync decide por SHA1). Uso: actualizar.bat 1.1.0
set VERSION=%1
if "%VERSION%"=="" set VERSION=1.0.0

set GEN=..\DbrLauncher\scripts\gen-manifest.mjs
set FORGE=10.13.4.1614

echo ============================================
echo  Actualizando DBR-ASSETS  (version %VERSION%)
echo ============================================
echo.
echo [1/4] Generando manifest FULL...
node "%GEN%" --dir "%~dp0." --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest.json"
if errorlevel 1 goto :error

echo.
echo [2/4] Generando manifest LITE...
if exist "%~dp0lite\mods\*.jar" (
  node "%GEN%" --dir "%~dp0lite" --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/lite/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest-lite.json"
  if errorlevel 1 goto :error
) else (
  echo   ^(lite\mods vacio: se omite el manifest lite hasta que metas los .jar^)
)

echo.
echo [3/4] Registrando cambios en git...
git add -A
git diff --cached --quiet && echo   (sin cambios que subir) && goto :done
git commit -m "Actualizar modpack v%VERSION%"

echo.
echo [4/4] Subiendo a GitHub (rama assets)...
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
