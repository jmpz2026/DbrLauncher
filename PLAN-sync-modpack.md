# Plan: sync del modpack en Android sin "cuelgues" + parches delta de jars

## Context
Un jugador de Android se queda en "Sincronizando el modpack DBR… 1 / 4". No es un cuelgue:
la actualización del 2026-11-02 trae `DbrServerPack-5.5.0.jar` (47,7 MB) + `npcdbc-5.4.0.jar`
y borra los 5.3.0 → 4 tareas. El contador cuenta archivos terminados, así que mientras baja el
jar de 47 MB la pantalla no se mueve. Sin botón de cancelar (`onDismissRequest = {}`), y si la
descarga se corta empieza de 0 (`DbrSync.downloadFirst` borra el `.part`).

**Causa de fondo (medida):** entre versiones de DbrServerPack cambian muy pocas entradas del jar:
- 5.2.0 → 5.3.0: 341 entradas, **0,75 MB** comprimidos de 47 MB.
- 5.3.0 → 5.5.0: 757 entradas, **1,6 MB** comprimidos.
El resto (texturas del gacha 18 MB, música 9 MB, wads 3,7 MB…) es idéntico byte a byte: cada
entrada del jar se comprime por separado, así que las no cambiadas tienen los mismos bytes.
Hoy cada release obliga a bajar los 47 MB enteros (hubo 4 releases en 4 días).

**Solución raíz:** parches delta por entrada de zip. La Action de la rama `assets` genera
`<sha1viejo>-<sha1nuevo>.dbrpatch` (~1-2 MB) y lo sube al release `assets-files`. El launcher, si
tiene la versión anterior del jar, baja el parche, reconstruye el jar nuevo **byte a byte
idéntico** y verifica el sha1 del manifest. Si no hay parche (404) o falla algo → descarga
completa como hoy. Sin cambios en el formato del manifest: compatible hacia atrás.

## Estado (2026-11-03)
HECHO, sin commit:
- Pasos 0-4 y 6 en worktree `DbrLauncher-android`: `DbrHttp.kt` (nuevo), `DbrPatch.kt` (nuevo),
  `DbrUpdater.kt` (usa DbrHttp), `DbrSync.kt` (`.part` por sha, reintentos, ByteCounter, tryPatch,
  limpieza de `.part` viejos), `LauncherScreen.kt` (Syncing con bytes, `SyncBytesProgress`,
  `cancelSync` + `cancelAndJoin`), string `dbr_sync_cancel_hint` en 3 idiomas.
  `compileDebugKotlin` en `C:\dev\dbr-wt` → BUILD SUCCESSFUL.
- Paso 5 parcial: worktree sparse `DbrLauncher-assets` (rama `assets`, solo `.github/` + manifests)
  con `.github/scripts/make-patches.mjs` (makePatch/applyPatch/modKey + CLI). Medido con jars reales,
  cada parche verificado con applyPatch (sha1 OK):
  - DbrServerPack 5.2.0→5.3.0: 47,2 MB → **2,2 MB** (4,7 %)
  - DbrServerPack 5.3.0→5.5.0: 47,7 MB → **3,05 MB** (6,4 %)
  - npcdbc 5.3.0→5.4.0: 4,4 MB → 0,32 MB (bajo el umbral de 5 MB, no se publicaría)

FALTA:
1. `mirror-assets.mjs`: importar make-patches; para cada jar ≥ 5 MB de los manifests actuales,
   buscar en `git show HEAD~1:<manifest>` el del mismo `modKey` con otro sha; jar viejo con
   `git show HEAD~1:<ruta>` (maxBuffer 200 MB) o, si falla, `gh release download` del asset `<sha>`;
   `makePatch` + `applyPatch`; saltar si > 50 % del nuevo; subir `<old>-<new>.dbrpatch` si no existe.
   Poda: conservar `.dbrpatch` cuyo sha destino esté en `wanted`; borrar los demás.
2. `mirror-assets.yml`: `actions/checkout@v4` con `fetch-depth: 2`.
3. Probar `DbrPatch.apply` (Kotlin) con un parche real: test JVM en
   `ZalithLauncher/src/test/.../DbrPatchTest.kt` que aplique `p2` (5.3.0→5.5.0) o un zip pequeño
   generado con el CLI; si no hay infraestructura de tests, un `main` temporal con kotlinc.
