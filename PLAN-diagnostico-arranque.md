# Plan: diagnóstico de arranque y rendimiento en Android

Informe resultante: [DIAGNOSTICO-ARRANQUE-ANDROID.md](DIAGNOSTICO-ARRANQUE-ANDROID.md).

## Objetivo
Medir y explicar por qué Minecraft 1.7.10 tarda en abrir al pulsar Jugar en DbrLauncherMobile, separando:
- Fase 1: el launcher, hasta que arranca la JVM.
- Fase 2: la JVM y Forge, hasta el menú.

Proponer también mejoras de arranque y de rendimiento en partida.

## Decisiones del usuario
- Por ahora solo un informe: sin cambios de código, commits, tags ni APKs publicados.
- Excepción para poder medir: el aviso de actualización obligatoria se desactivó **momentáneamente** en
  builds debug (`DbrUpdater.check()`). Se compiló e instaló un APK debug en el Honor y después se
  revirtió el código. El APK instalado en el móvil todavía lleva el cambio.

## Pasos
1. Medir 3 arranques en caliente en el Honor TFY-LX3 (adb Wi-Fi) con logs, `top -H` y meminfo. Hecho.
2. Contrastar con el código y con los docs de rendimiento de DbrServerPack y DbrOptimizer. Hecho.
3. Escribir el informe. Hecho.

## Bitácora
- 2026-11-11: exploración del código y de los logs previos del móvil y de Descargas.
- 2026-11-11: aviso de actualización obligatoria en debug desactivado temporalmente, APK debug instalado y código revertido.
- 2026-11-11: arranques medidos:
  - Arranque 1: 14,6 s de fase 1; se cortó antes del menú por un fallo del script.
  - Arranques 2 y 3: 113 y 121 s del toque al menú; la fase 2 es el 90 %.
- 2026-11-11: informe escrito.

## Siguiente paso
Decidir qué mejoras del informe implementar. Recomendado empezar por:
- A1: tiempos por mod en DbrMod.
- Marcas de tiempo de la fase 1 en el launcher.
- A2: A/B de argumentos de la JVM.

## Bitácora (continuación)
- 2026-11-11: tiempos por mod medidos (arranques 4 y 5) con `log4j2.xml` temporal en el móvil, ya restaurado.
  - Mods: 53-55 s entre todos.
  - FML relee 40 veces el jar de DbrServerPack buscando idiomas: ~9 s.
  - Informe actualizado (§1, §2 y mejora A0).

## Siguiente paso (actualizado)
Implementar A0 en DbrMod (DbrServerPack): un mixin temprano sobre `LanguageRegistry#loadLanguagesFor` para escanear cada jar una sola vez. Después, medir con la receta de log4j.

## Plan A0: escanear los idiomas de cada jar una sola vez (propuesto 2026-11-11, pendiente del OK)
Repo DbrServerPack, submódulo DbrOptimizer (dueño del rendimiento). Módulo nuevo `lang_scan_once`.
1. `DbrOptimizer/.../core/module/Module.java`: entrada `LANG_SCAN_ONCE`.
   - Solo cliente, activo por defecto, `coexists`.
   - Mixin temprano `fixes.MixinLanguageRegistryScanOnce`.
2. Mixin nuevo `mixins/early/fixes/MixinLanguageRegistryScanOnce.java`.
   - `@Inject(HEAD, cancellable)` en `cpw.mods.fml.common.registry.LanguageRegistry#loadLanguagesFor` (`remap = false`).
   - Guarda un set de rutas canónicas de jars ya escaneados y cancela las llamadas repetidas.
   - Los directorios pasan siempre.
   - Comprueba `isLoaded()` y no `active`: `active` se enciende tras postInit, demasiado tarde.
3. Docs:
   - Sección en `docs/specs/arreglos-m1.md`.
   - Línea en `docs/cleanroom/REGISTRO.md`.
   - Bitácora en `PLAN-optimizador.md`.
4. Textos del módulo en es_ES, en_US y pt_BR, más `tools/sync-lang.py` para las variantes.
5. Build del jar combinado. Prueba en el Honor:
   - Copiar el jar a `mods`.
   - Saltarse el sync, que lo pisaría, con "Jugar igual" sin red (necesita adb por USB).
   - Medir con la receta de log4j.
   - Cambiar el idioma ES/EN/PT en partida.
6. No tocar los cambios sin commitear de otra sesión en DbrCore (`movil/Pantalla.java`, `UiScreen.java`, `PantallaTest.java`) ni `tools/vfx-viewer/vfx.js`.

