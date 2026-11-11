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
