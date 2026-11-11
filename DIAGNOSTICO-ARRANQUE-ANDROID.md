# Diagnóstico: arranque lento y rendimiento de Minecraft en DbrLauncherMobile (Android)

Fecha: 2026-11-11. Rama `android-zalith`. Solo Android. No se cambió código del repo; el único cambio temporal se
explica en «Cómo se midió».

**Resumen.** Un arranque normal (modpack ya sincronizado) tarda **unos 2 minutos** del toque en Jugar al menú en un
Snapdragon 680. **El 90 % es la fase 2** (JVM y Forge: 101 a 109 s). **La fase 1** (launcher) tarda **11 a 15 s**.
Dentro de la fase 2:
- El bloque más grande va de que FML identifica los mods hasta que empieza el preinit de DbrMod (**41-42 s**).
- Le siguen preinit → init (**23-24 s**) y el arranque de LaunchWrapper con coremods (**11-12 s**).
- Durante toda la carga el **compilador C2 de la JVM usa ~1,7 núcleos** y el hilo principal del juego ~0,7.
- La pantalla de carga del launcher (WebView con skin 3D) consume ~0,5 núcleos más.

La sospecha del usuario se confirma: la mayor parte está en la fase 2.

**Tiempos por mod** (arranques 4 y 5):
- El código de los mods suma **53-55 s**. Los que más tardan son CustomNPC+ (9 s), DBC (8-9 s), los ~38 mods de DbrServerPack juntos (13-14 s), JRMCore (6-7 s) y JBRA (4,5-5 s, por los mixins tardíos de `dbrvfx`).
- Aparte, **FML relee el jar de DbrServerPack 40 veces buscando idiomas: ~9 s**, que se pueden quitar con un mixin pequeño (A0).
- **A0 hecho y medido** (arranque 6, 2026-11-11, módulo `lang_scan_once` de DbrOptimizer en experimental):
  - DbrServerPack se escanea 1 vez en vez de 40.
  - Hueco entre `identified 66 mods` y la construcción: de 11,5 s (arranque 5) a 2,1 s. Ahorro: **~9,4 s**.
  - El total del arranque 6 (124 s del toque al menú) no baja en la misma medida: preinit e init salieron 2-4 s más lentos que en el arranque 5. Es la variación normal entre arranques (ver §1). Hacen falta varios arranques para ver el total.

---

## 1. Dispositivo, variante y línea de tiempo

### Cómo se midió
- **Dispositivo:**
  - Honor TFY-LX3, SoC `bengal` (Snapdragon 680: 4×A73 + 4×A53, Adreno 610), 5,6 GB de RAM, Android 13, arm64.
  - Conectado por adb Wi-Fi.
- **App:** `online.dragonblock.launchermobile.debug` 2.4.10-debug, compilado de `android-zalith` (HEAD `9e7a23d`).
- **Para poder medir:**
  - El APK de debug mostraba un aviso de actualización obligatoria a android-v30 que no se podía cerrar.
  - A petición del usuario, `DbrUpdater.check()` se cambió **temporalmente** para que en builds debug el aviso no fuera obligatorio. Con ese cambio se compiló e instaló el APK debug.
  - El cambio **ya está revertido en el código**; el APK instalado en el móvil todavía lo lleva.
- **Configuración medida:**
  - **Variante experimental** (la que estaba instalada), renderizador **GL4ES**, `-Xms1536M -Xmx1536M`.
  - G1 con `G1HeapRegionSize=8M`, resolución al 50 %.
  - Cuenta offline. Modpack ya sincronizado.
- **Modpack:** 16 jars (113,6 MB), 66 mods FML. full, lite y experimental llevan **los mismos jars**; solo cambian configs (ver §5).
- **Procedimiento:**
  - Script en `%TEMP%\dbrdiag-runs\run.sh`: `am force-stop`, `logcat -c`, `am start`, cerrar el aviso y `input tap` en JUGAR.
  - Hora del toque con `date +%s.%N` en el móvil.
  - `top -b -H` cada ~3 s mientras carga.
  - Al llegar al menú: `dumpsys meminfo`, `thermalservice` y copia de los logs.
  - Logs usados:
    - Launcher: `files/logs/log_*.log`, con ms. Uno del proceso principal y otro de `:game`.
    - `latest_game.log`: stdout del juego, con las marcas `[DBR-LAUNCH]`.
    - `latest.log` de log4j, con la hora al segundo.
- **Arranques válidos: 2 y 3.**
  - El arranque 1 se cortó antes del menú por un fallo del script; se usa solo para la fase 1.
  - Sirven de contraste el arranque de las 02:01 (antes de esta sesión) y 7 sesiones más de hoy en `logs/*.log.gz`.
- **Limitación:** este Honor solo vuelca a logcat los mensajes de nivel error, así que logcat no sirvió para el launcher. Los tiempos de la fase 1 salen de los logs propios del launcher.

### Línea de tiempo de un arranque normal (en caliente)

**Fase 1: del toque a la JVM** (logs del launcher, precisión de ms; la JVM al segundo)

