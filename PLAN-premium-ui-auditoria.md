# Plan: Premium login (live.com flow) + device code card + optional music + UI polish + audit fixes

## Context

A player's portable build of DbrLauncher showed that Microsoft login works without the Mojang approval of our Azure app. It does this by using the client ID of the official Minecraft Launcher (`00000000402b5328`) through `login.live.com`. The user decided: **do the same as the player**, but implement it cleanly, for Windows and Linux. The top priority is that the premium session lasts as long as possible before the player has to log in again.

The player's patch has bugs that we must not copy. Its refresh goes to the Azure endpoint with our client ID, so it always fails and asks for login on every start. It sends `RpsTicket: d=`. Its download errors fail silently.

Risk the user accepted: `00000000402b5328` is not our client ID. Microsoft can block it at any time. We keep the Azure flow in the code, behind a config switch, so we can move to it if the review is ever approved or the live flow breaks.

User decisions:
- Premium uses the live.com flow with the official client ID (like the portable).
- Music: optional, off by default, a track with a clear license.
- UI: targeted polish, not a full redesign. The review found "AI look" patterns, and the code base is small and coherent.

## Phase 1 — Premium login that lasts (main process)

Files: `src/shared/config.ts`, `src/main/auth/{index,microsoft,minecraft,store}.ts`, `src/shared/account.ts`, `src/preload/index.ts`, `src/main/launch/index.ts:82`, `src/shared/i18n.ts`.

1. **Provider config.** `CONFIG.auth.provider: 'live' | 'azure'`, default `'live'`. Add a `live` block: clientId `00000000402b5328`, scope `service::user.auth.xboxlive.com::MBI_SSL`, `deviceCodeUrl` `https://login.live.com/oauth20_connect.srf`, `tokenUrl` `https://login.live.com/oauth20_token.srf`. Keep the `azure` block as it is today. `isPremiumEnabled()` becomes true for `live`. Remove the "Próximamente" path.
2. **One OAuth module for both providers** (`microsoft.ts`). `requestDeviceCode`, `pollForToken` and `refreshToken` take the provider endpoints. For live, add `response_type=device_code` and send `scope` in the refresh. Keep the existing `slow_down` / `authorization_declined` / `expired_token` handling.
   - Return `errorKind: 'expired' | 'network' | 'other'`: `invalid_grant` / `interaction_required` / `bad_verification_code` mean `expired`; timeout / 5xx / no response mean `network`.
3. **RpsTicket by provider** (`minecraft.ts`). Azure uses `d=<token>`. Live uses `t=<token>`, with one retry using `d=` if XBL answers 400. Confirm on the first real login and remove the retry once the right prefix is known.
4. **Keep the Minecraft token.** `login_with_xbox` returns `expires_in` (about 24 h). Return `expiresAt` from `fetchMinecraftProfile`.
5. **Persistence that survives** (`store.ts`):
   - Store `provider`, `refreshTokenEnc`, `mcTokenEnc`, `mcExpiresAt` and `needsRelogin`.
   - Write atomically: write `account.json.tmp`, then rename. A half-written file loses the session today.
   - **Linux without a keyring** (Electron 22: `safeStorage.isEncryptionAvailable()` can be false): fall back to plain storage in a file with mode `0600` and flag `insecureStorage: true`. Today the refresh token is not saved at all in this case, so login is needed on every start.
   - If decryption fails (keyring changed): set `needsRelogin`, do not crash.
6. **Silent renewal with a single flight** (`auth/index.ts`). `ensureSession(): Promise<SessionState>` with one shared in-flight promise, so launch and startup never refresh twice in parallel.
   - If the MC token is valid for more than 10 min: use it, no network.
   - Else refresh MS. **Save the rotated refresh token immediately**, before the Xbox chain. Then run XBL → XSTS → MC, save the MC token and `expiresAt`, and update `username`/`uuid` from the profile (name changes).
   - Error `expired`: set `needsRelogin=true` and keep the username for the UI.
   - Error `network`: keep the session and retry 2 times with backoff.
