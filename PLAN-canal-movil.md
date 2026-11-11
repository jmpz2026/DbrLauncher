# Plan: canal móvil juego ↔ launcher + autocompletado de comandos

## Contexto

Un usuario de Android reporta que el teclado tapa la barra del chat. El launcher ya sabe subir el juego lo justo
(`VMActivity.kt`, `absoluteOffset` + `inputArea`), pero `inputArea` solo lo llena el mod TouchController (versiones
modernas, socket Unix). En 1.7.10 nadie lo llena. La solución de raíz es la misma que usan las versiones nuevas: el
juego informa al launcher dónde está el campo con foco. A partir de ese canal, el usuario pidió sumar más funciones
(controles según el contexto, vibración, texto sincronizado, autocompletado de comandos en PC y móvil, frases rápidas,
calor/batería, muesca, escala táctil, links, notificaciones y ajustes en partida). Requisito transversal: **seguro, no
explotable**.

## Decisiones globales

- **Entrega: todo junto**, en un solo release coordinado (launcher + DbrCore + DbrCorePlugin + modpack). Internamente, commits por bloque, en el orden de la sección "Pasos".
- El parche actual sin commit (`VMActivity`: campo abajo + medición del teclado por área visible) **se queda como respaldo**.
- No se migra la pantalla completa a `WindowInsetsController`.
- Lado juego: **DbrCore**, paquete `dbr.machitos.core.movil`, activo solo con `-Ddbr.movil.canal=1` (lo pone el launcher en `LaunchArgs.kt:217`) **y** la clase del canal presente. En PC no carga nada. El autocompletado (bloque C) **sí** funciona también en PC.
- Lado servidor: **DbrCorePlugin**, módulo nuevo `corelib.comandos`. **DbrAntiCommand se absorbe y se retira** (migración automática de su config).
- Valores por defecto aprobados: **encendido** mover sobre el teclado, controles por contexto, vibración (60%; combate, ki y avisos encendidos; mundo apagado), texto sincronizado, autocompletado, chips, avisos de calor y batería, muesca, escala automática la primera vez, confirmar links, notificaciones. **Apagado pero funcionando:** giroscopio. El permiso de notificaciones (Android 13+) se pide la primera vez que el jugador minimiza el juego, con una explicación.

## A. Canal (base de todo)

- Juego → launcher: `GLFW.dbrSend(int tipo, byte[] datos)` en el stub `LWJGL2Bridge/.../org/lwjgl/glfw/GLFW.java` (mismo patrón que `nDbrWindowAttrib`). `org.lwjgl.` está excluido del `LaunchClassLoader` (se verifica en el paso 1).
- Native en `jni/glfw_shim/glfw_shim.c` (registro en `JNI_OnLoad`); llama a Android como `set_grabbing()`: `CallbackBridge.onDbrMessage(int, byte[])` (methodID cacheado en `input_bridge_v3.c` + `environ.h`).
- Launcher → juego: ring buffer en C (32 mensajes) que el juego vacía con `GLFW.dbrPoll()` en su tick.
- Formato: tipo + bytes, primer byte = versión de protocolo (`PROTO=1`), big-endian. Spec en `docs/canal-movil.md`.
- Kotlin: `game/support/canal_movil/CanalMovil.kt` (parser, validación, rate limit, despacho a cada función).
- Tipos: `HOLA`/`HOLA_ACK`, `AREA_TEXTO`, `ESTADO`, `VIBRAR`, `TEXTO_*`, `SUGERENCIAS`, `AVISO_SISTEMA` (calor/batería), `PANTALLA` (muesca, pulgadas, DPI), `ABRIR_URL`, `NOTIFICAR`, `AJUSTES`.

