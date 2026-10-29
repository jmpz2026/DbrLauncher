# Plan: descargas robustas en DbrLauncher Mobile (updater + Instalar DBR)

## Context
Bugs reportados en Android (rama `android-zalith`, worktree `DbrLauncher-android`):
1. **Actualizar** se queda congelado en un % aleatorio (97/40/60) y luego vuelve al diálogo con el botón "Actualizar", sin mensaje.
2. **Instalar DBR** se quedó cargando y luego dio `Software caused connection abort`.

Causas encontradas:
- `game/dbr/DbrUpdater.kt` `downloadAndInstall`: `URL.openConnection()` **sin connectTimeout/readTimeout** → si la conexión se queda colgada (cambio Wi-Fi/datos, pantalla apagada), `read()` bloquea para siempre = "congelado". Sin reintento ni reanudación: cualquier corte reinicia de 0. No verifica tamaño final (un corte prematuro puede dar APK truncada).
- `viewmodel/DbrUpdateViewModel.kt` `install`: `runCatching { ... }` traga el error y pone `downloadPercent = null` → vuelve a la primera pantalla sin explicar nada. `onProgress` escribe estado Compose desde el hilo IO.
- `Software caused connection abort` (ECONNABORTED) = Android cortó el socket (app en segundo plano/pantalla apagada/cambio de red). `GameLibDownloader` reintenta cada archivo una vez, pero el flujo `DbrInstallViewModel.install` (`ui/screens/content/LauncherScreen.kt:378`) no reintenta nada a nivel de instalación y muestra el texto crudo de la excepción.

Objetivo: descargas que no se cuelgan, se reanudan solas ante cortes y muestran error claro con "Reintentar".

## Cambios

### 1. `game/dbr/DbrUpdater.kt` — descarga resistente
- `HttpURLConnection` con `connectTimeout=15s`, `readTimeout=20s` (un stall = excepción, no cuelgue).
- Descargar a `cacheDir/dbr_update_<build>.apk.part`; ante `IOException` reintentar hasta 5 veces con backoff (1s, 2s, 4s… máx 10s) **reanudando con `Range: bytes=<recibido>-`** (si el server responde 200 en vez de 206, empezar de 0). GitHub Releases soporta Range.
- Al terminar: comprobar `recibido == tamaño total`; si `version.json` trae `sha256` (campo nuevo opcional en `UpdateInfo`), verificarlo. Renombrar `.part` → `.apk`.
- Si ya existe `dbr_update_<build>.apk` completo y válido (el usuario canceló el instalador y vuelve a tocar), instalar directo sin bajar.
- Borrar APKs/partes de builds viejos en cache.
- Progreso reportado solo cuando cambia el entero, entregado en `Dispatchers.Main`.

### 2. `viewmodel/DbrUpdateViewModel.kt` — estado de error visible
- Nuevo estado `error: String?`. En fallo: mensaje amigable ("Se perdió la conexión. Revisa tu internet y reintenta.") + detalle técnico corto; botón **Reintentar** (reanuda desde el `.part`).
- Durante la descarga: `FLAG_KEEP_SCREEN_ON` (vía `LocalView.keepScreenOn` en el diálogo) para que la pantalla no se apague y Android no corte el socket.
- Loguear la excepción con `Logger` para que salga en "Reportar problema".

### 3. `LauncherScreen.kt` — `DbrInstallViewModel.install`
- Envolver `buildInfo()` + `GameInstaller.installGame` en reintento automático: si `onError` llega con `IOException`/`DownloadFailedException`, reintentar hasta 2 veces más (GameInstaller salta archivos ya bajados con SHA-1 OK, así que reanuda barato). Mensaje "Reintentando (2/3)…" en el diálogo de progreso.
- `keepScreenOn` mientras `Preparing/Installing/Syncing` (también cubre el sync de mods).
- Diálogo de error: mensaje amigable para errores de red + detalle técnico chico + botones **Reintentar** y Cerrar.
- Log de la excepción completa.

### 4. Strings `res/values{,-es,-pt}/strings_dbr.xml`
Nuevas: `dbr_net_error_friendly`, `dbr_retry`, `dbr_retrying` (con %1$d/%2$d), `dbr_update_error_title`.

### 5. (opcional, mismo PR) `.github/workflows/android-release.yml`
Escribir `sha256` del APK en `version.json` para que el updater verifique integridad (seguridad: APK descargada no corrupta). Si no está, el updater solo verifica tamaño.

## Archivos
- `android/ZalithLauncher2/ZalithLauncher/src/main/java/com/movtery/zalithlauncher/game/dbr/DbrUpdater.kt`
- `.../viewmodel/DbrUpdateViewModel.kt`
- `.../ui/screens/content/LauncherScreen.kt`
- `.../res/values*/strings_dbr.xml`
- `.github/workflows/android-release.yml` (sha256)
Reusar: `utils/network/NetWorks.kt` `withRetry` (patrón backoff), `Logger`, `DownloadFailedException`.

## Nota
El fix se distribuye con el updater nuevo: el salto v27 → v28 todavía usa el updater viejo (puede colgarse). Si se cuelga, cerrar la app y volver a tocar Actualizar. Desde v28 en adelante, el updater nuevo funciona.

## Verificación
- Local: `compileDebugKotlin` + `processDebugResources` desde el junction `C:\dev\dbr-src` (ndk-build no aguanta espacios).
- APK: tag `android-v28` → CI → Release + `version.json` auto-commit.
- Manual en dispositivo (usuario): actualizar con modo avión a mitad (debe mostrar error + Reintentar y reanudar desde el %); Instalar DBR cambiando Wi-Fi↔datos a mitad (debe reintentar solo).

## Bitácora
- 2026-10-29: plan creado. Al implementar, copiar a `DbrLauncher-android/PLAN-descargas-robustas.md` + puntero en su CLAUDE.md.
- 2026-10-29: implementado pasos 1-5 (updater con timeouts/reintentos/Range/sha256, diálogo con error + Reintentar, instalación DBR con 3 intentos automáticos, KeepScreenOn en descarga/instalación/sync, strings es/en/pt, CI escribe sha256). Compila (`compileDebugKotlin` + `processDebugResources` desde `C:\dev\dbr-wt`).
- Siguiente paso: commit en `android-zalith` + tag `android-v28` para que el CI genere el APK; prueba manual en el teléfono.
