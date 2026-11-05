# Auditoría de seguridad — DbrLauncher (escritorio)

Fecha: 2026-11-05 · Commit: `2d8bc5f` (`origin/main`; **el PC está 2 commits atrás** en `24150fe` y
tiene `build/icon.ico` y `build/icon.png` borrados sin commitear: auditado lo de GitHub) · Alcance:
proceso principal de Electron (ventana, IPC, sync del modpack, parches, updater, Java, FUSE, login),
`preload`. **No** incluye el launcher de Android (`android/ZalithLauncher2`, worktree `DbrLauncher-android`).
Herramientas: revisión manual (skill `dbr-seguridad`, `references/launcher.md`)

## Resumen

El launcher hace bien lo que más importa en el PC del jugador: cada archivo del modpack se verifica por
sha1 del manifiesto, las rutas del manifiesto y de los zip no pueden salir de su carpeta, los parches
delta se comprueban contra el sha1 final, el refresh token premium va cifrado con `safeStorage`, y la
superficie IPC es chica. **El riesgo de fondo es de cadena de suministro**: el manifiesto (con los
hashes) y las actualizaciones del propio launcher salen de la cuenta de GitHub `jmpz2026` sin firma
propia, y la actualización se instala sola. Quien controle esa cuenta controla el PC de cada jugador.

| Severidad | Cantidad |
|---|---|
| Crítica | 0 |
| Alta | 0 |
| Media | 1 |
| Baja | 3 |

## Hallazgos

### [MEDIA] Manifiesto y actualizaciones sin firma propia, con instalación forzada (CWE-494, OWASP A08:2025)
Dónde:      `src/main/sync/manifest.ts` (manifiesto por HTTPS desde `raw.githubusercontent.com`, hashes
            dentro del mismo archivo); `src/main/updater/index.ts` (`autoDownload`, `quitAndInstall` a los
            2,5 s); `electron-builder.yml` (`publish: github`, sin firma de código en `win:`)
Camino:     alguien obtiene acceso de escritura a `jmpz2026/DbrLauncher` (token filtrado, sesión robada, un
            colaborador) → publica un manifiesto con un jar suyo y su sha1, o un release del launcher
Impacto:    ejecución de código en el PC de todos los jugadores en su próxima apertura (INV-G8). Hoy la
            única barrera es la seguridad de la cuenta de GitHub.
Arreglo:    (1) 2FA obligatoria en la cuenta y tokens de despliegue de alcance mínimo (ya en
            `dbr-seguridad/references/launcher.md`); (2) firmar el manifiesto con una clave ed25519 que no
            vive en GitHub y verificar la firma en `fetchManifest` con la clave pública embebida;
            (3) firma de código en Windows y `verifyUpdateCodeSignature` / `publisherName` para el updater.
Confianza:  Confirmado (diseño; no es un bug puntual)

### [BAJA] `shell.openExternal` sin lista de esquemas
Dónde:      `src/main/index.ts:43-45` (`setWindowOpenHandler`), `src/main/auth/index.ts:30`
Impacto:    hoy el renderer solo carga archivos locales y enlaces fijos; si algún día muestra contenido
            remoto (noticias, markdown del servidor), un enlace `file:` o de otro esquema lo abre el sistema.
Arreglo:    abrir solo `https:` (y `http:` si hace falta) y denegar el resto.

### [BAJA] `sandbox: false` en la ventana
Dónde:      `src/main/index.ts:33`
Impacto:    con `contextIsolation: true` y `nodeIntegration: false` el riesgo es bajo; el preload solo usa
            `contextBridge` e `ipcRenderer`, que funcionan con sandbox.
Arreglo:    `sandbox: true` y comprobar que el preload arranca.

### [BAJA] El JRE de Adoptium se instala sin comprobar su checksum
Dónde:      `src/main/java/install.ts:18` (`adoptiumUrl`)
Impacto:    solo protege TLS; la API de Adoptium publica el sha256 de cada binario.
Arreglo:    pedir el checksum (`/v3/assets/...`) y verificarlo antes de descomprimir.

## Variantes revisadas

- Rutas: `safeJoin` en el manifiesto (`sync/engine.ts:57`) y guarda equivalente en `java/zip.ts:30-32`.
- Parches `.dbrpatch`: sha1 del resultado verificado; si no coincide se borra la salida (`sync/patch.ts`).
- FUSE: el comando que corre con `pkexec` sale de una tabla fija por distro, nada del renderer.
- IPC: ningún canal recibe una ruta, una URL ni un comando del renderer (los ajustes de JVM son del propio
  jugador).

## Lo que está bien

- sha1 por archivo, mirror por sha1 y manifiesto fijado al commit (no cachea viejo).
- Refresh token premium con `safeStorage`; si no hay cifrado disponible no se guarda en claro.
- `contextIsolation: true`, `nodeIntegration: false`, ventanas nuevas denegadas.

## Pendiente de verificar

- Los íconos borrados en el PC (`build/icon.*`): si fue a propósito, commitearlo; si no, `git checkout`.
- 2FA de la cuenta `jmpz2026` y quién tiene escritura en `DbrLauncher`.
- Launcher de Android (`android/ZalithLauncher2`): auditoría aparte.