## Bitácora (A0)
- 2026-11-11: A0 implementado en DbrOptimizer (módulo `lang_scan_once`). Sin commit en DbrServerPack.
- 2026-11-11: jar publicado en DBR-ASSETS `experimental` (commit 58551e4). R2 sirve el sha1 nuevo.
- 2026-11-11: el APK debug instalado ya no consulta actualizaciones (`DbrUpdater.check()` devolvía null en debug). Código revertido después de compilar.
- 2026-11-11: arranque 6 medido. DbrServerPack se escanea 1 vez en vez de 40. El hueco tras `identified` baja de 11,5 a 2,1 s (~9,4 s). Total: 124 s, dentro del ruido.
- 2026-11-11: móvil restaurado (`log4j2.xml` original; sin `.bak` ni `.oficial`).

## Siguiente paso
- Probar en el móvil el cambio de idioma ES/EN/PT en partida y el texto del módulo en DbrOptimizer > Módulos.
- Commit de A0 en DbrServerPack/DbrOptimizer cuando el usuario lo pida.

## Plan de mejoras A3, A5, A6, A8 y A12 (propuesto 2026-11-11, pendiente del OK)
Decisión del usuario (2026-11-11): A2 (argumentos de la JVM) no se hace. El resto sí.

### Bloque 1: launcher (worktree android-zalith)
1. A3, caché de hashes en `DbrSync.kt`:
   - Al terminar un sync correcto, guardar `.dbr_hashes` con `ruta → (tamaño, mtime, sha1)` de cada archivo gestionado.
   - En la comprobación, si tamaño, mtime y sha1 esperado coinciden con la caché, no se rehashea.
   - Rehash completo cada 10 syncs, o si la caché falta o está rota.
2. A5, en `DbrSync.kt`: `checkStatus` guarda en memoria el manifest que bajó y la hora. `sync()` lo reutiliza si tiene menos de 2 minutos y es de la misma URL.
3. A6, en `LaunchGame.kt` (upstream ZL2): no llamar a `checkEnableTouchProxy` en 1.7.10, porque TouchController no existe para esa versión. Entrada nueva en `VENDOR-PATCHES.md`.
4. Verificar: compilar, instalar el APK debug en el Honor y comparar el tiempo del toque al proceso `:game` (arranque 6: 11 s).

### Bloque 2: DbrOptimizer (A8, atlas paralelo)
- En el arranque 6, leer y decodificar los PNG del atlas costó 4,1 s (1,07 s de bloques y 3,04 s de ítems). En PC se descartó por 0,55 s.
- Módulo nuevo `atlas_parallel`: la decodificación de los PNG se hace en un pool de hilos. Solo para los resource packs de confianza (el por defecto y los de carpeta o zip); el resto sigue en el hilo principal.
- Clean-room: spec en `docs/specs`, línea en REGISTRO y `javap` de `TextureMap`. Textos del módulo en es_ES, en_US y pt_BR.
- Verificar con la línea `[atlas]` del log, en el Honor y en PC.

### Bloque 3: A12, cachés de CoreTweaks (primero investigar)
- `coretweaks.cfg` tiene `modFilesToIgnore`. Meter ahí DbrServerPack evita reconstruir la caché en cada actualización.
- Antes, confirmar cómo arma la clave la caché LITE (si incluye el hash de los bytes de cada clase, es segura).
- Medir el primer arranque tras una actualización, con y sin el cambio. Si es seguro, cambiarlo solo en `experimental`.

### Commits
- Uno por bloque, en su repo: launcher (android-zalith), DbrServerPack y DBR-ASSETS.
- Sin push, tag ni APK publicado sin preguntar.

## Bitácora (A3, A5, A6, A12)
- 2026-11-11: el usuario aprueba el plan sin A2 ni A8.
- 2026-11-11: A3 (`.dbr_hashes.json`), A5 (reusar el manifest de `checkStatus` durante menos de 2 min) y A6 (sin `checkEnableTouchProxy` en 1.7.10, VENDOR-PATCHES 13). Commit `d3a8ab6`, sin push.
- 2026-11-11: arranques 7 y 8 con un APK de prueba sin aviso de actualización (código revertido): del toque al proceso `:game`, 7,4 y 10,3 s (antes 11,0 s); del toque al menú, 94 y 97 s. A6 confirmado.
- 2026-11-11: A12 descartada. La caché LITE de CoreTweaks va por clase (adler32 de la entrada) y no se invalida al cambiar mods.