### Reglas de seguridad (obligatorias)
1. C: largo máximo 256 B (texto sincronizado: 1 KB), chequeado con `GetArrayLength` antes de copiar a un buffer fijo; la cola acotada descarta lo viejo.
2. Kotlin: lista blanca de tipos, largo exacto, floats finitos recortados a 0..1, strings UTF-8 válidos sin controles, rate limit por tipo (el exceso se descarta y se loguea una vez), versión distinta = canal apagado.
3. Ningún payload se interpreta como ruta, intent, comando o código. La única URL posible pasa por el validador de links (G).
4. DbrCore: todo con try/catch y nunca tumba el cliente; valida igual lo que llega del launcher; nada del canal se reenvía al servidor; los paquetes del servidor nunca pasan crudos al canal.
5. Actualizar `SECURITY_MODEL.md` (launcher) y el modelo de seguridad de DbrCorePlugin.

## B. Posición del campo de texto (reporte original)
- `DetectorCampo` (DbrCore), en `ClientTickEvent` END, en este orden: `TextInput` de DbrCore (hook en `core/ui/TextInput.java`), búsqueda de NEI (reflexión, si está cargado), `GuiTextField` con foco en la pantalla y sus superclases (cubre `GuiChat` y el yunque; nombres SRG con `ObfuscationReflectionHelper`; cache por clase), `GuiEditSign` (líneas), `GuiScreenBook` sin firmar (página 192×192).
- Rect normalizado con `ScaledResolution`, se manda solo si cambia.
- Launcher: `GameHandler.inputArea` = área de TouchController si existe, si no la de `CanalMovil` en píxeles. Movimiento "lo justo" (lógica actual).

## C. Autocompletado de comandos (PC + móvil) y chips (puntos 6 y 7)
**Servidor — `DbrCorePlugin/corelib.comandos`:**
- Absorbe DbrAntiCommand: `allowed-commands`, `blocked-commands`, filtro del Tab por ProtocolLib (`softdepend`). Se migra `plugins/DbrAntiCommand/config.yml` la primera vez y se retira el plugin del servidor.
- Árbol por jugador, enviado al entrar y al cambiar de permisos o de estado ocupado: nombres, alias y permisos se leen **solos** de Bukkit; el detalle de argumentos sale de un YAML con sintaxis de uso, por ejemplo `pay: "<jugador:online> <cantidad:numero>"`, `home: "[home:homes]"`. Tipos fijos: `online`, `numero`, `texto`, `lista(a|b)` y dinámicos registrados (`homes`, `warps`, `clanes`...). Recarga con `/dbrcore reload`.
- Filtro: (en el árbol o en `allowed`) ∩ permiso del jugador ∩ fuera de `blocked-commands` ∩ no bloqueado ahora por `corelib.ocupado.ComandosBloqueados` (actualización en vivo al entrar y salir del estado).
- Chips por defecto: config `chips-moviles` ∩ permitidos ∩ permisos, **excepto** la lista fija de riesgosos (nunca chip, sí autocompletado): pay, basura, restablecer, redistribuir, unificar, delhome, subastar, venderrs, comprarrs, reparar, ritualiniciar, deathnote, cambiarstats, autoventa, ruletapuntos, bonustickets, darpoder, darpoderu.
- Semilla de `chips-moviles`: spawn, home, homes, warps, tpaccept, tpdeny, bal, misiondiaria, consultarstats, poder, kits, mercado, coordenadas, dudas, menu, guia, tutorial, mascotas, maestrias, clan, playtime, estadisticas, report. Se verifica contra la config real de producción al desplegar.
- Envío por `DbrChannel` + `PacketWriter`; texto plano (sin `§`, sin saltos de línea, con largo máximo).