7. **Keep the refresh token alive.** Call `ensureSession()` in the background when the app starts (premium only), and every 12 h while the launcher stays open. Each use renews the Microsoft refresh token, so the session only expires if the launcher is not opened for a long time (about 90 days by Microsoft policy).
8. **Never launch premium with token `'0'`** (`launch/index.ts:82`). If there is no valid token: if `needsRelogin`, stop the launch with "Tu sesión de Microsoft caducó, vuelve a entrar". If it is a network error, show the network error. Offline accounts keep `'0'`.
9. **Cancel and robustness.** `auth:cancel-premium` IPC with an `AbortController` passed to `pollForToken` and `httpRequest`. Check `sender.isDestroyed()` before `send`. Open only `https://` URLs on `login.live.com`, `microsoft.com` or `www.microsoft.com` with `shell.openExternal`.
10. **IPC for the UI.** `auth:get` returns `{ account, needsRelogin }`. Add an `auth:session-changed` event so the renderer shows a banner when renewal finds an expired session.

## Phase 2 — Device code card and optional music (renderer, portable point 7)

Files: `src/renderer/src/screens/Login.tsx`, `store.ts`, `screens/Home.tsx`, `screens/Settings.tsx`, `src/shared/settings.ts`, `src/main/settings/index.ts`, i18n.

1. **Device code card** in the premium card (`Login.tsx`, `device` block):
   - The code is large, is copied to the clipboard automatically when it arrives, and has a "Copiar" / "Copiado" button. Reuse the keys `comun.copiar` / `comun.copiado` and the `FuseBanner.tsx` pattern.
   - Add an "Abrir enlace" button, a countdown from `expiresIn`, and a "Cancelar" button.
   - Add `busy` and `catch` to both logins.
2. **Session banner.** When `needsRelogin` is set, Home shows "Tu sesión de Microsoft caducó" with a "Volver a entrar" button that starts the device code flow with the same account.
3. **Optional music:**
   - Setting `musica: { activa: false, volumen: 0.3 }`, with a toggle and slider in Settings.
   - A single `<audio loop>` in `App.tsx`. It pauses while the game is running (`launch` status) and when the window is minimized.
   - Track: generate it with the `mc-musica` skill (Stable Audio, ACRCloud check, credit in COPYRIGHT). Do **not** use the portable's `cancion.mp3`.

## Phase 3 — UI polish (no redesign)

Target the patterns that look AI-made, in priority order:
1. **Two-level typography.** Pixelify only for titles and the PLAY button. A readable sans for body text and labels. Uppercase with wide tracking only on the main button.
2. **One brand: "Dbr Launcher"** (user decision). Use it in the window title, the title bar (replacing "Resurrection") and the installer.
3. **Shared components:**
   - `Btn`, `Modal` (role=dialog, Escape, focus trap), `Progress` (with a real animated indeterminate mode) and `PanelTitle`.
   - These replace the copies in Home, Settings, UpdateOverlay and the modals.
   - A visible `focus-visible` style everywhere.
4. **Home:** the "Mods al día" chip shows the real state (sync off or failed). The ki-style progress bar has a real indeterminate mode. There is no art for now (user decision): a later phase.
5. **Saga palette:** orange `#f26a1b` + blue `#1f4fa8` with ki gold for states. Use one single error color.
6. **Settings** in tabs (Juego / Modpack / Sistema), with real toggles that use `aria-pressed`.

**Order of work:** Phase 1 → 2 → Phase 4 high priority → 3 → the rest of 4. Each phase ends with its own commit and a line in the log.

## Phase 4 — Code audit fixes

### Renderer (verified by the review)
- **Gold button hover** (`Settings.tsx:275`, `LiteProposalModal.tsx:43`, `UpdateOverlay.tsx:70`): text becomes unreadable because of `.mc-btn:hover`. Remove `mc-btn` when `mc-btn-gold` is set.
- **Listener leak** (`store.ts:220-235`): `launch.onStatus` stays alive if `launch.start()` returns `!ok`. Remove it in that branch.
- **Settings inputs** (`Settings.tsx:351,363,383`, `store.ts:332-355`): one IPC call per key press can reorder answers, and `Number('')` sends 0. Save on blur or with a 300 ms debounce. Also merge the duplicated mapping at `store.ts:318-330` / `345-355`.
- **Logout** (`store.ts:173`): reset `prewarmPromise`, `prewarmDone` and `syncSummary`.
- **Ping** (`store.ts:361`): add a `catch`, and set `lastPingAt` only after success.
- **Missing optional call** (`Home.tsx:296`): `getVersion` needs `?.`.
- **Timer cleanup:** clear the `setTimeout` calls in `FuseBanner.tsx:29` and `GameLogModal.tsx:19` on unmount.
- **Impure render:** move the `useSpeed` ref update into an effect.
- **Dead code:** Tailwind tokens `stone2`, `stone-light`, `stone-dark`, `line`, `accent`, fonts `pixel` / `display`, `splash-pulse`. Class `.bg-blocks`. Store field `prewarming`.
- **Text without `tr()`:** "No-Premium", "Premium", "GB RAM", "Build v", "Forge · Java 8". Make `<html lang>` dynamic.
- **Motion:** the chispas follow `prefers-reduced-motion`.