| Paso | Arranque 1 | Arranque 2 | Arranque 3 |
|---|---|---|---|
| Toque en JUGAR | 02:32:31.4 | 02:33:23.9 | 02:36:01.7 |
| `DbrSync.sync` + `MinecraftDownloader` VERIFY_AND_REPAIR (termina con los avisos de `AllModReader`) | **7,3 s** | **4,7 s** | **6,3 s** |
| `checkEnableTouchProxy` + `runGame` + nace el proceso `:game` | 1,8 s | 1,9 s | 1,9 s |
| `:game`: init de la app, `Renderers`, `PluginLoader`, espera de la superficie, `MCOptions`, parseo → `LaunchArgs` | 2,4 s | 2,2 s | 2,5 s |
| `LaunchArgs` → primera línea de LaunchWrapper (dlopen del runtime, `JLI_Launch`, arranque de la JVM) | ~3 s | ~2,3 s | ~1,6 s |
| **Total fase 1** | **~14,6 s** | **~11 s** | **~12,3 s** |

**Fase 2: de la JVM al menú** (`latest_game.log`; segundos)

| Etapa | Arranque 2 | Arranque 3 | 02:01 (tras actualizar DbrServerPack) |
|---|---|---|---|
| JVM → `Launching wrapped minecraft` (tweakers, coremods, 527 binary patches, mixins tempranos) | 11 | 12 | 15 |
| → `LWJGL Version` (Main de Minecraft, ventana) | 6 | 7 | 8 |
| → `Forge Mod Loader has identified 66 mods` (descubrimiento, JarDiscovererCache) | 7 | 4 | 10 |
| → `[DBR-LAUNCH] stage=preinit` (mixins tardíos, construcción de mods, 1.ª recarga de recursos, preinit de los mods anteriores a DbrMod) | **42** | **41** | **64** |
| → `stage=init` (resto del preinit + init de mods) | **23** | **24** | 32 |
| → `stage=postinit` → `complete` | 4 | 7 | 6 |
| → `stage=menu` (recarga final de recursos, atlas, sonido) | 8 | 14 | 13 |
| **Total fase 2** | **101 s** | **109 s** | **148 s** |
| **Toque → menú** | **~113 s** | **~121 s** | — |

**Contraste:**
- 7 sesiones de hoy (`logs/2026-11-11-*.log.gz`): de 94 a 142 s de LaunchWrapper al atlas final.
- Informes de jugadores en Descargas:
  - El mismo Honor con LITE (11-07): 105 s.
  - Xiaomi 24117RN76L: 119 s.
  - Xiaomi 2510EPC8BG (FULL): **41-46 s**.
- El hardware pesa más que la variante.

### Tiempos por mod (arranques 4 y 5)

**Método.** FML 1.7.10 ya registra `Sending event %s to mod %s` y `Sent event %s to mod %s` (`LoadController`) a nivel TRACE, pero la config de log4j del juego lo descarta (`Root level="info"`).
- Para dos arranques se cambió **temporalmente** `versions/DBR/log4j2.xml` en el móvil:
  - Hora con ms.
  - Esas líneas activas, solo hacia `latest.log`, no hacia stdout.
  - Copia de seguridad hecha y config **ya restaurada**.
- No hizo falta tocar código.
- Los dos arranques duraron lo mismo que los anteriores, así que el registro extra no deforma la medición:
  - Arranque 4: 124 s del toque al menú (fase 2: 107 s).
  - Arranque 5: 117 s (fase 2: 103 s).
- Script de análisis: `%TEMP%\dbrdiag-runs\pormod.py`.

**Por evento de FML** (los 66 mods en serie, en el hilo principal):

| Evento | Arranque 4 | Arranque 5 |
|---|---|---|
| Construction | 12,0 s | 12,9 s |
| PreInitialization | 19,9 s | 18,7 s |
| Initialization | 18,6 s | 17,9 s |
| PostInitialization | 3,6 s | 2,2 s |
| LoadComplete + IMC | 1,3 s | 0,8 s |
| **Total en código de mods** | **55 s** | **53 s** |

Los otros ~50 s de la fase 2 son:
- LaunchWrapper y coremods: 11-12 s.
- Ventana de LWJGL: 6-7 s.
- Descubrimiento: 5-6 s.
- **Escaneo de idiomas: ~9 s** (ver abajo).
- Recargas de recursos y atlas: ~12 s.
- Sonido: 2,6 s.

**Por mod** (suma de todos los eventos; arranque 4 / arranque 5):

| Mod | Total | Dónde se va |
|---|---|---|
| `customnpcs` (CustomNPC+) | 9,4 / 9,0 s | PreInit 7,9 / 7,6 s. Dentro, 2,6 s hasta su `CustomNpcResourceListener` y 3,6 s hasta registrar entidades |
| `jinryuudragonblockc` (DBC) | 8,0 / 8,7 s | Init 6,9 / 7,2 s. Incluye mixins tardíos `dbrfood` y `dbrtierra` sobre sus clases |
| Los 37 mods `dbr*` de DbrServerPack + `armourersWorkshop` (en el mismo jar) | 14,0 / ~13 s | Repartido: ninguno pasa de 2 s (AW 3,4-3,5 s, `dbroptimizer` 1,7-2,7 s, `dbrvfx` 1,2-1,3 s) |
| `jinryuujrmcore` | 6,8 / 6,4 s | Construction, PreInit e Init, 1,4-2,7 s cada uno |
| `jinryuubetterrenderaddon` (JBRA) | 4,5 / 5,1 s | Todo en Construction: 4 s de silencio tras `Mixing MixinRenderPlayerJBRA from mixins.dbrvfx.late.json`. Es la aplicación de los mixins tardíos al cargar las clases de JBRA, no código de JBRA |
| `etfuturum` | 4,3 / 3,6 s | PreInit, Init y LoadComplete |
| `FML` | 2,2 / 2,2 s | Construction |
| `ninjinentities` | 2,1 / 1,8 s | PreInit |
| `npcdbc` | 1,8 / 1,6 s | Init |