**Cliente — DbrCore (todas las plataformas):**
- Popup sobre la barra del chat como en las versiones nuevas: hasta 10 filas con scroll, Tab/flechas para moverse, Tab acepta, Esc cierra. Ayuda de uso en gris después del cursor; un argumento inválido se marca en rojo. Estilo con la paleta Dbr.
- Fuentes: árbol del servidor, jugadores conectados (argumentos `online` y `@` en el chat normal), historial (lo usado primero), valores dinámicos. Lo que el árbol no conoce usa el Tab vanilla después de 300 ms sin escribir, con máximo 3 pedidos por segundo.
- Móvil: el popup se toca. Fila de chips sobre el teclado con el chat abierto (frases a la izquierda, sugerencias al escribir). El jugador agrega, edita y ordena sus frases (guardadas en el cliente). **Tocar un chip solo escribe, nunca envía.**

**Auditoría `plugin.yml`** (todos los plugins Dbr, en un subagente): comandos sin permiso, `default: true` indebidos, alias que pisan a otros plugins, comandos de staff sin op, comandos fantasma. Primero se entrega un informe con severidad; los arreglos se hacen con el OK del usuario, un commit por plugin.

## D. Controles según el contexto (punto 1)
- `ESTADO` (juego → launcher, solo cuando cambia): DBC **cargando ki** y **transformando**; pantalla abierta: **chat / contenedor / pantalla Dbr (UiScreen) / pausa-otra**.
- Lector DBC: mover `DbrCamaraMod/.../client/Dbc.java` a DbrCore como `dbr.machitos.core.dbc` (público); DbrCamaraMod pasa a usarlo.
- LayerController: `VisibilityType` (ALWAYS/IN_GAME/IN_MENU) se amplía con listas "mostrar si cualquiera de" / "ocultar si cualquiera de" sobre esos estados. Se editan en el editor de controles; el layout oficial Dbr viene con condiciones puestas.
- Transición con fundido de ~120 ms. Un botón que se está tocando no desaparece hasta soltarlo.

## E. Vibración (punto 2)
- El juego manda `VIBRAR(idEvento, fuerza 0..1)`. Eventos: combate (golpear, recibir daño), ki y formas (soltar ki, transformarse, choque de ki), mundo (romper bloque, caída), avisos (privado, mención, nivel, premio del gacha).
- Patrones en un JSON del modpack (`DBR-ASSETS`, firmado P-256 y verificado por hash en `DbrSync`). Un id desconocido usa el patrón genérico.
- Topes **en código**, que el JSON no puede superar: duración máxima por patrón, pulsos máximos, separación mínima y máximo por segundo; el exceso se junta o se descarta.
- Ajustes: interruptor general + intensidad + interruptor por categoría. Solo el teléfono, no el mando. Reusa `VibrationHandler`.

## F. Texto sincronizado (punto 3) — solo chat y comandos
- `TEXTO_ESTADO` en los dos sentidos (texto, selección, composición), modelado sobre `TouchControllerInputConnection` en `TouchController.kt`.
- Funciones: autocorrector y predicciones, mover el cursor y seleccionar, copiar y pegar, dictado por voz.
- El launcher filtra y corta: límite de 100 caracteres y caracteres que la fuente no soporta (emojis) informados por el juego. El juego valida igual. Nunca envía el chat por su cuenta.

## G. Links (punto 11)
- DbrCore intercepta la apertura de links en Android y manda `ABRIR_URL`. El launcher acepta solo http/https, muestra un diálogo propio con el dominio real (punycode visible) y marca como verificados los dominios de confianza (Discord, web y tienda Dbr).
- `ZLNativeInvoker.openLink`: pasa por el mismo validador y diálogo, y se **quita todo el soporte de `file:`** (incluye el compartir archivos).

## H. Calor y batería (punto 8)
- Launcher → juego `AVISO_SISTEMA`: estado térmico (`PowerManager.getCurrentThermalStatus`, API 29+) y batería al 15% y al 5% si no está cargando (una vez por umbral).
- Solo avisa: toast de DbrCore. El aviso de calor trae un botón "Reducir" que baja resolución (launcher), partículas y VFX (DbrVfxMod en modo bajo) y distancia de render; otro toque lo deshace. Si no se toca, no cambia nada.