## Siguiente paso
- Probar en el móvil el cambio de idioma ES/EN/PT (A0) y el texto del módulo.
- Push de `d8fb52f5` (DbrServerPack) y `d3a8ab6` (launcher) cuando el usuario lo pida.

## Alcance final (decisión del usuario, 2026-11-11)
**Se quitan del plan:** A1, A2, A7, A8, A10, A11, A13, A14, B1, B2, B3, B5 y B6.
**Ya hecho:** A0, A3, A5, A6 y B7 (la resolución por defecto ya está bien).
**Descartado tras investigar:** A12.

**Queda por hacer:**
1. **A9 y B8, en DbrServerPack:** no crear un mod aparte ni otra variante del pack, para no tener que compilar y mantener más mods.
   - Lo que no sirve en Android se apaga solo cuando el dispositivo es Android: DiscordRPC (falla en aarch64 y reintenta cada 15 s).
   - Detectar Android desde el juego, por ejemplo con `System.getProperty("java.vendor")`, una variable de entorno de Pojav/ZL2 (`POJAV_*`) o `os.arch` junto a `/system/build.prop`. Elegir la señal más fiable.
   - En PC todo sigue igual.
   - Revisar también `versionCheck=false` en `forge.cfg` y el error del render del mob del menú, si siguen saliendo en el log.
   - Verificar: los avisos de DiscordRPC desaparecen de `latest.log` en el Honor y siguen funcionando en PC.
2. **A4, en el launcher (upstream, VENDOR-PATCHES):** `VERIFY_AND_REPAIR` completo solo tras instalar, al cambiar de versión o cada N días. El resto de veces, comprobar solo existencia y tamaño (`LaunchGame.kt:119-123`, `MinecraftDownloader`). Ganancia estimada: 1-3 s.
3. **B4, en el launcher (upstream, JNI):** llamar a `bigcore_set_affinity()` (`jni/bigcoreaffinity.c:20`) desde el hilo de render cuando `POJAV_BIG_CORE_AFFINITY` esté activo. Sin B1 no hay medición base: medir FPS en una misma escena antes y después, y vigilar el calor (`dumpsys thermalservice`).

Cada punto se propone con detalle y espera el OK antes de tocar código.

## Bitácora (alcance)
- 2026-11-11: alcance recortado por el usuario. Quedan A9/B8 (en DbrServerPack, solo en Android), A4 y B4.

## Propuesta A9/B8 (2026-11-11, pendiente del OK)
Investigación:
- DiscordRPC es código propio: `DbrMod/.../client/discord/DiscordPresence.java`, arrancado en `ClientProxy` (`DiscordPresence.start()`).
- El launcher ya pasa `-Ddbr.movil.canal=1` (`LaunchArgs.kt:221`), pero solo con LWJGL 2. ZL2 pone siempre las variables `POJAV_NATIVEDIR` y `POJAV_RENDERER`.
- `Main menu mob rendering encountered a serious error` sale de bspkrsCore (`showMainMenuMobs=true`). `GuiDbrMainMenu` hereda de `GuiMainMenu` a propósito para que bspkrsCore haga el warm-up que deja ver las skins de raza con OptiFine. Apagarlo puede romper esas skins.
- `disableVersionCheck=false` en `config/forge.cfg`, `lite/` y `experimental/` de DBR-ASSETS.

Cambios propuestos:
1. DbrCore: clase `dbr.machitos.core.movil.Plataforma` con `esAndroid()` (cacheado). Señales, en orden: `dbr.movil.canal=1`; variable `POJAV_NATIVEDIR`; `os.name` Linux y existe `/system/build.prop`. Test unitario de la lógica de decisión.
2. DbrMod: `DiscordPresence.start()` sale al principio si `Plataforma.esAndroid()`, con una línea de log.
3. forge.cfg: poner `disableVersionCheck=true`. Solo se puede por config, así que afecta también a PC (el check de Forge 1.7.10 no aporta nada). Necesita decisión del usuario.
4. Mob del menú: no tocar, por el warm-up de skins.

## Bitácora (A9/B8)
- 2026-11-11: el usuario aprueba todo, incluido `disableVersionCheck=true` en PC.
- 2026-11-11: DbrServerPack `8c90f9fb` (`Plataforma.esAndroid()` + DiscordRPC apagado en Android; tests y `compileJava` OK). DBR-ASSETS `23565f6` (3 `forge.cfg` + sha1/size en los 3 manifests). Sin push.