### Main process — high priority (players get stuck, or a security hole)

1. **Updater error** (`updater/index.ts:52`): send `state:'error'` and let `UpdateOverlay` retry or close. Today a failed download leaves the player trapped on the overlay.
2. **Packaging** (`electron-builder.yml:5-10`): use a whitelist `files: ['out/**','package.json']`. The local asar weighs 736 MB with `.npmcache`, `.claude/settings.local.json`, `scripts/` and the docs inside.
3. **Electron hardening** (Electron 22 stays for Win7/8, so compensate):
   - `sandbox:true`.
   - `will-navigate` → `preventDefault`.
   - CSP in `index.html`, with `media-src 'self'` for the music.
   - `setWindowOpenHandler`: only `https:` URLs to a list of known hosts.
   - `ELECTRON_RENDERER_URL` only when `!app.isPackaged`.
4. **`settings:set` validation** (`settings/index.ts:79`): check types and keys, and clamp `ramGb`. For `jvmArgs`, reject `-javaagent`, `-XX:OnError` and `-XX:OnOutOfMemoryError`.
5. **Single instance:** `app.requestSingleInstanceLock()` and focus the existing window on `second-instance`. In main, keep one in-flight promise per operation: sync, launch, ensureJava.
6. **Linux AppImage:** remove `LD_LIBRARY_PATH` / `LD_PRELOAD` from Java's env when `APPIMAGE` is set (`launch/index.ts:113`). Document the AppArmor issue on Ubuntu 24.04+ and recommend the `.deb`.
7. **Windows natives:** when `userData` has non-ASCII characters (tildes, ñ), put the natives in an ASCII path (`args.ts:53`). LWJGL2 fails to load them otherwise.

### Main process — medium priority

- **Case-only renames** (`sync/engine.ts:100,211`): compare paths in lowercase on win32. Today a rename of only the capitalization deletes the mod.
- **"Reinstalar" Java does nothing:** add `java:reinstall`.
- **`http.ts:144,146`:** wrap `openSync`/`rmSync` in try/catch, then reject and abort.
- **`modpackSyncPending`** (`sync/index.ts:58`): clear the flag only if the variant did not change during the sync.
- **First-start language:** `electronLanguages` is missing `pt-BR` and `es-419`. Or use `app.getPreferredSystemLanguages()`.
- **JRE download:** stream it to disk with `toFile`, which also makes it resumable. Use async inflate in `zip.ts`, because the sync one freezes the UI.
- **`readGameLogTail`:** read only the last 64 KB.
- **Libraries:** download them with the shared pool and pass `size`, so the resumable download is used.
- **Optional requests** (manifest headSha, forge cache): an option for fewer retries.

### Low priority and dead code

- **Timeouts:** `dns.resolveSrv` (2 s) and `java -version` (15 s).
- **Small fixes:** fd leak in `patch.ts:43`. In `zip.ts:89`, mask with `0o777`. Add `.catch` to `openExternal`/`loadURL`.
- **Caches:** cache the language in `tr()`. Keep content-addressed assets out of `hash-cache`.
- **Dead code:**
  - The `natives` phase and its i18n key.
  - The `idle` / `preparing` / `error` states nobody emits.
  - The `runSync` / `pingServer` re-exports and `LauncherConfig`.
  - `isManifestConfigured` / `isForgeConfigured` and their branches.
  - The mac config and the `build:mac` script.
  - About 13 exports used only inside their own file.