**El hueco silencioso de después de `identified 66 mods` (~9-10 s) es FML releyendo el jar de DbrServerPack 40 veces.** [M] + [C]
- Las líneas con ms muestran 40 `Found translations in DbrServerPack-5.8.0.jar [...]` seguidas, de 02:48:14.7 a 02:48:23.6. Cada una tarda **232 ms de media: 9,3 s** en el arranque 4 y **9,1 s** en el arranque 5.
- Otros jars aparecen una sola vez, entre 3 y 190 ms.
- Causa, confirmada con el bytecode de forge-1.7.10-10.13.4.1614:
  - `FMLClientHandler.addModAsResource` llama a `LanguageRegistry.loadLanguagesFor(container, CLIENT)` **una vez por contenedor de mod**.
  - Cada llamada hace `searchZipForLanguages` sobre el jar de origen del contenedor.
  - Ese método recorre **todas** las entradas del zip y carga **todos** los `.lang` que encuentra, sin filtrar por modid.
- DbrServerPack-5.8.0.jar tiene 7207 entradas y **354 archivos `.lang` (3,2 MB)**, y aloja ~40 contenedores. Resultado: 40 lecturas completas del jar y ~130 MB de texto parseado, siempre el mismo.
- Las pasadas 2 a 40 inyectan exactamente lo mismo que la primera, así que **son trabajo repetido sin efecto**.

**Huecos que se repiten en el log** (arranque 3; los de 02:01 son iguales):
- 10 s de silencio entre `identified 66 mods` e `Instantiating all ILateMixinLoader`. En el arranque de 02:01 fueron 16 s.
- 3-4 s alrededor de los mixins tardíos de DbrServerPack sobre clases de JRMCore/DBC.
- 3-4 s antes de cada `Reloading ResourceManager`.
- 6 s de la recarga final de recursos al atlas.

**CPU durante la carga** (`top -H`, 22-23 muestras por arranque, suma de %CPU de un hilo / muestras):

| Hilo de `:game` | Arranque 2 | Arranque 3 |
|---|---|---|
| `C2 CompilerThread*` (JIT C2 de HotSpot) | ~170 % | ~141 % |
| `JNISurfaceTextu…` (hilo principal de Minecraft) | ~72 % | ~64 % |
| Hilo principal de Android de `:game` (Compose de la pantalla de carga) | ~46 % | ~49 % |
| `DefaultDispatch` + `RenderThread` + proceso sandbox del WebView | ~25 % | ~31 % |

- El hilo principal de Minecraft no llega al 100 %. El resto del tiempo espera: I/O, locks o GL.
- La CPU no está saturada: hay 8 núcleos y se usan ~3.

**Memoria en el menú** (`dumpsys meminfo`):
- `:game`: PSS 1,78 GB, de los que 1,11 GB son «Unknown» (heap de HotSpot), 0,38-0,41 GB Native Heap y 99 MB Graphics.
- El proceso del launcher sigue vivo con 150-165 MB, casi todo en swap.
- `MemAvailable` del sistema: ~890 MB.
- Sin `lowmemorykiller`, `am_kill` ni `am_freeze`. `Thermal Status: 0`.

---

## 2. Factores que explican la tardanza (ordenados por tiempo)

`Z/` = `android/ZalithLauncher2/ZalithLauncher/src/main/java/com/movtery/zalithlauncher/`.
**[M]** = medido. **[C]** = comprobado en código. **[H]** = hipótesis.

1. **Código de los mods en los eventos de FML: 53-55 s.** [M] (tabla de tiempos por mod en §1)
   - Por evento: Construction 12-13 s, PreInit 19-20 s, Init 18-19 s, PostInit y LoadComplete 3-5 s.
   - Por mod:
     - CustomNPC+: 9 s, casi todo en PreInit.
     - DBC: 8-9 s, casi todo en Init.
     - Los ~38 mods de DbrServerPack: 13-14 s entre todos, ninguno por encima de 3,5 s.
     - JRMCore: 6-7 s.
     - JBRA: 4,5-5 s, que son los mixins tardíos de `dbrvfx` aplicándose al cargar sus clases.
     - EtFuturum: 4 s.
   - No hay un único culpable.
   - La parte que depende de nosotros son los mods de DbrServerPack y el coste de los mixins tardíos sobre clases de JinRyuu (JBRA, DBC, JRMCore).

2. **Escaneo repetido de idiomas en el jar de DbrServerPack: ~9 s.** [M] + [C]
   - FML recorre `DbrServerPack-5.8.0.jar` completo y parsea sus 354 `.lang` **40 veces**, una por cada contenedor de mod que hay dentro.
   - Es el «hueco silencioso» de 10-16 s que había tras `identified 66 mods`. Detalle en §1.
   - Es el factor aislado más grande y el más fácil de quitar (mejora A0).