## I. Muesca y escala (puntos 9 y 10)
- Launcher → juego `PANTALLA`: zonas de `DisplayCutout`/esquinas normalizadas, pulgadas y DPI. Se reenvía al rotar o cambiar de tamaño.
- Muesca: el juego sigue a pantalla completa; el HUD Dbr (`core.hud`) y las `UiScreen` dejan margen de ese lado.
- Escala: `guiScale` vanilla, mínimo táctil de `UiScreen` en milímetros (~9 mm) y escala del HUD Dbr. Se aplica automática la primera vez en cada teléfono; si el jugador la cambia a mano, se respeta.

## J. Notificaciones (punto 13)
- Plugins mandan un paquete "notificable" (categoría + texto corto) por `DbrChannel`. Privados y menciones se detectan en el cliente. DbrCore manda `NOTIFICAR` solo si la app está en segundo plano. Nunca se notifica texto arbitrario del chat.
- Categorías = canales de Android: privados y menciones, eventos del servidor, peligro del personaje (ataque o poca vida), AFK y desconexión.
- Pantalla bloqueada: sin texto ("Nuevo mensaje privado"). Agrupadas por categoría, máximo una alerta con sonido cada 30 s por categoría; el resto actualiza en silencio. Se publican desde `GameService` (proceso `:game`, ya en primer plano). Tocar la notificación vuelve al juego.

## K. Menú en partida (puntos 14 y 15)
- El giroscopio y el menú ya existen (`GyroscopeReader.kt`, `GameMenuSubscreen.kt`); se revisa que funcionen en 1.7.10. Giroscopio apagado por defecto.
- Se agrega al menú: resolución en caliente (vía `refreshWindowSize`, sin reiniciar) y una sección Dbr con vibración, avisos de calor y batería, chips y escala táctil.

## L. Mando en PC (Windows/Linux) y Android
Referencia: Controlify (1.19.4+, SDL3); para 1.7.10 no existe nada equivalente.
- **Módulo `dbr.machitos.core.mando` en DbrCore**, con el mismo comportamiento en las tres plataformas.
  - Backend PC: **Jamepad 2.x** (fork libgdx, SDL2, Java 8, natives Windows/Linux, conexión en caliente, vibración, giroscopio vía sensores de SDL2). Natives extraídas a la carpeta del juego al iniciar. Licencias: Apache 2.0 + zlib en `CREDITOS.txt` (skill dbr-licencias).
  - Backend Android: el launcher manda el estado crudo (botones, ejes, tipo de mando) por el canal (`MANDO_ESTADO`, juego ← launcher) y la vibración vuelve por el canal. El remapeo de ZL2 (`ui/control/gamepad/*`) queda solo para juegos sin DbrCore (sin `HOLA` del juego).
- Entrada mixta con cambio automático: los iconos siguen al último dispositivo usado; en Android, con el mando se esconden los controles táctiles (queda el botón de menú) y vuelven al tocar la pantalla.
- Funciones:
  - Navegación de menús: en `GuiContainer` el cursor salta de slot en slot; en `UiScreen` hay foco por control con anillo visible.
  - Teclado en pantalla QWERTY con ñ (es/en/pt según dbr-idiomas), con chips y autocompletado arriba. X borra, Y pone espacio, Start envía, los gatillos mueven el cursor.
  - Menú radial (hasta 8): técnicas DBC 5-8 y utilidades (F5, F2, lista de jugadores, ocultar HUD). Configurable con cualquier keybind.
  - Guía de botones contextual en pantalla.
  - Combate estilo Sparking Zero: RT golpear, LT guardia, A saltar/subir, B dash, X ki básico, Y mantener para cargar, LB + botón frontal = técnicas 1-4, RB radial, clic izquierdo volar, clic derecho lock-on. La cruceta izq/der cambia el slot de la hotbar. Transformar con combinación. Subir/bajar volando. Todo manda las mismas teclas que el teclado (el servidor valida igual que hoy).
  - Vibración del mando (mismo catálogo y topes del bloque E), giroscopio del mando y flick stick.