4. `assembleDebug` completo y prueba en dispositivo (ver Verificación).
5. Bitácora en `DbrLauncher-android/PLAN-sync-modpack.md`.
6. Commits (android-zalith y assets) solo cuando el usuario lo pida; push de `assets` dispara la
   Action y publica el primer parche en la siguiente actualización del modpack.

## Paso 0 — Archivos de plan (regla global)
- Crear `DbrLauncher-android/PLAN-sync-modpack.md` con este plan + bitácora fechada.
- Actualizar `DbrLauncher-android/CLAUDE.md` para que apunte a él (hoy apunta a PLAN-descargas-robustas.md).

## Paso 1 — Descarga reanudable compartida (Android)
Base: `android/ZalithLauncher2/ZalithLauncher/src/main/java/com/movtery/zalithlauncher/game/dbr/`
- Nuevo `DbrHttp.kt`: extraer `fetch()` de `DbrUpdater.kt:115` (timeouts 15/20 s, `Range`,
  206/200/416, `coroutineContext.ensureActive()` en el bucle) a una función reutilizable
  `fetchResumable(url, part, onBytes: (Long) -> Unit)` que reporta bytes recibidos (delta).
  `DbrUpdater` pasa a usarla (mismo comportamiento, su % se calcula con los bytes).
- `DbrSync.downloadFirst`:
  - `.part` con nombre por sha: `<dest>.<sha1[0..8]>.part` → un `.part` de otra versión nunca se reanuda.
  - En `IOException` **no** borrar el `.part`; reintentar hasta 5 veces con backoff 1→10 s
    (patrón de `DbrUpdater.download`), reanudando. Mirror como último recurso (mismo contenido
    por sha, así que el `.part` sirve para ambos).
  - Solo borrar el `.part` si el sha1 final no casa.
  - `CancellationException` se relanza sin borrar nada (para reanudar después).
- Al inicio del sync: borrar `*.part` del gameDir que no correspondan a un archivo de `toDownload`.

## Paso 2 — Progreso en bytes (punto 1)
- `DbrSync.Progress` gana `bytesDone: Long`, `bytesTotal: Long`, `file: String` (ya existe).
  `bytesTotal` = suma de `size` de `toDownload` (el manifest lo trae); bytes ya presentes en un
  `.part` cuentan como hechos. `AtomicLong` compartido por el pool de 8.
- Throttle: emitir como mucho cada 250 ms (más el final de cada archivo).
- `DbrInstallState.Syncing` gana `bytesDone`, `bytesTotal`, `file`.
- Diálogo (`LauncherScreen.kt:538`): `LinearProgressIndicator` (bytes) +
  "12,3 MB / 47,7 MB · 850 KB/s" (velocidad = media móvil en el composable con `formatFileSize`
  de `utils/file/FileUtils.kt:88`) + nombre del archivo actual + "1 / 4" como hoy.
  En la fase "check" (sin bytes) se mantiene el texto actual.

## Paso 3 — Botón Cancelar (punto 2)
- `DbrInstallViewModel.syncThenLaunch` guarda el `Job`; nuevo `cancelSync()` → `job.cancel()`.
- En `onFailure`, si es `CancellationException` → `state = Idle` y toast
  "Descarga en pausa. Sigue donde quedó al pulsar Jugar." (los `.part` se quedan).
- Botón "Cancelar" en el diálogo de Syncing. Strings nuevos en `res/values/strings_dbr.xml`,
  `values-es`, `values-pt`.

## Paso 4 — Reanudar descargas cortadas (punto 3)
Cubierto por pasos 1+3: el `.part` sobrevive a cortes, reintentos, cancelar y cerrar la app.

