# Modelo de seguridad — DbrLauncher-android

Hereda: `dbr-seguridad/references/modelo-amenazas.md` (INV-G1..G9).
Última revisión: 2026-11-05

## Qué hace y qué protege

Launcher Android de DBR (fork de ZalithLauncher2) con sincronización obligatoria del modpack.

## Entradas

| Entrada | Quién la dispara | Guarda | Archivo |
|---|---|---|---|
| `manifest.json` del modpack | GitHub raw / jsDelivr | HTTPS, URLs fijadas al commit | `game/dbr/DbrSync.kt` |
| Manifest del modpack | Mirror R2 (Worker `dbr-assets.dbrlauncher.workers.dev`) o GitHub raw | Firma ECDSA P-256 (clave pública en `DbrMirror`; si no verifica, se usa raw) | `game/dbr/DbrMirror.kt` |
| Archivos del modpack | Mirror R2 / release `assets-files` / GitHub raw | SHA-1 del manifest + `safeJoin` | `game/dbr/DbrSync.kt` |
| `version.json` + APK | GitHub raw / releases | SHA-256 + firma de Android | `game/dbr/DbrUpdater.kt` |
| Importar controles (activity-alias exportada) | otra app | heredado del upstream | `AndroidManifest.xml` |
| Canal móvil `HOLA` / `HOLA_ACK` (tipos 1 y 101) | DbrCore al conectar; el launcher responde | largo exacto 5, versión 1 (otra versión = canal apagado), 2 y 0.5/s. Antes de `HOLA` el launcher descarta todo | `game/support/canal_movil/{Protocolo,CanalMovil}.kt` |
| Canal móvil `AREA_TEXTO` (tipo 2, juego -> launcher) | DbrCore, campo de texto con foco | largo exacto 2 o 18, floats finitos recortados a 0..1 y a la ventana, 20/s. Solo posiciona el campo del teclado | `game/support/canal_movil/{Protocolo,CanalMovil}.kt` |
| Canal móvil `SUGERENCIAS` (tipo 3, juego -> launcher) | DbrCore, chat abierto | máx. 12 chips y 10 sugerencias, cada una de 1..32 bytes, UTF-8 estricto sin controles, sin bytes de sobra, 10/s. Es texto para mostrar en chips; nunca se ejecuta | `game/support/canal_movil/{Protocolo,CanalMovil}.kt` |
| Canal móvil `ESTADO` (tipo 4, juego -> launcher) | DbrCore, cambios de estado | largo exacto 5, bits desconocidos ignorados, 20/s. Solo muestra u oculta controles | `game/support/canal_movil/{Protocolo,CanalMovil}.kt`, `LayerController/.../EstadoDbr.kt` |
| Canal móvil `VIBRAR` (tipo 5, juego -> launcher) | DbrCore (golpe, caída, forma) | id ASCII `[a-z]{1,12}.[a-z0-9_]{1,19}` de máx. 32 bytes y categoría conocida; el patrón sale del catálogo JSON del modpack (`config/dbrcore/vibracion.json`, verificado por el SHA-1 del manifest firmado), y el código lo topa: segmento 250 ms, total 600 ms, 6 pulsos, 60 ms entre vibraciones y 6/s. El payload solo trae el id y la fuerza | `game/support/canal_movil/{Protocolo,Vibracion,VibradorDbr}.kt` |
| Canal móvil `ABRIR_URL` (tipo 9, juego -> launcher) | DbrCore, al confirmar un enlace del chat | `UrlSegura`: solo `http`/`https`, host real, sin usuario, sin espacios ni controles, máx. 2048 caracteres; el host se muestra en punycode y el usuario confirma en un diálogo. 1 y 0.5/s. `ZLNativeInvoker.openLink` ya no acepta `file:` ni otro esquema | `game/support/canal_movil/{UrlSegura,CanalMovil}.kt`, `bridge/ZLNativeInvoker.kt` |
| Canal móvil `INSERTAR` (tipo 102, launcher -> juego) | toque en un chip o frase del launcher | el launcher exige conexión y chat abierto, 1..100 caracteres sin controles ni surrogates, 5/s. El juego solo lo escribe en el campo; nunca lo envía como chat | DbrCore `core/movil/ChipsMovil.java` |
| Canal móvil `REDUCIR` (tipo 103) y `PANTALLA` (tipo 104), launcher -> juego | aviso de calor del sistema; tamaño de la ventana | el launcher solo los arma con valores propios: 1 byte 0/1, y márgenes 0..0.25 y tamaño 20..400 mm. El juego revisa largo y rangos | DbrCore `core/movil/{ModoReducido,Pantalla}.java` |
| Canal móvil `MANDO_ESTADO` y `MANDO_INFO` (tipos 106 y 107, launcher -> juego) | mando conectado al teléfono | solo con `CAP_MANDO`; largo exacto 9 (estado) y 3..67 (info, modelo recortado a 64 bytes); mínimo 8 ms entre estados. El juego lo toma como entrada de mando, nunca como comando ni texto | DbrCore `core/mando/BackendCanal.java`, `game/support/canal_movil/MandoDbr.kt` |
| Canal móvil `NOTIFICAR` (tipo 6, juego -> launcher) | DbrCore, que reenvía `DBRNOTIF` del servidor | largo exacto, id con regex + catálogo cerrado, nombre `[A-Za-z0-9_]{0,16}`, 4 de capacidad y 1/s | `game/support/canal_movil/{Protocolo,NotificadorDbr}.kt` |
| Canal móvil `TEXTO_ESTADO` (tipo 7, juego -> launcher) | DbrCore, texto del chat abierto | largo exacto (u16 bytes <= 400, <= 100 caracteres UTF-16), UTF-8 estricto, sin controles, surrogates ni `§`, índices dentro del texto e inicio <= fin, chat cerrado = texto vacío, 25/s. Solo escribe el estado del teclado; nunca envía el chat | `game/support/canal_movil/{Protocolo,TextoSincronizado}.kt` |
| Canal móvil `TEXTO_EDITAR` (tipo 105, launcher -> juego) | teclado del teléfono | lado juego: mismas reglas + `ChatAllowedCharacters`, solo con `CAP_TEXTO` y el chat abierto; Enter sigue siendo una tecla | DbrCore `core/movil/TextoMovil.java` |

## Invariantes propios

- **INV-1** — Nada que diga el manifiesto escribe o borra fuera de la carpeta del juego.
- **INV-2** — Un archivo bajado solo se usa si su SHA-1 coincide con el del manifiesto.
- **INV-3** — El APK publicado va firmado con la clave de DBR.
- **INV-4** — Una notificación del juego nunca muestra texto que venga del canal salvo un nombre de
  jugador validado; el resto sale de los strings del launcher. En la pantalla de bloqueo va la
  versión sin nombre (`VISIBILITY_PRIVATE` + `publicVersion`). Tocarla abre la app con el intent
  del ícono, nunca un intent armado con datos del canal.
- **INV-5** — El canal móvil no interpreta ningún payload como ruta, intent, comando ni código. Solo
  acepta una lista cerrada de tipos (ids en `Protocolo.kt`, cada uno con límite de ritmo propio); un
  tipo desconocido, una versión de protocolo distinta, un largo que no calza o un campo fuera de rango se
  descarta, y una versión distinta deja el canal apagado. Todo lo que el payload elige sale de un
  catálogo cerrado o de los strings del launcher. El único enlace posible pasa por `UrlSegura` y
  confirmación del usuario. Detalle: [docs/canal-movil.md](docs/canal-movil.md).

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
