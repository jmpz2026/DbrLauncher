@echo off
setlocal
cd /d "%~dp0"

rem Version del modpack (solo cosmetica; la sync decide por SHA1). Uso: actualizar.bat 1.1.0
set VERSION=%1
if "%VERSION%"=="" set VERSION=1.0.0

set REPO=%~dp0..\DbrLauncher
set GEN=%TEMP%\dbr-gen-manifest.mjs
set FORGE=10.13.4.1614

echo ============================================
echo  Actualizando DBR-ASSETS  (version %VERSION%)
echo ============================================
echo.
echo [1/5] Sacando el generador de la rama main del launcher...
rem Se saca de main a proposito: si el repo esta en otra rama (p.ej. android-zalith),
rem su copia del script puede ser vieja y generaria manifests sin los flags `once`.
git -C "%REPO%" show main:scripts/gen-manifest.mjs > "%GEN%"
if errorlevel 1 goto :error

echo.
echo [2/5] Generando manifest FULL...
node "%GEN%" --dir "%~dp0." --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest.json"
if errorlevel 1 goto :error

echo.
echo [3/5] Generando manifest LITE...
if exist "%~dp0lite\mods\*.jar" (
  node "%GEN%" --dir "%~dp0lite" --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/lite/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest-lite.json"
  if errorlevel 1 goto :error
) else (
  echo   ^(lite\mods vacio: se omite el manifest lite hasta que metas los .jar^)
)

rem Aviso: los archivos de siembra (.dbr-once) son la config del jugador. Si salen 0,
rem es que falta el .dbr-once o que el generador es viejo: el manifest quedaria sin ellos
rem y la sync pisaria la configuracion grafica de todo el mundo en cada Jugar.
echo.
echo   Archivos de siembra detectados:
node -e "for(const f of ['manifest.json','manifest-lite.json']){const fs=require('fs');if(!fs.existsSync(f))continue;const m=JSON.parse(fs.readFileSync(f,'utf8'));const o=m.files.filter(x=>x.once);console.log('   '+f+': '+m.files.length+' archivos, '+o.length+' de siembra ('+o.map(x=>x.path).join(', ')+')')}"

echo.
echo [4/5] Registrando cambios en git...
git add -A
git diff --cached --quiet && echo   (sin cambios que subir) && goto :done
git commit -m "Actualizar modpack v%VERSION%"

echo.
echo [5/5] Subiendo a GitHub (rama assets)...
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
