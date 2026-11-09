# Plan: descargas del modpack resistentes a bloqueos de GitHub

## Contexto

Un jugador en Windows 10 vio `Descarga falló (403)` al bajar `lite/mods/DbrServerPack-5.8.0.jar` desde `raw.githubusercontent.com`. El archivo existe: desde otra red da 200, y el mirror `releases/download/assets-files/<sha1>` también da 200. Después de reiniciar la PC, al jugador le funcionó. Por eso la causa probable es un límite temporal de GitHub por IP: desde 2025, GitHub limita más fuerte las peticiones anónimas a raw. La sync baja 8 archivos en paralelo, y todo sale de GitHub (raw, release, jsDelivr). Cuando GitHub limita la IP, todas las fuentes caen juntas.

Objetivo: que un bloqueo de GitHub no tumbe la sync.
- Origen principal fuera de GitHub: Cloudflare R2 con dominio propio.
- GitHub queda como respaldo.
- Menos presión sobre raw.
- Espera y reintento ante 403/429.
- Mensaje útil para el jugador.
- Todo se automatiza desde la rama `assets` (DBR-ASSETS). Un push publica en R2 sin pasos manuales. La lista de fuentes se controla desde el manifest, sin release del launcher.

Decisiones del usuario (2026-11-09):
- Puntos 1, 2, 3 y 5 de la propuesta. El punto 4 (log) solo entra dentro del 3, como detalle del error.
- Proveedor: Cloudflare R2 con dominio propio.
- Alcance: PC (DbrLauncher) y Android (DbrLauncher-android, `DbrSync.kt`).

## Diseño

Todo archivo con sha1 se pide por **contenido**: `<base>/<sha1>`. Fuentes, en este orden:
1. R2: `https://dbr-assets.dbrlauncher.workers.dev/f/<sha1>`. No pasa por GitHub, salida gratis y caché de Cloudflare.
2. Release `assets-files/<sha1>`: GitHub, pero otra infraestructura distinta de raw.
3. raw: la URL `f.url` del manifest. Último recurso.

La lista de bases sale del manifest (`"mirrors": [...]`, campo nuevo y opcional), con valores por defecto en el código. Cambiar o agregar un CDN = editar `actualizar.bat` o gen-manifest y hacer push. No hace falta release del launcher. Los launchers viejos ignoran el campo: `Manifest` en `src/shared/sync.ts` es una interfaz simple, sin validación estricta.

Los manifests, `forge-1.7.10.json` y `news.json` también se publican en R2: `https://dbr-assets.dbrlauncher.workers.dev/m/<nombre>`, con caché corta. El launcher los pide primero a R2 y luego a raw. La Action sube el manifest **al final**, después de todos los archivos. Así el manifest de R2 nunca apunta a un sha1 que aún no existe.

## Fase A: infraestructura R2 + Worker (la hago yo con wrangler)

Cambio 2026-11-09: el usuario no tiene dominio y no hay dominios gratis fiables. Se sirve con un **Cloudflare Worker** en `*.workers.dev` (gratis y apto para producción) que lee el bucket R2 por binding. `r2.dev` queda descartado: tiene límite y Cloudflare dice que no es para producción. Plan gratuito: 100k peticiones/día al Worker; una sync completa son unas 100 peticiones. La salida desde R2 es gratis.

1. Login de wrangler (instalado global, v4.159.0): el usuario corre `! wrangler login` una vez.
2. `wrangler r2 bucket create dbr-assets`.
3. Worker `dbr-assets` en `DBR-ASSETS/worker/` (`wrangler.toml` + `src/index.js`):
   - Solo GET/HEAD.
   - Solo claves `f/<sha1>`, `p/<old>-<new>.dbrpatch` y `m/<nombre>.json`. Lo demás da 404.
   - Soporte de `Range`, porque el launcher reanuda los `.part`.
   - Headers: `ETag`, `Content-Length`, y `Cache-Control` inmutable para `f/` y `p/`, `max-age=60` para `m/`.
   - `wrangler deploy` y anotar la URL `https://dbr-assets.dbrlauncher.workers.dev`.
4. Token API de R2 (Object Read & Write, solo este bucket). El panel lo crea; si wrangler no puede, el usuario lo crea con mi guía. Secrets en GitHub con `gh secret set`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Variable `R2_PUBLIC_BASE` con `gh variable set`.
5. Si el Worker cambia, la Action puede desplegarlo también (`CLOUDFLARE_API_TOKEN`). Es opcional.

