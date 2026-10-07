# Parches al upstream vendorizado (ZalithLauncher2)

Cambios propios sobre la fuente de ZalithLauncher2 (`UPSTREAM.txt` = commit base).
Mantener esta lista al día para poder re-aplicar tras sincronizar upstream.

## 1) `formatted="false"` en strings multi-sustitución (2026-07-22)
**Motivo:** AAPT2 de `build-tools;37.0.0` trata como ERROR los strings con múltiples `%`
no posicionales (`Multiple substitutions specified in non-positional format`). El upstream
no compilaba con build-tools 37 sin esto.

**Cambio:** añadido `formatted="false"` a estos dos strings en los 23 archivos de recursos
(`values/` y todos los `values-*/`):
- `terracotta_notification_desc` (`.../res/**/terracotta.xml`)
- `file_invalid_length` (`.../res/**/strings.xml`)

Inocuo en runtime (siguen usándose con `String.format` posicional en orden).

## 2) Rebrand DbrLauncherMobile + aviso legal (2026-07-22)
**Motivo:** Fase 2 — marca DBR y cumplimiento de los Términos Adicionales §7 de la GPL-3
de ZalithLauncher2 (renombrar, no usar "ZalithLauncher"/"ZL", mostrar "Unofficial Modified
Version" en arranque, conservar avisos de copyright).

- `ZalithLauncher/gradle.properties`: `launcher_name=DbrLauncherMobile`,
  `launcher_app_name=DbrLauncher Mobile`, `launcher_short_name=DBR`,
  `url_home=https://dragonblock.online`.
- `ZalithLauncher/build.gradle.kts`: `applicationId = "online.dragonblock.launchermobile"`,
  eliminado `applicationIdSuffix = ".v2"`. **namespace interno sigue** `com.movtery.zalithlauncher`
  (NO se refactoriza el paquete de código; evita romper R/BuildConfig).
- Aviso "Unofficial Modified Version" en la pantalla de arranque
  (`ui/screens/splash/SplashScreen.kt`, bajo el nombre del launcher) + string
  `unofficial_modified_version` en `values/strings.xml`.
- Icono adaptive → logo DBR: `drawable-nodpi/dbr_logo.png` (copia de `build/icon.png`),
  `mipmap-anydpi-v26/ic_launcher*.xml` foreground → `@drawable/dbr_logo`, fondo
  `ic_launcher_background=#101014`, quitado `monochrome` (era silueta ZL). Los webp legacy
  quedan sin usar (minSdk 26 usa siempre el adaptive). *Icono básico; refinar padding/monochrome después.*
- Avisos de copyright de upstream (cabeceras de archivos, LICENSE, README) **conservados**.

## 3) Recortes por feedback de dispositivo (2026-07-22)
**Motivo:** primeras pruebas en Android real; quitar lo que no aplica a un server 1.7.10.

- **Solo Java 8**: `SplashActivity.initUnpackItems()` desempaqueta únicamente `Jre.JRE_8`
  (antes `Jre.entries`); eliminados los assets `assets/runtimes/jre-17|jre-21|jre-25`.
  El enum `Jre` se deja intacto (evita romper referencias); esos runtimes nunca se usan
  porque el server es 1.7.10 (Java 8).
- **Sección "Descargar" oculta**: quitado el `TopBarRailItem` de Download en
  `ui/screens/main/MainScreen.kt` (el destino `NestedNavKey.Download` queda inalcanzable).
- **Login**: en `ui/screens/content/elements/AccountElements.kt` (`LoginMenuDialog`):
  - Offline (Local) sigue funcional.
  - Microsoft → muestra Toast `dbr_login_not_available` ("Inicio de sesión no disponible por ahora"),
    no inicia el flujo (falta OAuth client id; se implementará después).
  - Ocultada la columna de servidores de autenticación externos (solo 2 opciones).

## 4) Renderizador LTW integrado (2026-10-07)
**Motivo:** el modpack experimental lleva Angelica, que en Android solo arranca con LTW, y
ZalithLauncher no trae LTW.

- `jniLibs/<abi>/libltw.so`: LTW sin modificar (LGPL-3.0), origen y receta en
  `android/third_party/LTW/README.md`.
- `game/renderer/renderers/LTWRenderer.kt` (`opengles3_ltw`, librería y EGL `libltw.so`),
  registrado en `Renderers.init`.
- `GameLauncher.setRendererEnv`: LTW queda fuera de las variables de Mesa/Zink, igual que GL4ES.

## 5) Reloj monótono para LWJGL 2 (2026-10-07)
**Motivo:** `Sys.getTime()` de lwjglx (lo que usa `Minecraft.getSystemTime()` en 1.7.10) lee
`GLFW.glfwGetTimerValue()`, que devolvía `System.currentTimeMillis()`: la hora del sistema, que
Android ajusta a saltos. Con un salto, el timer de ticks de Minecraft se frenaba y las animaciones
de GUI se disparaban (la rueda de formas de npcdbc quedaba trabada como una capa negra).

- `LWJGL/src/main/java/org/lwjgl/glfw/GLFW.java`: `glfwGetTimerValue()` devuelve milisegundos
  monótonos (origen en la hora del sistema al cargar la clase, avance con `System.nanoTime()`);
  `glfwGetTimerFrequency()` devuelve 1000 (antes 60, marcado como FIXME en upstream).
- Recompilado `assets/components/lwjgl3/lwjgl-glfw-classes.jar` (`./gradlew LWJGL:jar`, JDK 17+).

## 6) GLFW tolera punteros de ventana desconocidos (2026-10-07)
**Motivo:** `Display.destroy()` de lwjglx quita la ventana del mapa de GLFW pero conserva
`Display$Window.handle` y deja el display como creado: el `Display.create()` siguiente no hace
nada y el juego sigue llamando a GLFW con un puntero que ya no está ("No window pointer found"
al capturar el ratón). Lo provocaba el sondeo de versiones GL de Angelica en el primer arranque.

- `LWJGL/src/main/java/org/lwjgl/glfw/GLFW.java`: `internalGetWindow()` ya no lanza con un
  puntero desconocido; usa la ventana principal (`mainContext`), o la última registrada, o
  registra el puntero con las propiedades por defecto (`newWindowProperties()`, extraído de
  `mglfwCreateWindow`). Avisa una vez por stdout. `glfwDestroyWindow()` comprueba con
  `containsKey` para no borrar la ventana principal por el fallback.
- Recompilado `assets/components/lwjgl3/lwjgl-glfw-classes.jar`.

## 7) Iconos en los botones de control (2026-10-07)
**Motivo:** el layout por defecto de DBR usa botones con icono y nombre, como los controles de un
juego móvil. ZL2 solo pintaba texto.

- `LayerController/.../data/NormalData.kt` y `observable/ObservableNormalData.kt`: campo opcional
  `icon` (id de icono, `null` por defecto). Los layouts sin `icon` no cambian, y un launcher viejo
  ignora el campo (`ignoreUnknownKeys`). El editor no permite elegir icono, pero lo conserva al guardar.
- `LayerController/.../data/ButtonIcons.kt`: mapa id → drawable. Un id desconocido se ignora.
- `LayerController/src/main/res/drawable/ctl_icon_*.xml`: Material Symbols Outlined (Apache 2.0),
  convertidos desde los SVG de `google/material-design-icons`. El id es el nombre del símbolo.
- `LayerController/.../layout/Buttons.kt` (`TextButton`): si el botón tiene icono, lo pinta encima
  del texto, con el color del contenido y a escala del botón.
- Layout: `android/tools/dbr-layout.py` escribe `assets/default_layout.json`.

## 7) LWJGL 2.9.4 nativo para 1.7.10 (2026-10-07)
**Motivo:** con LWJGL 3 + lwjglx (capa que imita LWJGL 2) aparecieron muchos fallos propios de la capa
(buffers empaquetados, ventana destruida que queda "creada", servicios de Celeritas en bucle). 1.7.10 y sus
mods estan escritos para LWJGL 2; ahora corren sobre LWJGL 2.9.4 real, el mismo camino que en PC.

- `assets/components/lwjgl2/`: `lwjgl.jar` y `lwjgl_util.jar` de MojoLauncher/lwjgl2-glfw (release vv8m,
  licencia BSD en `LICENSE-lwjgl2.txt`), y `dbr-lwjgl2-bridge.jar` (modulo `LWJGL2Bridge`, se genera con
  `./gradlew LWJGL2Bridge:jar`): `-javaagent` que carga `pojavexec` y `glfw` en la JVM del juego y trae la clase
  `org.lwjgl.glfw.GLFW` minima que pide el `JNI_OnLoad` de pojavexec. Componente nuevo `Components.LWJGL2`.
- `jniLibs/{arm64-v8a,x86_64}/liblwjgl64.so`: nativos de lwjgl2-glfw vv8m. Los de 32 bits (`liblwjgl.so`) no se
  incluyen: chocan de nombre con el nativo de LWJGL 3.
- `jni/glfw_shim/glfw_shim.c` -> `libglfw.so` (modulo `glfw` en `Android.mk`): las 38 funciones GLFW que importa
  `liblwjgl64.so`, sobre el puente EGL y la cola de input de pojavexec. Fuerza la cola de eventos (los callbacks
  de lwjgl2-glfw usan el JNIEnv del hilo del juego), cursor virtual con offset para el modo captura, y entrega
  tamano/foco/visibilidad iniciales en el primer poll.
- `LaunchArgs.kt`: si el manifest trae `org.lwjgl.lwjgl:lwjgl:2.*`, el classpath usa `components/lwjgl2` en vez
  de `components/lwjgl3`, y se anaden `-javaagent:.../dbr-lwjgl2-bridge.jar` y `-Dorg.lwjgl.librarypath`.
- Compilar en Windows: ndk-build no acepta rutas con espacios; copiar `ZalithLauncher2` a una ruta sin espacios.
- CI: los tags `android-vN-rcM` publican el APK como prerelease sin tocar `version.json` (para probar a mano).

## 8) Un botón mantenido no se esconde al cambiar el cursor (2026-10-07)
**Motivo:** la rueda de formas de DBC (Y) se abre mientras se mantiene la tecla y es una pantalla:
al abrirse el cursor se libera y los botones `in_game` se esconden. El botón salía de la composición,
`ObservableNormalData.onCompositionDispose` soltaba la tecla y la rueda se cerraba al instante.

- `LayerController/.../Layout.kt` (`checkButtonVisibility`): un botón pulsado y no conmutable sigue
  visible y tocable hasta que se suelta el dedo; después se esconde según su `visibilityType`.
  Los conmutables (Transformar, Agacharse...) no cambian: siguen soltándose al abrir un menú.
