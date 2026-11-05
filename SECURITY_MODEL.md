# Modelo de seguridad — DbrLauncher

Hereda: `dbr-seguridad/references/modelo-amenazas.md` (INV-G1..G9).
Última revisión: 2026-11-05

## Qué hace y qué protege

Launcher de escritorio (Electron) que sincroniza el modpack desde un manifiesto, instala Java 8,
lanza Minecraft/Forge, inicia sesión (pirata o Microsoft) y se actualiza solo. Activo principal: **el PC
de cada jugador** — todo lo que baja se ejecuta ahí.

## Entradas

| Entrada | Quién la controla | Guarda | Archivo |
|---|---|---|---|
| Manifiesto del modpack | la cuenta `jmpz2026` (rama `assets`) | HTTPS, fijado al commit, sha1 por archivo, `safeJoin` | `src/main/sync/manifest.ts`, `engine.ts` |
| Releases del launcher | la cuenta `jmpz2026` | electron-updater (sha512 de `latest.yml`) | `src/main/updater/index.ts` |
| Parches `.dbrpatch` | release `assets-files` | sha1 del resultado | `src/main/sync/patch.ts` |
| JRE | Adoptium | HTTPS | `src/main/java/` |
| IPC del renderer | la propia UI | canales fijos, sin rutas/URLs/comandos | `src/preload/index.ts` |

## Invariantes propios

- **INV-1** — Ningún archivo del manifiesto se escribe fuera de la carpeta del juego (`safeJoin`).
- **INV-2** — Un archivo del modpack se da por bueno solo si su sha1 coincide con el del manifiesto.
- **INV-3** — El refresh token de Microsoft se guarda solo cifrado con `safeStorage`.
- **INV-4** — El renderer no puede pedir al proceso principal una ruta, una URL ni un comando.

## Datos y secretos

- `userData/`: cuenta (nombre, UUID, token cifrado), ajustes, `managed.json`, juego.
- Secretos: refresh token premium (cifrado). El client ID de Azure no es secreto.

## Dependencias de seguridad

- **La cuenta de GitHub `jmpz2026`** (manifiesto, assets y releases).
- TLS de GitHub y Adoptium.

## Hallazgos que importan acá

| Clase | Severidad base |
|---|---|
| Ejecutar código en el PC del jugador | Crítica |
| Escribir fuera de la carpeta del juego | Alta |
| Filtrar el token de la cuenta | Alta |

## Fuera de alcance

- El contenido de los mods (va en su auditoría); el launcher de Android (aparte).

## Riesgos aceptados

| Fecha | Riesgo | Por qué se acepta | Revisar |
|---|---|---|---|