## Paso 5 — Parches delta: generador (rama `assets`)
- `.github/workflows/mirror-assets.yml`: `fetch-depth: 2` (necesita `HEAD~1` de los manifests).
- `.github/scripts/mirror-assets.mjs` (o módulo nuevo `make-patches.mjs` que llama):
  - Para cada `.jar` > 5 MB de los manifests actuales, buscar en los manifests de `HEAD~1` el
    jar del mismo mod (misma ruta, o mismo prefijo sin versión: `DbrServerPack-5.3.0.jar` ↔
    `DbrServerPack-5.5.0.jar`) con sha distinto.
  - Jar viejo: `git show HEAD~1:<ruta>` (o el asset `<sha>` del release si no está).
  - Formato `DBRP1` (sin dependencias, aplicable en Kotlin y Node): cabecera
    `magic, sha1 destino, tamaño destino`, luego ops `COPY(offset,len)` del viejo o
    `DATA(len, bytes)`. El generador recorre los registros locales del zip nuevo (cabecera +
    datos, rangos sacados del directorio central) y si el mismo bloque de bytes existe en el
    viejo emite COPY; si no, DATA. Directorio central + EOCD van como DATA.
  - Antes de subir: aplicar el parche en el propio script y comprobar sha1 == destino.
    Si el parche pesa > 50 % del jar nuevo, no se sube.
  - Subir como asset `<old>-<new>.dbrpatch`. La poda de huérfanos no borra parches cuyo destino
    siga en algún manifest; borra los demás.
- Limitación aceptada: solo N-1 → N. Quien se salte una versión baja el jar completo.

## Paso 6 — Parches delta: aplicador (Android)
- Nuevo `game/dbr/DbrPatch.kt`: `apply(old: File, patch: File, out: File)` streaming
  (`RandomAccessFile` para COPY), verifica sha1 destino.
- En `DbrSync`, antes de la descarga completa de un `.jar`: candidatos viejos = el archivo en
  la misma ruta (si existe con otro sha) + los de `toDelete` con el mismo prefijo de mod (aún
  existen: el borrado de obsoletos va después). Para cada candidato: sha1 → GET
  `ASSET_MIRROR_BASE + "$old-$new.dbrpatch"` vía `fetchResumable`. 404 → siguiente / descarga
  completa. Cualquier error al aplicar → descarga completa. El progreso en bytes usa el tamaño
  del parche.

## Fase PC — launcher de escritorio (rama `main`, `src/main`)
Pedido del usuario 2026-11-03. Va después de terminar el generador de la rama `assets` (lo
comparten los dos launchers). Estado actual del de PC:
- Progreso en bytes: **ya lo tiene** (`sync/engine.ts:107-130`: barra por bytes, archivo en curso).
- Reintentos + mirrors: **ya los tiene** (`http.ts` `httpRequest`: backoff, `assetMirrorBase`, jsDelivr/statically).
- Reanudar: **no**. `net.ts` `ensureFile` baja todo a memoria (`res.body`) y cada reintento empieza en 0.
- Cancelar la sync: **no** hay IPC ni botón.
- Parches delta: **no**.

Pasos PC (en este orden, por beneficio):
1. **Parches delta** — nuevo `src/main/sync/patch.ts`: `applyPatch(oldPath, patchBuf, outPath)`
   (puerto del `applyPatch` de `make-patches.mjs`, streaming con `fs.read` por COPY, verifica sha1)
   y `modKey()`. En `engine.ts`, antes de `ensureFile` de un `.jar` ≥ 5 MB: candidatos = `dest`
   existente + `toDelete` con mismo `modKey`; sha1 con `sha1FileCached` (`sync/hash.ts`);
   GET `CONFIG.assetMirrorBase + "<old>-<new>.dbrpatch"` con `httpRequest` (sin mirrors CDN);
   404 → siguiente / descarga completa. `received`/`bytesTotal` se ajustan al tamaño del parche.
   `rememberSha1` del resultado.
2. **Descarga a disco reanudable** — en `http.ts` una `downloadToFile(url, part, {onProgress, mirrors})`
   que escribe en stream a `<dest>.<sha8>.part`, pide `Range` si existe, trata 200/206/416 como
   en `DbrHttp.kt`, reutiliza el bucle de reintentos/mirrors de `httpRequest`. `ensureFile` la usa
   para archivos con `size` ≥ 1 MB (los pequeños siguen en memoria). Baja además el uso de RAM
   (hoy 47 MB en un Buffer por jar). Limpieza de `.part` viejos al empezar la sync.