3. **JIT y JVM en frío: es una causa transversal, no una etapa.** [M] + [H]
   - Durante toda la carga el C2 usa 1,4-1,7 núcleos y el hilo principal ~0,7 [M].
   - Forge carga y transforma miles de clases que se ejecutan unas pocas veces: mucho código corre interpretado o en C1 mientras C2 compila métodos que apenas se usarán [H].
   - JRE: OpenJDK 1.8.0_442. En arm64 es Server VM con C1+C2 tiered; en arm32, Client VM solo con C1 [C].
   - No hay `classes.jsa` (CDS) en el JRE: no existe en `bin-arm64.tar.xz` ni en `universal.tar.xz` [C]. Cada arranque carga y verifica las clases del JDK desde cero.

4. **Fase 1 del launcher: 11-15 s.** [M] Desglose en §1.
   - El bloque de sync + verificación tarda 4,7-7,3 s. Por código hace todo esto en serie en cada toque [C]:
     - **`DbrSync.sync`** (`Z/ui/screens/content/LauncherScreen.kt:468`):
       - Baja el manifest y su `.sig` desde R2 (`Z/game/dbr/DbrSync.kt:383-398`). Medido desde el móvil con `curl`: **0,7-1,8 s** las dos peticiones [M].
       - Después hace **SHA-1 completo** de cada archivo del manifest si existe y tiene el tamaño esperado (`DbrSync.kt:442-456`). No hay caché de tamaño y mtime.
       - `.dbr_synced` guarda la huella del manifest, pero `sync()` no la usa para saltarse nada (`:378-418`).
     - **`MinecraftDownloader`** en `VERIFY_AND_REPAIR` (`Z/game/launch/LaunchGame.kt:119-123`):
       - Hace SHA-1 completo del client jar, de cada objeto de assets y de cada librería (`DownloadTask.kt:57` → `FileUtils.kt:56-69`).
       - A las librerías sin sha1 les descomprime el jar entero (`checkZip`, `FileUtils.kt:574-593`).
       - `skipGameIntegrityCheck` vale `false` por defecto (`Z/setting/AllSettings.kt:168`).
   - Coste del hashing [M, parcial]: `sha1sum` nativo de mods, assets, libraries y client (734 archivos, ~270 MB) tarda **1,2 s con la caché caliente**. En ART, con `DigestUtils` y 8-64 hilos, debería costar algo más.
   - El reparto entre red y hash en los 4,7-7,3 s es **inferido, no medido** [H]: unos 1-2 s de red y 3-5 s de hashing. Para medirlo hacen falta marcas `Logger.info` con ms al empezar y terminar cada subpaso (el log del launcher ya guarda ms).
   - El resto de la fase 1:
     - `checkEnableTouchProxy` [C] (`LaunchGame.kt:149-158`) abre cada jar con varios lectores buscando `touchcontroller`, que el pack no lleva. Es trabajo inútil, pero en el log solo ocupa ~0,1-0,3 s de los 1,8-1,9 s de su tramo [M]. El resto es arrancar `VMActivity` en un proceso nuevo.
     - El proceso `:game` repite la inicialización de la app: MMKV, ajustes, `Renderers.init`, `PluginLoader.loadAllPlugins` con `queryIntentActivities`, `refreshData` y el reescaneo de versiones (`VMActivity`, `ZLApplication.kt:84-93`). El JSON de versión se parsea 3 veces [C]. En total son 2,2-2,5 s [M], aunque parte es esperar la superficie de dibujo [H].
     - De `LaunchArgs` a la JVM, 1,6-3 s [M]: dlopen recursivo de todos los `.so` del runtime (`Z/game/launch/Launcher.kt:443-445`) y arranque de HotSpot.

5. **Recarga final de recursos y atlas: 8-14 s.** [M]
   - El atlas de bloques (977 sprites) tarda 1,0-2,0 s en leer y decodificar; el de items (2377 sprites), 2,4-3,2 s. Más el stitch, unos **3,8-5,8 s en total**.
   - En PC el mismo atlas tardó **0,55 s** (DbrOptimizer `PLAN-m7.md`).
   - Lo que queda es sonido y la recarga de los resource packs. DbrTexture v6 es un zip de 4,3 MB, con 13 MB de ogg en DbrServerPack.

6. **Arranque de LaunchWrapper y coremods: 11-15 s.** [M]
   - Incluye 3 s de `Read 527 binary patches` → fingerprint.
   - Tweakers de 5 mixins (unimixins, CoreTweaks, CNPC+, EtFuturum, npcdbc), `MixinBootstrap` y GasStationCore.
   - CoreTweaks ya trae sus cachés activas [C]: `classTransformerLite.cache` de 10 MB y `jarDiscoverer.cache` de 7,8 MB, que **se reescribe en cada arranque** (mtime 02:37, durante la carga) [M].

7. **El arranque justo después de un sync que cambió un jar es ~40 s más lento.** [M] + [H]
   - Medido: el de 02:01, justo después de actualizar `DbrServerPack-5.8.0.jar`, tardó 148 s frente a 101-109 s.
   - Hipótesis: se invalidan las cachés de CoreTweaks (transformer y jar discoverer) del jar cambiado.
   - Afecta a cada actualización del modpack.