- Iconos según el mando detectado (Xbox / PlayStation / Switch / genérico), en pixel art propio sin logos de marca: atlas nuevo con mc-pixel-art.
- Ajustes en una pantalla `core.ui` dentro del juego (desde Opciones y desde el radial): perfiles por mando, remapeo, zonas muertas, sensibilidad, giroscopio, flick stick, vibración y prueba de botones en vivo.
- Defaults tipo consola: encendidos navegación, guía, vibración y ayuda de foco en menús; apagados giroscopio y flick stick; zona muerta 10%, sensibilidad media, Y sin invertir.
- Launcher PC (Electron, rama `main` del repo DbrLauncher): navegación básica con la Gamepad API (moverse entre botones, A = Jugar, iconos del mando). Steam Deck: sin perfil especial, se trata como Linux genérico.

## M. Lock-on de Ki Sense rehecho (todas las plataformas)
Estado actual (según la investigación): `JRMCoreCliTicH.lockOn` es solo del cliente, se activa con la tecla Z, requiere Ki Sense > 0 y `JRMCoreConfig.lockon`, elige con un rayo de 35 bloques y gira la cámara de golpe cada frame. El ki guiado de KI UPDATE E2.1 (`DbrKiMod` `GuiadoCliente`/`Guiado`) depende de ese campo.
- El nuevo lock-on **reemplaza la cámara y la selección del de DBC**, pero **escribe el mismo campo `lockOn`**: el render de Ki Sense y el ki guiado siguen sin cambios (topes de KI UPDATE intactos). Se respeta `JRMCoreConfig.lockon` y el borrado de `lockOn` en las cinemáticas (`CineCliente`).
- Requisito: Ki Sense aprendido. Objetivos: NPCs y jefes, mobs, y jugadores solo donde el PvP está activo.
- Cámara suave (~80 ms) que nunca deja al objetivo fuera de la mira. **El golpe es como hoy** (vanilla, sin tolerancia ni alcance extra).
- Elegir: el más cercano a la mira. Cambiar de objetivo: stick derecho (mando), rueda del mouse (PC), deslizar sobre el botón de lock o tocar un enemigo (táctil).
- Se suelta solo: fuera de rango (el de Ki Sense), sin línea de vista por más de ~1 s, objetivo muerto, o al abrir un menú.
- Servidor (DbrKiMod, junto a `Guiado`): el cliente avisa al fijar o cambiar de objetivo. El servidor valida Ki Sense, rango, línea de vista y PvP de la zona, y es lo que habilita el contrapeso:
  - **Aviso al fijado**: el jugador fijado ve un indicador mínimo de "te fijaron".
  - **Ki oculto**: con la liberación de poder por debajo del **5%** no te pueden fijar (ni al elegir objetivo, ni se mantiene el lock). El servidor no acepta el lock y el cliente lo suelta.
- Visual: solo el de Ki Sense de DBC; no hay marcador nuevo para el que fija.
- Verificar con DbrAntiCheat (`KillAuraCheck`, check de ángulo) que la cámara suave no da falsos positivos.