3. **Cancelar sync** — `AbortController` por sync en `sync/index.ts`; `runSync` lo pasa a `pool`
   y a `downloadToFile` (destruye el request). IPC `sync:cancel` en preload + botón "Cancelar" en la
   pantalla de progreso del renderer (localizar el componente que pinta `phase: 'download'`), con
   el mismo texto "la descarga sigue donde quedó". Strings en los 3 idiomas del launcher.
4. Release por tag (`vX.Y.Z`, ver memoria release-via-tag-ci), no `build:win` local.

Verificación PC: `npm run typecheck` / tests existentes de `sync`; prueba manual con instancia en
DbrServerPack 5.3.0 → baja ~3 MB; cortar red a mitad del jar → reanuda; Cancelar → vuelve a la home.

## Fuera de alcance
- Parches para quien se salta versiones (N-2 → N): baja el jar completo.

## Archivos críticos
- `game/dbr/DbrSync.kt`, `game/dbr/DbrUpdater.kt`, nuevos `game/dbr/DbrHttp.kt`, `game/dbr/DbrPatch.kt`
- `ui/screens/content/LauncherScreen.kt` (VM `DbrInstallViewModel` + `DbrInstallDialog`)
- `res/values*/strings_dbr.xml` (3 idiomas)
- Rama `assets`: `.github/workflows/mirror-assets.yml`, `.github/scripts/mirror-assets.mjs`

## Verificación
1. Generador local: `node make-patches.mjs` contra 5.3.0 → 5.5.0 (sacados con `git show`):
   tamaño del parche (esperado ~2 MB), y aplicarlo con el propio script → sha1 `46e7a4c5…`.
2. Aplicador Kotlin: test unitario JVM con un zip pequeño viejo/nuevo + el parche que genera el script.
3. APK: build en `C:\dev\dbr-wt` (`./gradlew ZalithLauncher:assembleDebug -Darch=arm64 --no-daemon`).
   En el dispositivo/emulador con mods 5.3.0: Jugar → ver MB/velocidad; Cancelar a mitad →
   vuelve a la home; Jugar otra vez → sigue desde el `.part`; modo avión a mitad → reintenta y reanuda.
4. Con el parche publicado: forzar instancia con DbrServerPack 5.3.0 → el sync baja ~2 MB y
   el jar resultante pasa el sha1.
5. Commit en `android-zalith` y en `assets` solo cuando lo pida el usuario (reglas dbr-git).

## Bitácora
- 2026-11-02: diagnóstico (1/4 = jar de 47 MB sin progreso) y plan aprobado.
- 2026-11-03: Android pasos 1-4 y 6 hechos; compileDebugKotlin OK. make-patches.mjs + mirror-assets.mjs (worktree DbrLauncher-assets, sin commit). Parches reales: 47,7 MB -> 3,05 MB. DbrPatchTest 3/3 OK (incluye jar real). assembleDebug OK (subst X: sobre DbrLauncher-android). Usuario pidió Fase PC; añadida al plan.

- 2026-11-03: rama assets: mirror-assets.mjs genera y sube parches (dedupe full/lite/experimental, poda conserva parches con destino vivo), workflow fetch-depth 2. node --check OK; sin prueba real de la Action.
- 2026-11-03: Fase PC hecha en rama `feat/sync-parches` (repo principal): sync/patch.ts (applyPatch+tryPatch+modKey, probado con el jar real: sha1 46e7a4c5 OK), engine.ts usa parches y limpia .part viejos, http.ts `toFile` (Range 200/206/416, ERR_CONTENT_LENGTH_MISMATCH) + `signal`, net.ts ensureFile reanudable >= 1 MB, IPC sync:cancel + botón Cancelar + MB y velocidad en SyncBar, i18n sync.cancelar_hint. tsc node/web OK. Sin probar en ejecución.

## Siguiente paso
Pruebas manuales: APK en dispositivo y `npm run dev` en PC (cortar red a mitad del jar, Cancelar, volver a Jugar). Commits en android-zalith, assets y feat/sync-parches cuando el usuario lo pida.