- 2026-11-11: push de DbrServerPack (`main` hasta `8c90f9fb`, incluye `c3d51c12`) y DBR-ASSETS (`23565f6`, `25123a8`: jar de experimental compilado en worktree limpio `C:\dev\dsp-a9`, porque la carpeta normal tenía cambios sin commit de otra sesión). Mirror R2 OK.
- 2026-11-11: el APK debug pedía actualizar. `DbrUpdater.check()` devuelve null en debug (el paquete `.debug` no se actualiza con el APK de release). APK reinstalado por adb.
- 2026-11-11: verificado en el Honor: jar `dbe4dc4d`, `disableVersionCheck=true`, `latest.log` con `[DiscordRPC] Android: Rich Presence desactivado.` y sin version check. Sigue `Main menu mob rendering ...` (bspkrsCore, se deja a propósito).

## Siguiente paso
- Proponer A4 (launcher) y esperar el OK.

## Propuesta A4 v2: caché de SHA1 por tamaño y fecha (2026-11-11, pendiente del OK)
La v1 (verificación completa cada 7 días) se descarta: solo calculaba menos a menudo y dejaba un hueco entre medias. El usuario pidió la solución de raíz.

Causa: en cada toque se calcula el SHA1 de todos los archivos de Minecraft y de las librerías, aunque no hayan cambiado (`DownloadTask.verifySha1` → `compareSHA1` en `utils/file/FileUtils.kt:56`, y `Minecraft.DownloadUtils.kt:72` para los JSON).

Cambios:
1. `game/dbr/DbrHashCache.kt` (propio), mismo patrón que `DbrSync` en A3 (`DbrSync.kt:484-487`):
   - Mapa `ruta → (tamaño, fecha de modificación, sha1)` en memoria (`ConcurrentHashMap`, porque las descargas van en paralelo), guardado en `.dbr_verify_cache.json` junto a `.dbr_hashes.json`.
   - `coincide(file, sha1)`: si el tamaño y la fecha son los guardados y el sha1 esperado es el guardado, devuelve true sin leer el archivo. Si no, llama a `compareSHA1` como hoy, y si coincide guarda la entrada.
   - La caché se borra si tiene más de 30 días, para cubrir un archivo dañado en disco sin cambio de fecha.
   - Si el JSON de la caché no se puede leer, se ignora y se rehashea todo (como hoy).
2. Upstream, VENDOR-PATCHES 15: `DownloadTask.kt:110` y `Minecraft.DownloadUtils.kt:72` llaman a `DbrHashCache.coincide` en vez de `compareSHA1`. `MinecraftDownloader` carga la caché al empezar y la guarda al terminar, y escribe en el log cuántos archivos salieron de la caché, cuántos se hashearon y los ms.
3. Tests de `coincide`: acierto sin leer, cambio de tamaño, cambio de fecha, sha1 esperado distinto (actualización de Minecraft o de una librería), caché caducada, JSON roto.

Seguridad: igual que hoy en cada arranque. Cualquier cambio de tamaño o fecha vuelve a hashear y repara. Solo se escapa un archivo cambiado con el mismo tamaño y la misma fecha, que solo pasa a propósito. Eso lo cubre el rehash cada 30 días.
No cambia: `verifyIntegrity`, el modo `VERIFY_AND_REPAIR`, la opción "saltar verificación" ni `DbrSync`.
Verificación: tests; 3 arranques en el Honor, el primero llena la caché y los otros dos deben salir casi todo de la caché. Comparar los ms del log nuevo. Ganancia esperada 1-3 s.

## Bitácora (A4)
- 2026-11-11: el usuario aprueba A4 v2. Launcher `2312cd7`: `DbrHashCache` + 8 tests (OK) + VENDOR-PATCHES 15. Sin push.
- 2026-11-11: 3 arranques en el Honor. Caché OK (713 de 713 archivos desde la caché), pero la verificación solo baja de 4051 a ~3830 ms. Calcular los SHA1 no era el coste. Los ~3,8 s restantes están sin localizar; el commit deja en el log el reparto (archivos sin SHA1, programar, total).
- 2026-11-11: el usuario decide dejar A4 así, sin seguir midiendo. Del toque al menú: 95-101 s, igual que antes.

## Siguiente paso
- B4 (`bigcore_set_affinity`), pendiente de proponer.
- Pendiente de antes: probar en el móvil el cambio de idioma ES/EN/PT (A0).
- Push del launcher (`android-zalith`) cuando el usuario lo pida.