8. **Pantalla de carga del launcher compitiendo por la CPU: ~0,5-0,8 núcleos durante ~100 s.** [M] + [H]
   - `DbrLoadingScreen` mantiene un WebView skinview3d con la skin animada hasta `stage=menu` (`Z/ui/screens/game/elements/DbrLoadingScreen.kt:210-243`) [C].
   - Medido [M]:
     - El hilo de UI de `:game` usa ~46-49 %.
     - `RenderThread` y el proceso sandbox del WebView suman ~25-30 % más.
   - En este móvil de 8 núcleos hay CPU libre, así que el coste para el juego es bajo.
   - En un móvil de 4 núcleos le quita CPU al hilo principal y al C2 [H].

9. **Hilo de log con `fdatasync` por escritura.** [C] + [H]
   - `jni/stdio_is.c:30-38` escribe cada fragmento de stdout del juego en `latest_game.log`, que está en almacenamiento externo, y llama a `fdatasync` cada vez.
   - Si ese hilo se atrasa, el pipe se llena y la JVM se bloquea en `System.out`.
   - El volumen es bajo (1762 líneas en `latest_game.log`), así que el coste máximo es de pocos segundos [H].
   - No lo pude medir: el `dd` de toybox no soporta `fdatasync` sobre `/sdcard` desde shell. Para medirlo, comparar con un build sin el `fdatasync`.

10. **Ruido durante la carga.** [M], coste bajo
    - DiscordRPC intenta conectar durante la carga (02:03:50) y después cada 15 s. Falla siempre con `Unhandled architecture/OS: aarch64-Linux`.
    - Forge Version Check hace una petición de red y falla con `Expected BEGIN_OBJECT but was STRING`.
    - `Main menu mob rendering encountered a serious error` al llegar al menú.

11. **Almacenamiento externo (`getExternalFilesDir`).** [C] + [H], coste probablemente bajo
    - `.minecraft` vive en `/storage/emulated/0/Android/data/<pkg>/files/.minecraft` (`Z/game/path/GamePathManager.kt:48`, `Z/path/PathManager.kt:63`). `HOME` y la caché PSA de GL4ES también.
    - En Android 11 y posteriores, el sistema monta `Android/data` de la app propia sin FUSE para esa app [H]. Leer 270 MB por la ruta de shell (con FUSE) tardó 1,2 s con caché caliente [M].
    - Puede pesar más con la caché fría (primer arranque tras reiniciar el móvil), en Android 8-10 o con almacenamiento eMMC lento. **No medido.**

12. **Lo que no se pudo medir y cómo medirlo**
    - **Tiempo por mod: ya medido** (§1) con la config temporal de log4j. El hueco silencioso quedó explicado (§2.2).
    - **Qué hace cada mod por dentro** (p. ej. los 7,6 s del PreInit de CustomNPC+):
      - Muestrear el hilo principal cada 200-500 ms con `Thread.getAllStackTraces()` desde un hilo daemon del mod, o con un `-javaagent` mínimo.
      - `kill -3` no sirve: el proceso es de ART.
    - **Reparto de la fase 1:** marcas `Logger.info` al empezar y terminar `fetchManifest`, el bucle de hash de `DbrSync`, la verificación de `MinecraftDownloader` y `checkEnableTouchProxy`.
    - **Fase 1 con mala red:** no se puede probar cortando el Wi-Fi porque adb va por Wi-Fi. Con adb por USB y el Wi-Fi limitado se vería el peor caso. Por código, los timeouts suman hasta ~140 s antes de fallar (§5).

---

## 3. Mejoras propuestas para el arranque

Ordenadas por ganancia esperada frente a esfuerzo y riesgo. «Upstream» = toca un archivo heredado de ZalithLauncher2, y cada parche nuevo hay que anotarlo en `VENDOR-PATCHES.md`.

