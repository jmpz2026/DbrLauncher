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
echo [0/6] Comprobando la rama y trayendo lo que haya en GitHub...
set RAMA=
for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set RAMA=%%B
if not "%RAMA%"=="assets" (
  echo   Estas en la rama "%RAMA%", no en "assets". Cambia con: git switch assets
  goto :error
)
rem Pre-commit que valida los manifests (tools\hooks\pre-commit). Se activa en cada corrida
rem para que un clon nuevo lo tenga sin acordarse.
git config core.hooksPath tools/hooks
rem --autostash: los jars que acabas de copiar se guardan, se trae lo remoto y se reponen.
rem Evita que el push del final lo rechace GitHub por ir detras.
git pull --rebase --autostash
if errorlevel 1 goto :error

echo.
echo [1/6] Sacando el generador de la rama main del launcher...
rem Se saca de main a proposito: si el repo esta en otra rama (p.ej. android-zalith),
rem su copia del script puede ser vieja y generaria manifests sin los flags `once`.
rem Se usa origin/main recien traido; sin red, el main local (avisando).
set GENREF=origin/main
git -C "%REPO%" fetch -q origin main
if errorlevel 1 (
  echo   Sin red para el launcher: se usa su main local, puede estar viejo.
  set GENREF=main
)
git -C "%REPO%" show %GENREF%:scripts/gen-manifest.mjs > "%GEN%"
if errorlevel 1 goto :error

echo.
echo [2/6] Generando manifest FULL...
node "%GEN%" --dir "%~dp0." --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest.json"
if errorlevel 1 goto :error

echo.
echo [3/6] Generando manifest LITE...
if exist "%~dp0lite\mods\*.jar" (
  node "%GEN%" --dir "%~dp0lite" --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/lite/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks --out "%~dp0manifest-lite.json"
  if errorlevel 1 goto :error
) else (
  echo   ^(lite\mods vacio: se omite el manifest lite hasta que metas los .jar^)
)

echo.
echo [3b/6] Generando manifest EXPERIMENTAL...
rem Mods en pruebas para que los jugadores los testeen (no aptos para el servidor).
rem Se ponen en experimental\mods y experimental\config, igual que lite.
if exist "%~dp0experimental\mods\*.jar" (
  node "%GEN%" --dir "%~dp0experimental" --base https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/experimental/ --version %VERSION% --forge %FORGE% --include mods,config,resourcepacks,shaderpacks --out "%~dp0manifest-experimental.json"
  if errorlevel 1 goto :error
) else (
  echo   ^(experimental\mods vacio: se omite el manifest experimental^)
)

rem Aviso: los archivos de siembra (.dbr-once) son la config del jugador. Si salen 0,
rem es que falta el .dbr-once o que el generador es viejo: el manifest quedaria sin ellos
rem y la sync pisaria la configuracion grafica de todo el mundo en cada Jugar.
echo.
echo   Archivos de siembra detectados:
node -e "for(const f of ['manifest.json','manifest-lite.json','manifest-experimental.json']){const fs=require('fs');if(!fs.existsSync(f))continue;const m=JSON.parse(fs.readFileSync(f,'utf8'));const o=m.files.filter(x=>x.once);console.log('   '+f+': '+m.files.length+' archivos, '+o.length+' de siembra ('+o.map(x=>x.path).join(', ')+')')}"

echo.
echo [4/6] Validando los manifests (JSON, sha1, size, archivos)...
node tools\check-manifests.mjs
if errorlevel 1 goto :error

echo.
echo [5/6] Registrando cambios en git...
rem Solo lo que es del modpack: un archivo suelto en la raiz (notas, planes, pruebas) no se sube.
rem Si cambias tools\, .github\ o worker\, commitealo a mano.
git add -A -- manifest.json manifest-lite.json manifest-experimental.json forge-1.7.10.json news.json .dbr-once mods config resourcepacks lite experimental android options.txt optionsof.txt optionsshaders.txt CREDITOS.txt LICENCIAS
if errorlevel 1 goto :error
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Actualizar modpack v%VERSION%"
  if errorlevel 1 goto :error
) else (
  echo   ^(sin cambios nuevos que commitear^)
)

echo.
echo [6/6] Subiendo a GitHub (rama assets)...
rem Tambien sube commits hechos antes (p. ej. por un script de despliegue) que no se pushearon.
set ANTES=
set AHORA=
for /f %%S in ('git rev-parse @{u}') do set ANTES=%%S
for /f %%S in ('git rev-parse HEAD') do set AHORA=%%S
if "%ANTES%"=="%AHORA%" (
  echo   ^(GitHub ya tiene todo: nada que subir^)
  goto :done
)
git push
if errorlevel 1 goto :error

echo.
echo   Esperando la Action "Mirror de assets" (release + R2)...
where gh >nul 2>nul
if errorlevel 1 (
  echo   gh no esta instalado: revisa la Action a mano en GitHub.
  goto :done
)
set RUN=
for /l %%i in (1,1,24) do if not defined RUN (
  timeout /t 5 /nobreak >nul
  for /f %%R in ('gh run list --workflow mirror-assets.yml --commit %AHORA% --json databaseId -q ".[0].databaseId"') do set RUN=%%R
)
if not defined RUN (
  echo   No aparecio la Action en 2 minutos: revisala a mano en GitHub.
  goto :error
)
gh run watch %RUN% --exit-status
if errorlevel 1 (
  echo.
  echo   La Action fallo. Los jugadores pueden no recibir el cambio por R2.
  echo   Mira el error con: gh run view %RUN% --log-failed
  goto :error
)

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
