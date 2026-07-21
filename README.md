# Dbr Launcher

Launcher de la comunidad **Dbr** para Minecraft **Forge 1.7.10** (Java 8).

- Mods, configs y texture pack siempre al día (sincronización por manifest + SHA1, borra mods obsoletos).
- Login **Pirata** (offline) o **Premium** (Microsoft OAuth).
- JRE 8 auto-descargado por SO/arquitectura (Temurin/Adoptium).
- Descarga vanilla (Mojang) + Forge y lanza el juego.
- Estado del servidor en vivo (ping), noticias, ajustes (RAM/resolución/JVM).
- Multiplataforma: Windows, macOS, Linux. Auto-update por GitHub Releases.
- UI estilo **Minecraft pixel** (fuente Pixelify Sans, paneles de piedra, acento oro).

## Stack

Electron + React + TypeScript · Vite · Tailwind · Zustand.
Empaquetado con electron-builder · auto-update con electron-updater.

## Desarrollo

```bash
npm install
npm run dev        # arranca el launcher en modo desarrollo
npm run typecheck  # comprueba tipos (main + renderer)
npm run build      # compila (out/)
```

## Arquitectura

Toda la lógica sensible vive en el **proceso main** y se expone al renderer por IPC
(`window.dbr.*`, definido en `src/preload/index.ts`). Módulos en `src/main/`:

| Módulo | Qué hace |
|--------|----------|
| `auth/` | Login pirata (UUID offline) y premium (Microsoft device-code → Xbox → Minecraft). Token cifrado con `safeStorage`. |
| `sync/` | Descarga mods/configs desde `manifest.json`, verifica SHA1, borra obsoletos (`managed.json`). Núcleo puro en `engine.ts`. |
| `java/` | Descarga y verifica el JRE 8 (Adoptium). Cachea en `userData/runtime/`. |
| `launch/` | Resuelve versión (vanilla Mojang + overlay Forge), descarga libs/natives/assets, arma el comando y lanza. |
| `status/` | Server List Ping 1.7+ (con SRV). |
| `settings/` | Persiste `userData/settings.json` (RAM, resolución, JVM args). |
| `news/` | Descarga `news.json`. |
| `updater/` | Auto-update con electron-updater (solo app instalada). |

## Configuración (rellenar antes de producción)

### 1. `src/shared/config.ts`

```ts
serverHost / serverPort   // IP:puerto real del servidor (para el ping)
forge                     // versión de Forge (ej. 10.13.4.1614)
manifestUrl               // URL del manifest.json del modpack
newsUrl                   // URL del news.json
forgeJsonUrl              // URL del JSON de versión de Forge (overlay)
auth.azureClientId        // Client ID de Azure (solo login premium)
```

### 2. `electron-builder.yml`

```yaml
publish:
  provider: github
  owner: TU_USUARIO   # rellenar
  repo: TU_REPO       # rellenar
```

## Checklist de despliegue

1. **Login premium (opcional):** registrar una app en Azure Portal (Entra ID) →
   *App registrations* → tipo **Personal Microsoft accounts** → activar
   *Allow public client flows*. Pegar el **Application (client) ID** en
   `config.ts` → `auth.azureClientId`. (Pirata funciona sin esto.)

2. **Modpack:** generar el manifest y alojar los archivos.

   ```bash
   npm run manifest -- --dir ./modpack --base https://raw.githubusercontent.com/USER/REPO/main/ \
        --version 1.0.0 --forge 10.13.4.1614 --include mods,config
   ```

   > **Hosting:** los assets de GitHub Releases son planos (no admiten subcarpetas
   > `mods/x.jar`). Usa `raw.githubusercontent.com` (rutas preservadas) o un host/CDN
   > estático como `--base`. El `manifest.json` sí puede ir como asset de release.

3. **Forge:** ejecutar el **instalador de Forge 1.7.10** (client), copiar
   `.minecraft/versions/1.7.10-Forge…/1.7.10-Forge….json`, subirlo y apuntar
   `forgeJsonUrl` a él. (Sin `forgeJsonUrl` el launcher arranca **vanilla**.)

4. **Noticias:** subir un `news.json`:

   ```json
   { "items": [
     { "title": "Apertura", "date": "2026-07-21", "tag": "Evento",
       "body": "Texto…", "url": "https://…" }
   ] }
   ```

5. **Iconos:** añadir `build/icon.ico` (Windows), `build/icon.icns` (macOS),
   `build/icon.png` (Linux).

6. **Empaquetar y publicar:**

   ```bash
   export GITHUB_TOKEN=xxxx
   npm run build:win  -- --publish always   # genera instalador + latest.yml
   npm run build:mac
   npm run build:linux
   ```

   El auto-update solo funciona en la app **instalada** (no en `npm run dev`).

## Tests

Scripts de verificación (Node + esbuild, sin abrir la app):

```bash
# núcleo de sync, java (descarga real), launch (comando), ping (real), manifest (e2e)
node -e "require('esbuild').build({entryPoints:['scripts/<test>.ts'],bundle:true,\
  platform:'node',format:'esm',external:['electron'],outfile:'.tmp/t.mjs'})" && node .tmp/t.mjs
```

`scripts/`: `sync-itest.ts`, `java-itest.ts`, `launch-itest.ts`, `status-itest.ts`,
`manifest-itest.ts`, `gen-manifest.mjs` (generador), `shot.cjs` (screenshot offscreen).

## Roadmap

1. ✅ Scaffold + UI (estilo Minecraft pixel)
2. ✅ Auth: Pirata + Microsoft + store cifrado
3. ✅ Motor de sync (manifest, descarga, SHA1, prune, progreso)
4. ✅ JRE 8 auto-download por SO/arch
5. ✅ Forge/vanilla launch *(código completo; falta probar in-game con el modpack real)*
6. ✅ Ajustes + estado del servidor + noticias
7. ✅ Empaquetado + auto-update *(código listo; falta ejecutar el empaquetado/publicación)*
8. ✅ Tooling del modpack (generador de manifest)