| # | Mejora | Dónde | Ganancia esperada | Esfuerzo / riesgo | Cómo comprobarla |
|---|---|---|---|---|---|
| A0 | **Escanear los idiomas de cada jar una sola vez.** Mixin temprano en DbrMod sobre `cpw.mods.fml.common.registry.LanguageRegistry#loadLanguagesFor(ModContainer, Side)` (`remap = false`): guardar un `Set<File>` de los `getSource()` ya escaneados y cancelar las llamadas repetidas. Es seguro porque `searchZipForLanguages` carga todos los `.lang` del jar sin filtrar por modid, así que las pasadas 2 a 40 repiten exactamente lo mismo. Los directorios (entorno de desarrollo) se dejan pasar siempre. | Mod (DbrMod, mixins tempranos) | **~9 s** por arranque en este móvil [M: 9,1-9,3 s] | Bajo / bajo. Riesgo: si otro mod llama a `loadLanguagesFor` esperando recargar, no recargaría; en 1.7.10 solo lo llama `FMLClientHandler.addModAsResource` [C] | Una sola línea `Found translations in DbrServerPack-5.8.0.jar` en `latest.log`; los textos de todos los mods (es/en/pt) siguen traducidos, y **cambiar el idioma dentro del juego, ya en el servidor, sigue traduciendo todo**: la primera pasada guarda todos los idiomas en `modLanguageData` (`injectLanguage`) y `mergeLanguageTable` los aplica en cada cambio; además el `Locale` vanilla relee los `.lang` desde el resource pack de cada mod; el hueco tras `identified 66 mods` baja de ~10 s a ~1 s |
| A1 | **Dejar los tiempos por mod disponibles para siempre**: hoy se sacaron cambiando `log4j2.xml` a mano (§1). Opción sin código: una config de log4j alternativa en el launcher, activable desde Ayuda o con una propiedad, que añada ms y `Sen(ding|t) event` a `latest.log`. | Launcher (`LaunchArgs.kt:224-238` y assets `log4j-1.7.xml`; **upstream**) o simplemente la receta documentada | 0 s; sirve para medir cada cambio | Bajo / nulo | `pormod.py` sobre `latest.log` |
| A2 | **Probar argumentos de la JVM con A/B** (cada uno por separado, 3 arranques): (a) `-XX:TieredStopAtLevel=1` (solo C1, compila mucho más barato); (b) `-Xverify:none` (en Java 8 se salta la verificación de miles de clases transformadas); (c) `-XX:CICompilerCount=2` en móviles de ≤4 núcleos. Todas existen en HotSpot 8. | Launcher (`SettingsInitializer.kt:32-34`, propio de DBR) | (a) y (b): 10-25 % de la fase 2 [H], o sea 10-25 s | Bajo esfuerzo. Riesgo: (a) baja el FPS en partida porque no hay C2, así que solo vale si se mide FPS también; (b) un bytecode roto de un transformer revienta en ejecución en vez de dar `VerifyError` | Tiempo JVM→menú en `latest_game.log` y FPS en el escenario de §4 |
| A3 | **Caché de hashes en `DbrSync`**: guardar `(ruta, tamaño, mtime, sha1)` tras un sync correcto y no rehashear si el tamaño y el mtime coinciden. Además, si la huella del manifest coincide con `.dbr_synced`, saltar el bucle entero. | Launcher (`DbrSync.kt`, propio) | ~1-3 s por arranque [H] | Bajo / bajo: un archivo cambiado conserva tamaño y mtime solo si alguien lo toca a mano; se puede rehashear todo cada N arranques | Marcas de §2.12: el bucle de hash pasa a ~0 s |
| A4 | **Verificación de Minecraft solo cuando hace falta**: en la instancia DBR, `VERIFY_AND_REPAIR` completo solo tras instalar o cambiar de versión, o cada N días; el resto de veces, solo existencia y tamaño. | Launcher, **upstream** (`LaunchGame.kt:119-123`, `MinecraftDownloader`) | ~1-3 s [H] | Bajo-medio / bajo | Ídem |
| A5 | **Reusar el manifest de la home**: `checkStatus` ya baja el manifest al abrir la home; si tiene menos de X minutos, `sync()` lo reutiliza en vez de pedirlo otra vez. | Launcher (`DbrSync.kt`, propio) | 0,7-1,8 s [M: tiempo de la petición] | Bajo / bajo | Ídem |
| A6 | **Saltarse `checkEnableTouchProxy`** cuando la versión es 1.7.10 o es la instancia DBR (TouchController no existe para 1.7.10). | Launcher, **upstream** (`LaunchGame.kt:127,149-158`) | 0,1-0,5 s [M] | Trivial / nulo | Desaparecen los avisos `AllModReader` del log |
| A7 | **Pantalla de carga más ligera**: cargar la skin estática (o bajar su animación a ~10 fps) en vez del WebView skinview3d animado, sobre todo en móviles de ≤4 núcleos. | Launcher (`DbrLoadingScreen.kt`, propio) | En 8 núcleos ~0; en 4 núcleos 5-10 % de la fase 2 [H] | Bajo / bajo | `top -H` durante la carga y tiempo JVM→menú en un móvil de 4 núcleos |
| A8 | **Reabrir el atlas paralelo**: se descartó en PC por ahorrar 0,3 s (umbral 2 s). En Android el atlas cuesta 3,8-5,8 s, por encima de ese umbral. | Mod (DbrOptimizer) | 2-3 s en Android [H] | Medio / medio (compatibilidad con mods que tocan el stitcher) | Línea `[atlas] ... total` en el log |
| A9 | **Quitar trabajo inútil del modpack**: DiscordRPC apagado en Android (no puede funcionar en aarch64); `versionCheck=false` en `forge.cfg` sembrado; arreglar el error del render del mob del menú. | Mod (DiscordRPC de DbrServerPack) + modpack (`forge.cfg`) | <1 s [H]; deja el log limpio | Trivial / nulo | Desaparecen los avisos en `latest.log` |
| A10 | **Generar CDS para el JRE** (`-Xshare:dump` una vez tras desempaquetar el JRE en el móvil, y `-Xshare:auto` al lanzar). En OpenJDK 8 solo cubre las clases del JDK. | Launcher, **upstream** (`UnpackJreTask`/`Launcher.kt`) | 0,5-1,5 s [H] | Medio / bajo (si el archivo falla, HotSpot lo ignora con `auto`) | Tiempo `LaunchArgs` → primera línea de LaunchWrapper |
| A11 | **Quitar `fdatasync` del hilo de log**, o hacerlo cada N KB o por tiempo. | Launcher, **upstream** (`jni/stdio_is.c:35`) | 0-3 s [H] | Trivial / bajo (si el proceso muere, se pierden las últimas líneas: el crash lo captura otro camino) | A/B del tiempo de la fase 2 |
| A12 | **No invalidar las cachés de CoreTweaks en cada actualización**: si CoreTweaks lo permite, excluir de la clave de invalidación los jars propios que cambian a menudo; si no, aceptar el arranque lento una vez por actualización. | Modpack (`coretweaks.cfg`) | ~40 s, solo en el primer arranque tras actualizar [H] | Bajo / medio: una caché obsoleta con un jar cambiado da clases viejas | Medir el primer arranque tras un sync que cambia `DbrServerPack` |
| A13 | **Recortar el proceso `:game`**: no ejecutar `PluginLoader.loadAllPlugins` ni el reescaneo de versiones en `VMActivity` cuando no hay plugins de renderizador; parsear la versión una sola vez. | Launcher, **upstream** | 0,3-1 s [H] | Medio / bajo | Tiempo del nacimiento de `:game` a `LaunchArgs` en el log del launcher |
| A14 | **Mover `.minecraft` a almacenamiento interno**, solo si una medición con la caché fría o en Android 8-10 demuestra que FUSE pesa. | Launcher, **upstream** (`GamePathManager.kt:48`) | Incierta, probablemente <5 s en Android 11+ [H] | Alto / alto: el jugador pierde el acceso a capturas y resourcepacks, y hay que migrar instancias | Copiar la instancia a `filesDir` en un build debug y comparar |