## Pasos
0. Copiar este plan a `PLAN-canal-movil.md` en el worktree con bitácora y apuntar el `CLAUDE.md` a él.
1. Verificar la exclusión `org.lwjgl.` en el `LaunchClassLoader` y el enganche de links de `GuiChat` en 1.7.10.
2. A: canal (C, stub, CallbackBridge, `CanalMovil` + `CanalMovilTest`) y G: hueco de links.
3. B: detector de campo + `GameHandler` + flag en `LaunchArgs` + commit del respaldo.
4. C: `corelib.comandos` (migración de DbrAntiCommand, árbol, filtros, chips) + popup en DbrCore + chips en el launcher. Auditoría `plugin.yml` en paralelo (subagente → informe → OK del usuario).
5. D + E: `core.dbc`, estados, `VisibilityType` ampliado, editor, layout oficial; catálogo de vibración.
6. H + I + K: avisos del sistema, muesca, escala, menú.
7. J: notificaciones.
8. F: texto sincronizado.
8b. L: `core.mando` (Jamepad + backend del canal Android, navegación, teclado en pantalla, radial, guía, iconos, ajustes) + navegación con mando en el launcher Electron.
8c. M: lock-on nuevo (cliente en DbrCore/DbrKiMod, validación y ki oculto en el servidor, aviso al fijado, prueba con DbrAntiCheat).
9. Docs: `docs/canal-movil.md`, `SECURITY_MODEL.md`, índice "Detalle por tema" de DbrCore y DbrCorePlugin.
10. Prueba completa en teléfono y en PC, y release coordinado: launcher `android-v30` + DbrCore + DbrCorePlugin + modpack (JSON de vibración, layout); retirar DbrAntiCommand de producción.

## Verificación
- Launcher: `compileDebugKotlin`, tests JVM (`CanalMovilTest`: tipos desconocidos, largos malos, NaN, rate limit; validador de URL: `file:`, `javascript:`, punycode; parser de patrones con topes), `assembleDebug` con `subst` para el `.so`.
- DbrCore / DbrCorePlugin: `gradlew build` / `mvn package`; dbr-test quick + medium; cliente de prueba en PC: popup de autocompletado, log "módulo móvil apagado", sin errores.
- Servidor de pruebas (nunca producción): la config migrada de DbrAntiCommand bloquea lo mismo; un jugador sin permisos no ve comandos de staff; un comando bloqueado o "ocupado" no aparece; el Tab sigue filtrado.
- Teléfono: chat, yunque, cartel, libro, NEI y pantalla Dbr con el teclado; botones según el estado (cargar ki, chat, inventario); vibraciones por categoría; autocorrector y voz en el chat; chips (escribir sin enviar); link con diálogo y `file:` rechazado; aviso de calor (simulado) con "Reducir"; HUD apartado de la muesca; escala la primera vez; notificaciones con la app minimizada; resolución en caliente.
- Mando: Xbox y PlayStation en Windows y Linux (conexión en caliente, iconos correctos, radial, teclado en pantalla con el chat, cursor que salta entre slots, foco en `UiScreen`, vibración, giroscopio); el mismo mando por Bluetooth en Android (los controles táctiles se esconden y vuelven); el launcher Electron se navega con el mando.
- Lock-on: con y sin Ki Sense; cambio de objetivo en las tres entradas; se suelta en cada condición; jugador con liberación < 5% no fijable; aviso al fijado; ki guiado sigue igual; sin falsos positivos de DbrAntiCheat en el servidor de pruebas.
- Abuso: mod de prueba que manda tipos raros, payloads de 10 KB, 1000 mensajes/s, vibración de 10 s y URLs `file:`/`intent:`: todo se descarta sin crash ni bloqueo.

## Bitácora

- 2026-11-10: plan armado y aprobado (preguntas por punto: canal, campo de texto, autocompletado, chips, controles por contexto, vibración, texto sincronizado, links, calor/batería, muesca, escala, notificaciones, menú, mando, lock-on). Parche de respaldo en VMActivity hecho y compilado, sin commit.

- 2026-11-10: paso 1 verificado (launchwrapper 1.12 excluye `org.lwjgl.`; links de GuiChat se interceptan con GuiOpenEvent sobre GuiConfirmOpenLink).
- 2026-11-10: paso 2 + parte launcher del paso 3 hechos (commit bcb6674): dbr_canal.c (cola 32, tope 1024 B), natives nDbrSend/nDbrPoll en glfw_shim, GLFW.dbrSend/dbrPoll, CallbackBridge.onDbrMessage/nativeDbrPush, CanalMovil/Protocolo/LimiteRitmo/UrlSegura, openLink sin file: y con dialogo, flag -Ddbr.movil.canal=1, VMActivity usa el area del canal. 13 tests JVM ok, assembleDebug ok. Falta: dominios web/tienda Dbr en UrlSegura.DOMINIOS_CONFIANZA.

