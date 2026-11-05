# Modelo de seguridad — DbrLauncher-android

Hereda: `dbr-seguridad/references/modelo-amenazas.md` (INV-G1..G9).
Última revisión: 2026-11-05

## Qué hace y qué protege

Launcher Android de DBR (fork de ZalithLauncher2) con sincronización obligatoria del modpack.

## Entradas

| Entrada | Quién la dispara | Guarda | Archivo |
|---|---|---|---|
| `manifest.json` del modpack | GitHub raw / jsDelivr | HTTPS, URLs fijadas al commit | `game/dbr/DbrSync.kt` |
| Archivos del modpack | GitHub raw / release `assets-files` | SHA-1 + `safeJoin` | `game/dbr/DbrSync.kt` |
| `version.json` + APK | GitHub raw / releases | SHA-256 + firma de Android | `game/dbr/DbrUpdater.kt` |
| Importar controles (activity-alias exportada) | otra app | heredado del upstream | `AndroidManifest.xml` |

## Invariantes propios

- **INV-1** — Nada que diga el manifiesto escribe o borra fuera de la carpeta del juego.
- **INV-2** — Un archivo bajado solo se usa si su SHA-1 coincide con el del manifiesto.
- **INV-3** — El APK publicado va firmado con la clave de DBR.

## Datos y secretos

- Cuenta offline (sin contraseña), logs del juego y del launcher.
- Secretos: keystore de release solo en los secretos del CI.

## Dependencias de seguridad

- ZalithLauncher2 (GPL-3, vendorizado), LWJGL, LTW (LGPL-3), Gson.

## Hallazgos que importan acá

| Clase | Severidad base |
|---|---|
| Código ajeno en el móvil | Alta |
| Archivos fuera de la carpeta del juego | Alta |
| Actualización falsa del APK | Alta |

## Fuera de alcance

- Balance del juego.

## Riesgos aceptados

| Fecha | Riesgo | Por qué se acepta | Revisar |
|---|---|---|---|
| — | — | — | — |