## Propuesta B4: hilo del juego en los núcleos grandes (2026-11-11, pendiente del OK)
Investigación:
- La opción ya existe en Ajustes > Renderizador (`AllSettings.bigCoreAffinity`, apagada por defecto) y exporta `POJAV_BIG_CORE_AFFINITY=1` (`Launcher.kt:419`). Pero nadie llama a `bigcore_set_affinity()` (`jni/bigcoreaffinity.c:20`): hoy la opción no hace nada.
- El Honor (TFY-LX3, Snapdragon 680 / SM6225) tiene 4 núcleos A53 a 1,9 GHz (cpu0-3) y 4 A73 a 2,4 GHz (cpu4-7).
- La función de upstream fija el hilo a UN solo núcleo (el último con la frecuencia máxima, cpu7). Si ese núcleo se calienta o lo ocupa otro hilo, el juego no puede moverse.
- En 1.7.10 el hilo del cliente hace la lógica y el render. Llama a `glfwMakeContextCurrent` en `jni/glfw_shim/glfw_shim.c:309`, que es código propio de DBR.

Paso 0, sin código (decide si vale la pena): con el juego en partida, muestrear durante 1 min en qué núcleo corre el `Client thread` (`ps -T -o tid,psr,pcpu,comm` sobre el proceso `:game`). Si ya va casi siempre en cpu4-7, el planificador de Android lo hace bien y B4 no aporta: se descarta, como pasó con A12.

Si el paso 0 muestra que el hilo cae en los A53:
1. `glfw_shim.c` (propio, sin tocar upstream): en el primer `glfwMakeContextCurrent`, si `POJAV_BIG_CORE_AFFINITY=1`, fijar el hilo a TODOS los núcleos con la frecuencia máxima (cpu4-7 en el Honor), no a uno solo. Una línea en el log con la máscara aplicada o el error.
2. La opción sigue apagada por defecto. Encenderla por defecto solo si la medición lo justifica.
3. Verificación: misma escena 2 min con la opción apagada y encendida. Mirar los FPS que escribe el juego, el núcleo del hilo (`ps -T`) y el calor (`dumpsys thermalservice`).

Riesgo: el móvil se calienta antes y puede bajar la frecuencia. Con la opción apagada no cambia nada.

### Método de medición de B4 (2026-11-11)
Lo hace Claude por adb, sin el usuario. Herramientas comprobadas:
- FPS: `/dbro bench S1 60 10` (DbrCore `Benchmark`, ya en el pack): 10 s de calentamiento y 60 s de grabación con la cámara quieta. Escribe CSV + JSON (media, p50, p99, 1 % low, tirones, GC) en `.minecraft/versions/DBR/dbroptimizer/bench/`; se baja con `adb pull`.
- Núcleo del hilo: `ps -T -o TID,PSR,PCPU,CMD -p <pid de :game>` cada 0,5 s durante la grabación; % de muestras del `Client thread` en cpu4-7.
- Calor: `dumpsys thermalservice` (Thermal Status y cpufreq) y `dumpsys battery` (temperature) antes y después de cada corrida.
- Escena: mundo de un jugador en el móvil, semilla fija, creativo, mismo punto y misma vista (`/tp`). No hay saves en el móvil y el servidor pide contraseña.
- Orden A-B-A-B (opción apagada/encendida), con el móvil a la misma temperatura de batería (±1 °C) al empezar cada corrida.
- Por confirmar en la práctica: escribir el comando en el chat con `adb shell input`.

## Bitácora (B4)
- 2026-11-11: paso 0 empezado y pausado por el usuario ("después lo probamos"). Sin código.
- Preparado en el Honor: mundo `saves/BenchB4` (copia de "Mundo nuevo" del PC, creativo con trucos), extraído con `tar` desde `adb shell` (`adb push` de una carpeta desde Windows la dejó vacía).
- Cómo entrar: el menú de DBR abre la lista de mundos con clic derecho en el icono de abajo a la derecha (~2331,1023). El launcher usa puntero virtual: el cursor se mueve 1:1 arrastrando (`input swipe`), y un toque hace clic izquierdo donde está el cursor, no donde se toca. El clic derecho sale del botón "Usar" del layout, que solo se ve dentro de la partida. Para la prueba se cambia a `visibilityType: always` en `files/control_layouts/dbr_layout.json` y al terminar se restaura (restaurado el 2026-11-11). Esc por adb no sale de la lista de mundos.
- Para el bench: el juego tiene `maxFps:60` (la barra del launcher marcaba ~30 FPS en el menú); quitar el tope antes de comparar con la opción apagada y encendida.

## Siguiente paso
- Retomar B4 paso 0 cuando el usuario lo pida.
- Pendiente: probar el cambio de idioma ES/EN/PT en el móvil (A0) y hacer push del launcher.