- 2026-11-10: paso 3 lado juego hecho (DbrServerPack b0e686ae): `core.movil` (Canal, Movil, DetectorCampo, CampoActivo), hook en TextInput, dueno = ClientProxy de DbrMod. Compila. Sin probar en telefono.
- 2026-11-10: paso 4, lado servidor hecho (DbrCorePlugin d168103): `corelib.comandos` (FiltroComandos con migracion de DbrAntiCommand, FiltroTab por ProtocolLib, Autocompletado por canal `DBRCMD`, PatronUso). Claves bloqueadas con prefijo se comparan exactas, como antes. 138 tests ok. Auditoria plugin.yml entregada en `AUDITORIA-plugin-yml.md` (0 alta, 6 media, 46 baja), arreglos pendientes del OK del usuario.
- 2026-11-10: paso 4, lado cliente hecho (DbrServerPack 31bb5fa8): `core.comandos` (Comandos, ChatAutocompletado extends GuiChat via GuiOpenEvent, Sugeridor puro + Patron, 9 tests). Dueno DbrMod ClientProxy. DbrMod compila. Sin probar en juego.
- 2026-11-11: diseno de chips aprobado: `SUGERENCIAS` (tipo 3, juego -> launcher, hasta 12 chips + 10 sugerencias de 32 B), `INSERTAR` (tipo 102, launcher -> juego, modo 0 escribe en el cursor / 1 acepta sugerencia, 100 caracteres, nunca envia), `CAP_CHIPS = 1<<2`, frases en SharedPreferences (20 x 100). Auditoria: el usuario aprueba arreglar M1, M2, M3, M4 y M6 (M5 queda como documentacion).

- 2026-11-11: chips hechos. Launcher a6bb973 (`SUGERENCIAS`/`INSERTAR`, `FrasesMovil` en `dbr_frases.txt`, `FilaChipsDbr` sobre el teclado; el juego sube lo que mide la fila). DbrCore f33d1fdf (`core.movil.ChipsMovil`, `ChatAutocompletado` publica y recibe). 16 tests launcher + 4 DbrCore ok, DbrMod compila. Sin probar en telefono.
- 2026-11-11: auditoria aplicada (subagente, sin push): DbrStaff f90112f, DbrBendicion 75f8276, DbrLogros 8433574, DbrPlugin ad55a3a, DbrPoder bf32c66, DbrBattlePass 16659bc, DbrQuestion 46e7975. Antes de desplegar: dar `dbrbendicion.admin`/`dbrlogros.admin` a quien hoy tiene `Admin` y `dbrpoder.dar` a quien usa /darpoder (o activar `permiso-admin-legado`). `dbrpoder.poderu` solo declarado.

- 2026-11-11: todo empujado. Desplegado en TESTEO (DbrServerPack, DbrCorePlugin y los 7 plugins de la auditoria, con `.bak-20261111-chips`; DbrAntiCommand retirado como `.jar.bak-20261111-absorbido`), en el cliente PC (`dbr-launcher/game/mods`) y en DBR-ASSETS experimental (65591fe). APK debug 2.4.10 compilado.

## Siguiente paso

Paso 4 queda pendiente solo de pruebas: en el servidor de pruebas, que la config migrada de DbrAntiCommand bloquee lo mismo; en el telefono, chips y frases (escribir sin enviar). Luego paso 5: D + E (`core.dbc`, estados, `VisibilityType` ampliado, editor, layout oficial, catalogo de vibracion).