- **Duplications to merge:** `pool` (engine + assets), `safeJoin`/`safeDest`, settings `persist()`, the `on<T>` helper in the preload, `readJson`/`readJsonOr`, and the double update check at startup.
- **Tooling:** CI uses `npm ci`. Fix or remove `scripts/make-icon.mjs` (its deps are missing). Add `tsx` as the itest runner.
- **Later (needs its own plan):** sign the manifest with ed25519, verify the JRE sha256, Windows code signing (AUDITORIA-SEGURIDAD.md).

## Verification

- `npm run typecheck` and `npm run build`. Run the existing itests (`scripts/*-itest.ts`).
- **Real premium login on Windows:**
  1. Device code, copy, authorize.
  2. Close and reopen the launcher: no login is asked (MC token reused).
  3. Edit `mcExpiresAt` to the past in `account.json`, reopen: silent refresh, rotated refresh token saved.
  4. Corrupt the refresh token: banner "sesión caducada", launch blocked, re-login works.
  5. No network: clear message, the session is not deleted.
- **Linux (VM or a PC without a keyring):** AppImage and deb. Login, restart, the session persists (fallback `0600`). Check the file permissions.
- Join an online-mode server with the premium account (a valid token, not `'0'`).
- UI: captures with `scripts/shot.cjs` in es/en/pt, reviewed by a subagent. Keyboard navigation through Login and Settings.
- Music: off by default; when turned on it sounds, pauses when the game opens, and the volume is remembered.

## Files

- **Plan copy:** `DbrLauncher/PLAN-premium-ui-auditoria.md`, with a dated log ("bitácora").
- **Pointer:** a line in `DbrLauncher/CLAUDE.md`.
- **Branch:** `feat/premium-live`. Commits in Spanish, with no AI attribution (skill `dbr-git`).

## Bitácora