**Orden recomendado:**
1. A0: 9 s medidos con un mixin pequeño. Hecho: ~9,4 s menos en el arranque 6.
2. A2: es la que más puede dar, pero hay que confirmarla con A/B.
3. A3, A5 y A6: fáciles.
4. A8.
5. A12, si las actualizaciones son frecuentes.

Ya no hace falta instrumentar FML para saber qué mod tarda: la receta de log4j de §1 basta.

Mod a mod, después de A0:
- **CustomNPC+:** 7,6-7,9 s de PreInit. Pedir o perfilar dentro de su preinit qué parte son recursos y qué parte registro de entidades.
- **DBC:** 7 s de Init.
- **Mixins tardíos de DbrServerPack:** aplicarlos sobre JBRA, DBC y JRMCore cuesta 4-5 s solo en JBRA. Revisar si `dbrvfx`, `dbrfood` y `dbrtierra` pueden apuntar a menos clases o pasar a inyecciones más simples.

Esto es trabajo de mods y necesita perfilar dentro de cada evento.

---

## 4. Mejoras propuestas para el rendimiento en partida

Lo ya hecho y medido no se repite (DbrServerPack `docs/rendimiento/PLAN.md`, DbrOptimizer `docs/perf/`). Contexto relevante:
- Todas las mediciones de rendimiento hechas hasta ahora son **de PC**, y el perfil «movil» de DbrOptimizer es emulado.
- GL4ES y LTW quedan en tier 1: sin las regiones T2/T3 ni `tesr_cache`.
- La tabla de medición base del plan de rendimiento quedó vacía.

| # | Mejora | Dónde | Ganancia esperada | Esfuerzo / riesgo | Cómo comprobarla |
|---|---|---|---|---|---|
| B1 | **Medición base en Android**: escenarios fijos (spawn, pelea DBC con auras, zona con muchos NPC) en un móvil de gama baja y en este Honor, con FPS medio/p99, `chunk_scheduler`, `entity_culling` y `dbc_distancia`. El juego ya los escribe en `latest.log`, y `AvisosSistema` registra el calor. | Proceso (`dbr-test` nivel rendimiento) | 0, pero decide B2-B6 | Bajo / nulo | Tabla en `docs/rendimiento` |
| B2 | **Revisar la RAM por defecto**: este móvil de 5,6 GB recibe 1536M (`SettingsInitializer.kt:94`, rango <6 GB), y en el menú el sistema se queda con ~890 MB libres. Para 4 GB el valor es 1144M. Con `-Xms=-Xmx` (`Launcher.kt:269`) todo el heap queda reservado. En móviles de ≤4 GB, probar `-Xms` más bajo (p. ej. 512M) manteniendo `-Xmx`, para no reservar memoria que Android necesita. | Launcher, **upstream** (`Launcher.kt:251-269`) | Menos cierres por memoria en 4 GB [H] | Bajo / bajo (G1 en Java 8 crece el heap sin problema) | `dumpsys meminfo` y eventos `lowmemorykiller` en un móvil de 4 GB |
| B3 | **El A/B de JIT de A2 también en partida**: `TieredStopAtLevel=1` baja el FPS sostenido [H]. Si A2 lo elige, debe ser solo para arrancar, lo que no es posible: es un flag para toda la sesión. Lo más probable es descartarlo y quedarse con `-Xverify:none` y `CICompilerCount`. | Launcher | — | — | FPS de B1 |
| B4 | **Afinidad a núcleos grandes**: la opción `POJAV_BIG_CORE_AFFINITY` se exporta, pero `bigcore_set_affinity()` (`jni/bigcoreaffinity.c:20`) no se llama nunca. Conectarla al hilo de render daría al hilo principal un A73 en vez de un A53 cuando el planificador se equivoca. | Launcher, **upstream** (JNI) | 0-15 % de FPS en SoC big.LITTLE [H] | Bajo / medio (el calor sube antes) | FPS de B1 y `dumpsys thermalservice` |
| B5 | **Revisar el preset de experimental en Android**: experimental en Android solo recibe `rendimiento.cfg` y `options.txt`, sin el `video.cfg` de DbrOptimizer que llevan full y lite. Si se quiere usar experimental en móvil, darle el mismo `video.cfg`. | Modpack (DBR-ASSETS `androidFiles` de `manifest-experimental.json`) | Igual a la de full con su preset [H] | Trivial / bajo | Comparar FPS de experimental con y sin el `video.cfg` |
| B6 | **LTW (experimental) no arranca hoy en este móvil**: crash `IllegalStateException: Function is not supported` en `GL11.glMatrixMode` desde `SplashProgress.drawVanillaScreen` (`Downloads/latest_game.log`, 11-11). Ojo: el arranque medido hoy con experimental usó GL4ES. | Launcher/renderizador | Corrección, no rendimiento | Medio / medio | Que experimental con LTW llegue al menú |
| B7 | **Resolución**: el 50 % por defecto (`AllSettings.kt:122`) y la reducción ×0,7 por calor (`AvisosSistema.kt:74`) ya están bien orientados. Falta medir con B1 si el Adreno 610 está limitado por GPU (en cuyo caso bajar resolución ayuda) o por CPU (en cuyo caso no). | Launcher | Desconocida | — | B1 a 50 % y a 35 % |
| B8 | **Quitar lo que corre en partida sin servir**: DiscordRPC reintenta cada 15 s con excepción (ver A9), y la pantalla de carga se cierra correctamente al llegar al menú. | Mod | Pequeña [H] | Trivial | `latest.log` limpio |