## Fase B: automatizar en DBR-ASSETS (punto 5)

Archivos:
- `DBR-ASSETS/.github/workflows/mirror-assets.yml`
- `DBR-ASSETS/.github/scripts/mirror-assets.mjs` (160 líneas; hoy sube al release y genera `.dbrpatch`)

1. Workflow: pasar los secrets R2 como `env`. Si faltan, el paso R2 se salta con un warning y el release sigue funcionando como hoy.
2. Script: agregar un destino R2 junto al release. Reusar `wanted` (sha1 a archivo) y la lista de parches que ya calcula el script.
   - Para el upload usar `aws s3` (viene en `ubuntu-latest`) con `--endpoint-url https://<account>.r2.cloudflarestorage.com`. Así no se agregan dependencias npm.
   - Listar lo que ya existe con un solo `aws s3api list-objects-v2`. Subir solo lo que falta.
   - `f/<sha1>` con `Cache-Control: public, max-age=31536000, immutable`.
   - `p/<old>-<new>.dbrpatch` con el mismo header.
   - **Al final** subir `m/manifest.json`, `m/manifest-lite.json`, `m/manifest-experimental.json`, `m/forge-1.7.10.json` y `m/news.json` con `max-age=60`.
   - Huérfanos en R2: borrarlos solo si llevan más de 7 días fuera de todo manifest, según `LastModified`. Así un jugador a mitad de una sync no pierde el archivo. El release mantiene su lógica actual.
   - Verificar: `HEAD` público a `R2_PUBLIC_BASE/f/<sha1>` de 1 o 2 archivos subidos. La Action falla si el resultado no es 200.
3. `scripts/gen-manifest.mjs` (rama `main` del launcher; `actualizar.bat` lo toma de ahí): escribir `"mirrors": ["https://dbr-assets.dbrlauncher.workers.dev/f/", "https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/"]`. Leer la lista de una constante o un flag `--mirrors`, para cambiarla sin tocar el launcher.
4. `actualizar.bat`: no necesita cambios. Al hacer push, la Action corre sola.

## Fase S: costo cero y seguridad (decidido 2026-11-09)

Costo:
- Workers queda en plan Free. Nunca contratar Workers Paid. Al pasar 100k peticiones por día, el Worker corta con error 1027 y no cobra. El launcher cae a GitHub. Ese tope limita también las lecturas de R2: menos de 3M por mes, contra 10M gratis.
- Guarda en `mirror-r2.mjs`: abortar sin subir si el bucket pasa de 8 GB (límite gratis: 10 GB) o si una corrida haría más de 5.000 escrituras (límite gratis: 1M por mes).
- Alertas de facturación en el panel: Notifications > Usage Based Billing, para R2 storage y operaciones.
- r2.dev queda desactivado (verificado). El bucket no tiene otra salida pública que el Worker.

Seguridad:
- Manifests firmados con Ed25519. La Action firma `m/<manifest>.json` y sube `m/<manifest>.json.sig`. Clave privada en el secret `MANIFEST_SIGN_KEY`. Clave pública embebida en el launcher, PC y Android. El launcher solo acepta un manifest de R2 si la firma es válida; si no, usa raw. Así una clave R2 filtrada no puede servir jars maliciosos: el sha1 de cada jar viene del manifest firmado.
- Token R2 limitado a Object Read & Write sobre `dbr-assets`. Solo vive en GitHub secrets. La Action corre en push a `assets` y en `workflow_dispatch`, nunca en `pull_request`.
- Al terminar: `wrangler logout` (token OAuth local con scopes amplios). Para desplegar el Worker de nuevo, `wrangler login` de nuevo.
- Privacidad: el subdominio `firulais-pinzon-2019` deja ver parte del correo. Se puede cambiar en Workers > Settings > Subdomain; si cambia, actualizar `R2_PUBLIC_BASE` y los valores por defecto del launcher.

## Fase C: launcher PC (puntos 1, 2 y 3)