- 2026-11-08: plan aprobado. Rama `feat/premium-live` creada desde `main` (`6946783`). Siguiente paso: Fase 1 (login premium).
- 2026-11-08: Fase 1 hecha. Proveedor `live` (client ID oficial, login.live.com) con `azure` de reserva; errores clasificados caducada/red; prefijo RPS t= con reintento d=; tokens de Minecraft guardados con caducidad; escritura atómica; respaldo 0600 en Linux sin llavero; renovación única en curso, al abrir (si quedan <12 h) y cada 6 h; nunca se lanza premium con token '0'; cancelar login. Endpoint de device code de live.com probado con curl (responde user_code, verification_uri, interval, expires_in). Falta: login real con una cuenta.
- 2026-11-08: Fase 2 parcial. Tarjeta del código con copia automática, botón Copiar, Abrir enlace, Cancelar y cuenta atrás; aviso "sesión caducada" en Home con "Volver a entrar". Falta: música opcional.
- 2026-11-08: Fase 4 prioridad alta hecha. Updater manda 'error' y libera la pantalla (salvo fallo de instalación .deb); un solo chequeo al arrancar. Empaquetado con lista blanca: app.asar 736 MB → 8,3 MB; idiomas es-419/pt-BR/pt-PT; sin config mac. Ventana con sandbox, CSP, will-navigate bloqueado, enlaces externos solo https a hosts conocidos, URL de desarrollo solo sin empaquetar. settings:set validado (tipos, rangos, flags JVM peligrosos fuera, también al lanzar) y escritura atómica. Instancia única; sync, Java y launch con una sola operación a la vez; modpackSyncPending respeta cambios de variante. Java sin LD_LIBRARY_PATH/LD_PRELOAD en AppImage; natives en %ProgramData% si la ruta no es ASCII; log del juego leído solo los últimos 64 KB. Hover del botón dorado arreglado. README: AppArmor y almacenamiento sin llavero. Siguiente: música opcional.
- 2026-11-08: Fase 2 completa. Música opcional: pista `launcher_menu` generada con Stable Audio Open (semilla 44, bucle de 40 s, -15 LUFS, ambiental con cuerdas), en `src/renderer/src/assets/musica.ogg` (502 KB). Interruptor y volumen en Ajustes (apagada por defecto), se calla al lanzar y minimizada; crédito "Powered by Stability AI". Mapeo de ajustes del store unificado. Prueba con la app compilada: preload en sandbox OK, CSP sin errores, el audio suena, settings:set descarta claves inválidas y flags JVM peligrosos. Falta: ACRCloud de la pista (dueño). Siguiente: Fase 3 (pulido de UI).
- 2026-11-08: Fase 3 hecha. Dos niveles de tipografía: Pixelify (solo peso 700) para títulos y Jugar, sans del sistema para el resto; mayúsculas solo en Jugar. Marca única "Dbr Launcher" en la barra de título. Componentes comunes en `components/ui.tsx`: `Btn`/`btnClass`, `Modal` (role=dialog, Escape, foco atrapado y devuelto), `Progress` (indeterminada animada de verdad, respeta prefers-reduced-motion), `PanelTitle`, `Toggle` (aria-pressed); reemplazan las copias en Home, Ajustes, Login, UpdateOverlay, modales y FuseBanner. Foco visible dorado en todo. Paleta Saga: naranja = acción, azul = seleccionado, oro = valores y progreso, un solo rojo `error`. Chip de mods con estado real (al día / comprobando / sin comprobar / fallo / apagada). Ajustes en pestañas Juego / Modpack / Sistema con flechas. De paso (fase 4): textos sin tr() (Premium, GB RAM, Versión), timers de copiar limpiados, `getVersion?.`, tokens y clases muertas fuera. Capturas con window.dbr simulado (22, es/en/pt) revisadas por subagente: sin P0/P1. Siguiente: resto de la Fase 4 (prioridad media y baja).
- 2026-11-08: Fase 4 completa (`8ed8dc1`). Renderer: listener de launch liberado si falla, logout limpia prewarm/sync, ping con catch, ajustes agrupados cada 300 ms (solo vale la última respuesta, flush antes de sync/launch), ancho/alto/JVM se guardan al salir del campo o con Enter, useSpeed en efecto. Main: renombrado solo de mayúsculas no borra en win32, `java:ensure(force)` para Reinstalar, try/catch en openSync/rmSync de http, `retries` para headSha (0) y forge (1), JRE a disco reanudable + inflate async + borrar archivo si no extrae, librerías en pool de 6 con `size`, assets fuera del hash-cache, timeouts DNS 2 s / java -version 15 s, fd de patch.ts, máscara 0o777, caché de 5 s en tr(). Muerto fuera: fase natives, estados idle/preparing, guards OWNER/REPO, re-exports, 13 exports internos, make-icon.mjs. Duplicados unidos en `main/util.ts` (pool, safeJoin), `on<T>` del preload, readJson, persist. CI con `npm ci`. Runner `npm run itest -- <test>` (esbuild + Electron; tsx no sirve porque http usa `net` de Electron). Typecheck, build y los 8 itests verdes (java-itest con descarga real). Pendiente fuera de esta fase: verificación manual (login premium real, Linux, capturas). Siguiente: verificación del plan y merge de `feat/premium-live`.
- 2026-11-08: verificación automática: e2e de Ajustes con el launcher compilado (`.tmp/ajustes-e2e.cjs`, userData temporal): ancho al salir del campo, vacío no manda 0, `-javaagent` saneado y reflejado, ráfaga de RAM gana el último. Captura revisada por subagente: valores bien, solo P2 (contraste del gris secundario, ya visto en Fase 3). Falta del dueño: login premium real (pasos 1-5 de Verificación), Linux sin llavero, servidor online-mode. Después: merge de `feat/premium-live` a `main`.
- 2026-11-08: pedido del dueño tras probar: pestañas Juego y Modpack fusionadas en «Modpack y juego» (modpack arriba, luego RAM, ventana y Java); música por defecto al 5 % (y su settings.json local puesto a 0,05); crédito a SrAjolote (github.com/SrAjolote) por las ideas aportadas al launcher. e2e de Ajustes e i18n-test verdes, capturas revisadas sin P0/P1. Siguiente: merge de `feat/premium-live` con el OK del dueño.
- 2026-11-08: merge a `main` (sobre `origin/main` 1.0.35, sin conflictos); typecheck, build e itests verdes. Rama `feat/premium-live` borrada (solo era local). Sin push. Plan cerrado salvo pruebas del dueño en Linux.
