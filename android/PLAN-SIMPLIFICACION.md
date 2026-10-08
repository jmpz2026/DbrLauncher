# Plan: simplificar el launcher Android (2026-10-08)

Objetivo: que cualquier jugador pueda usar DbrLauncher Mobile sin perderse entre las ~90 opciones heredadas de
ZalithLauncher2. No hay "modo avanzado": todos ven lo mismo. Las opciones peligrosas siguen donde están para
quien sepa usarlas.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Motor por defecto | GL4ES (`8b52d82d-8f6d-4d3a-a767-dc93f8b72fc7`) en Completo y Ligero; LTW en Experimental. Solo instalaciones nuevas: los jugadores actuales conservan su motor. |
| Selector de motor | El chip "Motor" de la home abre Ajustes > Rendimiento. Se borra `RendererPicker` (sin uso). |
| Chip de mods | Real: al día / actualización disponible / sin verificar / sin instalar. |
| Auto-sync | Se quita el interruptor: el sync es siempre obligatorio. |
| Sin internet | Si los mods ya están instalados, se juega con aviso "No se pudieron verificar los mods". |
| Duplicados de controles | Ajustes finos (sensibilidades, tamaño del cursor, opacidad, retardo de pulsación larga) solo en el menú del juego. Ajustes > Controles solo lo básico. |
| Logs | Un botón "Reportar problema": .zip con log del juego + último crash + log del launcher y menú de compartir. |
| Terracotta | Fuera de la UI y fuera del APK (módulo eliminado del build). |
| Opciones peligrosas | Donde están ahora, sin avisos nuevos. |
| Java / versión | Sin cambios en sus opciones. |
| Modpack Experimental | Visible siempre, con su diálogo de confirmación. |
| Menú dentro del juego | Todo se queda menos Terracotta. |
| Cuentas | Offline + Microsoft visible pero desactivado ("Próximamente") hasta tener `OAUTH_CLIENT_ID`. Se quita el servidor authlib. |
| Pestañas | 5: Rendimiento · Juego · Controles · Mods · Ayuda. |

## Fases

### Fase 0: migración
- `AllSettings.dbrSettingsRevision` (Int). Al arrancar, si es menor que la revisión actual, se aplican una sola
  vez los valores fijos de las opciones eliminadas (Fase 3) y se sube la revisión.
- Instalación nueva = nunca hubo instancia DBR ni `.dbr_managed.json`: ahí se pone GL4ES.

### Fase 1: motor (puntos 2 y 3)
- Default de `AllSettings.renderer` = GL4ES para instalaciones nuevas.
- `DbrExperimental`: al salir del Experimental restaura el motor previo (comportamiento actual); si no había,
  GL4ES.
- Chip "Motor: X" de la home navega a Ajustes > Rendimiento. Borrar `RendererPicker` y su código muerto.

### Fase 2: chip de mods y sync (puntos 1 y 5)
- Al terminar bien un sync, guardar el commit del manifest (`DbrSync.headSha`) y la variante.
- La home consulta `headSha` en segundo plano y muestra: verde "Mods al día", amarillo "Actualización de mods"
  (se baja al Jugar), gris "Sin verificar" (sin red), "Sin instalar".
- Quitar `AllSettings.dbrAutoSyncMods` y su tarjeta: Jugar siempre sincroniza.
- Sync fallido por red + mods instalados = aviso y lanzar igual. Sin mods instalados = error como ahora.

### Fase 3: Ajustes (puntos 4 y 6)
Pestañas nuevas:
- **Rendimiento**: lo que hoy es Renderizador + calidad del modpack (Completo/Ligero/Experimental) + config
  recomendada.
- **Juego**: la pestaña Juego actual + Gestor de Java (opciones sin cambios), menos tamaño de fuente e
  intervalo de vaciado del log.
- **Controles**: lo básico (modo de ratón, joystick, giroscopio on/off e invertir ejes, teclado físico) +
  Gamepad + gestor de layouts como secciones.
- **Mods**: gestor actual, absorbe "Instalar mod (.jar)".
- **Ayuda**: "Reportar problema", Discord, Acerca de, licencias (obligatorio por GPL-3).

Eliminadas de la UI, con valor fijo aplicado por la migración:
- Efectos visuales (lag): easter eggs off, fondo/opacidad/video/blur off, animaciones en CLOSE.
- Página de inicio (tipo + editor `HomePageEditor`), mirrors (fuente oficial), retención de logs (valor fijo).
- Ajustes finos raros: 8 imágenes de puntero (default), muestreo y ventana de suavizado del giroscopio,
  tamaño de fuente y vaciado del log.

Duplicados: sensibilidades, tamaño del cursor, opacidad y retardo de pulsación larga salen de Ajustes > Controles
(quedan en el menú del juego).

### Fase 4: menú del juego y Terracotta
- Quitar la entrada de Terracotta del menú del juego.
- Eliminar el módulo `Terracotta` del build y sus referencias. Revisar créditos/licencias en Acerca de.

### Fase 5: cuentas
- Quitar "servidor de autenticación" (authlib) del alta de cuentas.
- Microsoft: visible, desactivado, con "Próximamente".

### Fase 7: pantalla de carga al pulsar Jugar
Pantalla del launcher encima del juego desde que se lanza hasta que el menú principal de DbrMod está abierto.
- Izquierda: logo RESURRECTION + skin 3D del jugador (reusa `ui/components/_PlayerSkin.kt`, skinview3d).
- Derecha: título, etapa actual con barra, consejos rotativos (DBR y controles) y botón "Cancelar inicio"
  (cierra el juego y vuelve al launcher).
- Etapas: Iniciando Java → Cargando Minecraft → Cargando mods → Preparando → Abriendo menú.
- Señal de fin y etapas: marcas fijas que escribe DbrMod (`DbrServerPack/DbrMod`) en el log:
  pre-init/init/post-init/load-complete y la primera apertura de `GuiDbrMainMenu` (`MainMenuHandler`).
  El launcher las lee del stdout del juego. Formato propuesto: `[DBR-LAUNCH] stage=<x>`.
- Respaldo si la marca no llega (pack viejo, crash): cerrar al terminar el proceso o al ver
  `Forge Mod Loader has successfully loaded` + timeout. El crash sigue mostrando la pantalla de error de ZL2.
- Se monta en lugar del cuadro `showGameInfo` de `GameHandler`/`GameScreen`.
- Orden de despliegue: primero DbrMod con las marcas (release del modpack en DBR-ASSETS), después el APK.

### Fase 6: prueba y release
- Cada fase: `compileDebugKotlin` + `processDebugResources` desde `C:\dev\dbr-src`.
- Al acabar 1–5: prerelease `android-vN-rcM` para probar en dispositivo, luego `android-vN`.
- Documentar en `VENDOR-PATCHES.md`.