Archivos:
- `src/shared/config.ts`: `assetMirrorBases` por defecto `[R2, release]`. Agregar `metaBases` (R2 `/m/` y raw `/assets/`). Mantener `assetMirrorBase` como alias o eliminarlo.
- `src/shared/sync.ts`: `Manifest.mirrors?: string[]`.
- `src/main/sync/engine.ts:168`: construir las fuentes como `[...bases.map(b => b + sha1), f.url]`. `bases` = `manifest.mirrors` válidos (solo `https`) o el valor por defecto. Llamar a `ensureFile(dest, primera, sha1, …, resto)`.
- `src/main/sync/patch.ts:112`: probar el `.dbrpatch` en cada base, en orden. Si da 404, pasar a la siguiente base.
- `src/main/sync/index.ts` y `fetchManifest`: pedir el manifest a R2 `m/` y usar raw como respaldo. Lo mismo para `CONFIG.forgeJsonUrl` (`src/main/launch/mojang.ts:56`) y para news.
- `src/main/http.ts`:
  - **Punto 1:** `httpRequest` ya recorre `[url, ...mirrors, ...mirrorsFor(url)]`. Con raw al final de la lista, ese orden ya da prioridad a R2. Quitar jsDelivr y statically de `mirrorsFor` para los jars: dan 403 o se cuelgan. Dejarlos solo para JSON pequeños.
  - **Punto 2:** agregar un limitador por host (semáforo simple en `requestOnce`): como máximo 3 conexiones simultáneas a `raw.githubusercontent.com` y 4 a `github.com`. R2 queda sin límite extra, con el `CONCURRENCY = 8` del engine.
  - **Punto 3:** si todas las fuentes terminan en 403/429 (bloqueo), esperar `Retry-After`, o 20 s con jitter si no viene. Después repetir **una** vuelta completa. En ese segundo intento, emitir el progreso con el estado "GitHub limitó la conexión, reintentando en 20 s". Guardar el status de cada fuente en una lista `intentos`.
  - Si sigue fallando, lanzar el error nuevo `err.bloqueado`.
- `src/shared/i18n.ts`: agregar `err.bloqueado` en es, en y pt. Texto: "Tu conexión fue bloqueada temporalmente (403). Espera unos minutos, desactiva VPN/proxy o el escaneo HTTPS del antivirus y vuelve a intentar." Agregar una línea de detalle por fuente: host y status. Mantener `err.descarga` para los casos que no son de bloqueo.
- Tests: si el repo tiene tests de `http.ts` (verificar con `vitest`), agregar estos casos con un servidor local falso:
  - orden de fuentes;
  - 403 en todas, espera y éxito en la segunda vuelta;
  - límite por host.

## Fase D: launcher Android

Archivo: `DbrLauncher-android/.../game/dbr/DbrSync.kt` y `DbrPatch.kt`.

1. Cambiar `ASSET_MIRROR_BASE` por una lista: `manifest.mirrors` o el valor por defecto `[R2, release]`. Orden de fuentes: bases primero, `f.url` (raw) al final. Ver líneas 108, 236 y 463.
2. Manifest: pedirlo a R2 `m/` y usar raw como respaldo.
3. Limitar la concurrencia hacia raw igual que en PC. Agregar la espera única ante 403/429 y el mensaje traducido en los strings del launcher.
4. Build del APK según la memoria `android-apk-local-build-subst` (unidad virtual con `subst`), o por CI si existe.

## Fase E: publicación y orden de despliegue

1. Fase A y Fase B primero. Hacer push a `assets` y verificar que R2 tiene todos los sha1 de los 3 manifests y los archivos `m/`.
2. Después gen-manifest con `mirrors` y push a `assets`. Los launchers viejos siguen funcionando: ignoran el campo nuevo.
3. Después PC: versión 1.0.37, release por tag `v1.0.37` según la memoria `release-via-tag-ci`. No usar build:win local.
4. Después Android: versión nueva del APK.

## Verificación

- R2: `curl -I https://dbr-assets.dbrlauncher.workers.dev/f/e9e92f83c40a799d5d67f9e2bb045c8f4f9f388f` debe dar 200 con `cf-cache-status`. Repetir con `m/manifest-lite.json`.
- Comparar la lista de objetos R2 con los sha1 de los 3 manifests: 0 faltantes.
- PC, sync limpia: borrar `mods/` del gameDir y lanzar con `npm run dev`. El log debe mostrar las descargas desde `dbr-assets.dbrlauncher.workers.dev`.
- PC, simular bloqueo: poner `dbr-assets.dbrlauncher.workers.dev` y `github.com` en `hosts` como `0.0.0.0`. La sync debe bajar desde raw. Después bloquear también raw: debe aparecer la espera y luego `err.bloqueado` con el detalle por fuente.
- PC, parche delta: con un jar viejo en disco, el `.dbrpatch` debe salir desde R2 `p/`.
- Android: las mismas pruebas, en un dispositivo o en el emulador.
- `npm run typecheck`, `npm run lint` y los tests.

