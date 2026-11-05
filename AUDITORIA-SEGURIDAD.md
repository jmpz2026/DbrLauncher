# Auditoría de seguridad — DbrLauncher-android

Fecha: 2026-11-05 · Commit: `71533d5` (rama `android-zalith`. El worktree del PC está en `c7619b9`, **2 commits por detrás** de GitHub, y tiene cambios sin commitear en `PLAN-descargas-robustas.md` y `android/version.json` (este último también cambió en GitHub: al hacer `pull` va a chocar). Se auditó `origin/android-zalith` y en el PC solo se añadieron estos dos archivos. Además el worktree está marcado como `prunable` porque su ruta se guardó con formato de Windows) · Alcance: el código propio de DBR sobre ZalithLauncher2 (`game/dbr/`, 1,4 k líneas: sincronización del modpack, auto-actualización del APK, informe de errores), el manifiesto de Android, la configuración de red y la firma del APK en CI. El código de ZalithLauncher2 se tomó como upstream y no se revisó línea a línea.
Herramientas: revisión manual (skill `dbr-seguridad`)

## Resumen

Sin hallazgos de severidad. La sincronización usa `safeJoin` con `canonicalFile` (no se escribe fuera de la carpeta del juego), verifica el SHA-1 de cada archivo y fija las URLs al commit. El APK se verifica con SHA-256 y Android exige la misma firma para actualizar. Lo que queda es de cadena de suministro: el manifiesto no va firmado y uno de sus espejos es un CDN de terceros.

| Severidad | Cantidad |
|---|---|
| Crítica | 0 |
| Alta | 0 |
| Media | 0 |
| Baja | 3 |

## Hallazgos

### [BAJA] El manifiesto del modpack no va firmado y uno de sus espejos es jsDelivr
Dónde:      `game/dbr/DbrSync.kt:340` (`fetchManifest` → `readFirst(pin(url), jsDelivr(pin(url)))`)
Camino:     si GitHub raw falla, el manifiesto se lee de `cdn.jsdelivr.net`; el manifiesto dice qué jars bajar y con qué SHA-1
Impacto:    quien controle la cuenta de GitHub o el CDN reparte código a todos los móviles. Es el mismo modelo de confianza que el launcher de PC.
Arreglo:    firmar el manifiesto (Ed25519) y llevar la clave pública dentro del APK; con eso el espejo deja de importar.
Confianza:  Confirmado (diseño)

### [BAJA] Una build release sin la clave del CI se firma con la clave pública de ZalithLauncher
Dónde:      `ZalithLauncher/build.gradle.kts:50` (cae a `zalith_launcher_debug.jks`, cuya contraseña está en `gradle.properties` del upstream)
Camino:     compilar `assembleRelease` sin `DBR_KEYSTORE_PATH` y publicar ese APK
Impacto:    hoy el CI no puede caer ahí (con el secreto vacío el keystore queda vacío y la build falla), pero un APK release firmado así se podría reemplazar por otro firmado por cualquiera.
Arreglo:    que la tarea release falle si falta `DBR_KEYSTORE_PATH`, en vez de usar la clave debug.
Confianza:  Confirmado

### [BAJA] Tráfico HTTP sin cifrar permitido en toda la app
Dónde:      `AndroidManifest.xml:41` (`usesCleartextTraffic`) y `res/xml/network_security_config.xml` (`cleartextTrafficPermitted="true"`)
Camino:     heredado del upstream; todas las URLs propias de DBR son `https://`
Impacto:    ninguno hoy; un manifiesto con una URL `http://` se bajaría sin TLS (el SHA-1 la protegería igual).
Arreglo:    `cleartextTrafficPermitted="false"` salvo los dominios que el upstream necesite.
Confianza:  Confirmado

## Variantes revisadas

- `safeJoin(base, rel)` con `canonicalFile` en todas las escrituras y borrados de la sincronización.
- Descargas a `.part` y verificación de SHA-1 antes de mover; el parche binario (`DbrPatch`) verifica el SHA-1 del resultado.
- APK: SHA-256 desde `version.json` y `ACTION_INSTALL_PACKAGE` (solo el instalador del sistema).
- `FileProvider` no exportado.

## Lo que está bien

- El informe de errores es un zip local que comparte el jugador: no se sube a ningún sitio ni lleva credenciales.
- La clave de firma real vive en los secretos del CI, no en el repo.

## Pendiente de verificar

- Comprobar que el certificado del APK publicado es el de DBR y no el debug (`apksigner verify --print-certs`).
- El código de ZalithLauncher2 (cuentas de Microsoft, servidores de autenticación, importadores) no se revisó: está oculto o desactivado en DBR.