---

## 5. Revisado y descartado (una línea cada uno)

- **Red en el arranque normal con buena red:** manifest + `.sig` en 0,7-1,8 s medidos; el comprobador de actualizaciones, 0,25 s. No es el cuello de botella. Con la red colgada, los timeouts suman ~140 s en el peor caso (`DbrSync.kt:97-137`, `DbrMirror.kt:65-91`), pero offline falla rápido y ofrece «Jugar igual».
- **Login:** las cuentas offline no hacen petición (`AccountsManager.kt:157-158`).
- **Manifest de versiones de Mojang:** no se baja al lanzar DBR (sin `inheritsFrom`; `MinecraftDownloader.kt:235-244`).
- **Desempaquetado del JRE y componentes:** no se repite en cada arranque (`UnpackSingleTask` lo salta por versión; log «Pack is up-to-date»).
- **Splash de Forge:** el launcher ya lo apaga (`GameLauncher.kt:337-358`, `splash.properties enabled=false`).
- **Variante full vs lite en el tiempo de carga:** mismos 16 jars; lite solo cambia configs, así que no acorta la carga (solo cambia el rendimiento en partida).
- **`CodeCache is full`:** no aparece en los logs.
- **Presión de memoria y cierres por el sistema:** sin `lowmemorykiller`, `am_kill` ni `am_freeze` en 5,6 GB; `Thermal Status: 0` tras el arranque.
- **Nivel de log de log4j:** `Root level="info"`; `latest.log` tiene 887 líneas. El volumen de log no es un factor.
- **`-Dorg.lwjgl.util.Debug=true`** (`LaunchArgs.kt:219`): en LWJGL 2 solo activa mensajes de log, no comprobaciones de GL por llamada [H, coste despreciable]. Se puede quitar por limpieza.
- **Caché PSA de GL4ES:** ya está activa por defecto.
- **Mipmaps, anisotropía y sombreadores en el arranque:** `mipmapLevels:0`, el atlas sube en 30-60 ms; la compilación de GL no aparece como coste.
- **Afinidad de los hilos de la JVM y `ActiveProcessorCount`:** la JVM ve los 8 núcleos (`-XX:ActiveProcessorCount=8`).
- **32 bits:** `liblwjgl.so` de LWJGL 2 no existe y `LaunchArgs.kt:165-167` no comprueba la ABI, así que 1.7.10 probablemente no arranca en arm32 [H]. Además el APK publicado es solo arm64 (`.github/workflows/android-release.yml:73`). Es un problema de compatibilidad, no de tiempo de arranque.
- **Java 17 y superiores, Sodium/Embeddium, flags de JVM modernas (ZGC, Shenandoah, CDS de aplicación):** no aplican a 1.7.10, Java 8 y LWJGL 2.

---

## Anexo: archivos de la medición

Copiados fuera del repo, en `%TEMP%`:
- `dbrdiag-runs\run{1,2,3}\`: logcat, `top.txt`, `meminfo_*.txt`, `thermal.txt`, `latest.log`, `latest_game.log` y logs del launcher.
- `dbrdiag-runs\run.sh` y `analiza.sh`: scripts de medición y análisis.
- `dbrdiag-game\` y `dbrdiag-logs\`: logs previos del móvil (arranque de 02:01 y sesiones de hoy).