## Al aprobar (paso 0)

- Copiar este plan a `DbrLauncher/PLAN-mirror-r2.md`, con las decisiones y la bitácora. Apuntar `DbrLauncher/CLAUDE.md` a ese archivo, según las reglas globales.
- Crear la rama `feat/mirror-r2` en DbrLauncher.

## Bitácora

- 2026-11-09: Fase C hecha en `feat/mirror-r2`. `http.ts`: tope por host de GitHub (raw 3, github.com 4, api 2), 404 y 403 pasan a la siguiente fuente, espera única de 20 s si todo da 403/429 (solo con `onBlocked`, o sea la sync), jsDelivr/statically solo sin `toFile`. `meta.ts`: manifests y forge json desde R2 con firma Ed25519 verificada; si no, raw. `engine.ts`/`patch.ts`: fuentes `manifest.mirrors ?? CONFIG.assetBases` y raw al final. Error `err.bloqueado` con detalle por fuente; Home muestra `sync.bloqueado` con la cuenta atrás. `gen-manifest.mjs` escribe `mirrors` (flag `--mirrors`). Worker: parches también bajo `f/` (a6bf044). Tests: `mirror-itest` nuevo (15 checks OK, jar de 37,5 MB desde R2 en 2 s); `sync`, `manifest`, `seed` y `launch` itest OK; typecheck OK.
- 2026-11-09: subdominio cambiado a `dbrlauncher` (API: DELETE + PUT de `/workers/subdomain`). Worker en `https://dbr-assets.dbrlauncher.workers.dev`; `R2_PUBLIC_BASE` actualizado.
- 2026-11-09: Fase S en Action (eba69b0): firma Ed25519 de `m/*.json` en `m/*.json.sig` (secret `MANIFEST_SIGN_KEY`; copia local en `C:/Users/Junior/.dbr-secrets/`, clave pública `MCowBQYDK2VwAyEAD38BJWLGtZFS8JwAAOaDsKNKrVOWatPPTk8Dg7V7FSY=`) y tope de 8 GB / 5000 escrituras. Action OK; bucket 115 MB; firma verificada con la clave pública.
- 2026-11-09: push de Fase B a `assets` (e919f6d). Action OK: 98 archivos y 2 parches en R2, `m/` subido. Verificado: jar `e9e92f83…` 200 por el Worker con sha1 correcto (37,5 MB en 2 s); `state/` no es público. Agregada Fase S (costo cero y firma de manifests).
- 2026-11-09: Fase A hecha. R2 activado, bucket `dbr-assets` creado. Worker `dbr-assets` desplegado en `https://dbr-assets.dbrlauncher.workers.dev` (`DBR-ASSETS/worker/`); probado: GET 200, Range 206, HEAD, 404 para claves no válidas, 405 para POST. Secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y variable `R2_PUBLIC_BASE` cargados en `jmpz2026/DbrLauncher` (claves vía archivo temporal, ya borrado).
- 2026-11-09: Fase B escrita, sin push: `.github/scripts/mirror-r2.mjs` (archivos, parches copiados del release, `m/` al final, huérfanos con 7 días de gracia en `state/orphans.json`, chequeo público) y paso nuevo en `mirror-assets.yml`.
- 2026-11-09: paso 0 hecho (plan copiado, CLAUDE.md, rama `feat/mirror-r2`). Sin dominio: se cambia a Worker en workers.dev. wrangler 4.159.0 instalado global (con `--cache C:/Users/Junior/.npm-cache-alt`, porque el cache de AppData da EPERM).
- 2026-11-09: diagnóstico del 403 (raw da 200 desde otra red; el jugador se recuperó al reiniciar). Plan creado. Decisiones: R2 con dominio propio, PC y Android, puntos 1, 2, 3 y 5.

## Próximo paso

Usuario: OK para mergear `feat/mirror-r2` a `main` y publicar v1.0.37 por tag. Después Fase D (Android). Usuario: alertas de facturación. Al final: `wrangler logout`.
