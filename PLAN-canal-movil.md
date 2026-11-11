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

- 2026-11-11: prueba en telefono (APK 2.4.10 + experimental). Dos fallas: (1) con bypass/op el popup mostraba los comandos internos de Skript (`?cambiodotps...`, `'`, `.s`); el usuario pide la regla mas escalable. Arreglado en DbrCorePlugin a54aa84: con bypass se ven los comandos de plugins con permiso, pero nunca los de Skript que no esten en `permitidos`/`uso`, los que empiezan con simbolo, ni la lista nueva `ocultos`; vale tambien para el Tab vanilla. Sin desplegar. (2) La fila de chips/frases no aparece. Formato de `SUGERENCIAS` coincide en los dos lados; sospecha: el saludo HOLA/HOLA_ACK no se completa. Falta logcat del telefono. Decision: las frases siguen funcionando solo con canal (sin respaldo por teclas); agregar "Frases" al menu en partida.

- 2026-11-11: causa de la fila de chips: en el telefono `core.movil apagado`. El `dbr-lwjgl2-bridge.jar` de assets era viejo (sin `DBR_CANAL_VERSION`/`dbrSend`/`dbrPoll`): nadie corria `:LWJGL2Bridge:jar` y `version` no cambiaba, asi que el telefono no re-extraia. Arreglo: `mergeAssets` depende de `:LWJGL2Bridge:jar`, jar reproducible y `version` = hash del componente. APK debug reinstalado por adb inalambrico. El canal nunca funciono en telefono: AREA_TEXTO, links y chips quedan por probar de nuevo.

- 2026-11-11: DbrCorePlugin a54aa84 desplegado en TESTEO (respaldo `.bak-20261111-skript`) y empujado; launcher fd8ff9d empujado. Falta probar en telefono: fila de chips/frases, campo de texto sobre el teclado y links.

- 2026-11-11: editor de frases sacado de la fila de chips (se cerraba con el teclado) y teclado reabierto al cerrarlo, launcher 6653138. Probado en telefono por el usuario: chips, frases, popup sin comandos de Skript, todo ok. **Paso 4 cerrado.**

- 2026-11-11: el usuario aprueba el paso 5 en dos partes (5a controles por contexto, luego 5b vibracion). Se empieza 5a.

- 2026-11-11: 5a hecho. Launcher 5c41855 (LayerController `dbrShowIf`/`dbrHideIf` en botones y capas, `EstadoDbr`, sin canal se ignoran; fundido 120 ms; boton apretado se queda aunque se oculte su capa; `ESTADO` tipo 4 + `CAP_ESTADO`; editor "Condiciones del juego" es/en/pt; 22 tests ok). DbrServerPack 52df0b64 (`core.dbc.Dbc` por reflexion, DbrCamaraMod lo usa; `core.movil.EstadoMovil`; 3 tests). Desvio: color del aura y vuelo de otros quedan en DbrCamaraMod (solo los usa la camara; DbrCore no compila contra DBC). Layout oficial v4: con cargando ki o transformando se ocultan Chat, Inventario y Rueda formas; con transformando, Destransformar. Experimental DBR-ASSETS aa00ed8 y APK instalado por adb. Falta prueba del usuario en telefono.

- 2026-11-11: prueba 5a en telefono: cargar ki ok, editor ok; transformar no ocultaba Destransformar porque `DBCKiTech.ascending` solo es true si DBC transforma de verdad. Arreglo DbrServerPack cc776ee4 (tambien lee el privado `holdingForTransform`, true tras 200 ms con la tecla), experimental e6ade8a.
- 2026-11-11: usuario confirma 5a en telefono. 5b hecho. Launcher 5ef8836 (`VIBRAR` tipo 5 = u8 largo + id ASCII `categoria.nombre` + u8 fuerza, `CAP_VIBRAR`; `Vibracion.kt` puro: catalogo, topes 250 ms/segmento, 600 ms total, 6 pulsos, 60 ms separacion, 6/s, el mas fuerte reemplaza; `VibradorDbr` con waveform; ajustes en Ajustes > Juego: general, intensidad 60% con vibracion de prueba, combate/ki/avisos encendidos, mundo apagado; 30 tests ok). DbrServerPack 9f9dc47a (`core.movil.Vibrar`: golpe por `AttackEntityEvent`, dano/caida por `hurtTime`+`fallDistance`, transformar por cambio de `Dbc.forma()`, ki soltado y choque por sonidos DBC `*_fire`/`DBC.hafire`/`DBC.expl`, romper bloque por sonido `dig.*` en el bloque apuntado, nivel/premio gacha por `random.levelup`, privado formato EssentialsX y mencion en el chat; API `Vibrar.evento`; 4 tests). Catalogo en `config/dbrcore/vibracion.json` como archivo normal (no `androidFiles`, que son `once` y no se actualizan). Experimental DBR-ASSETS cb4f9ec, APK instalado por adb. `docs/canal-movil.md` nunca se creo (el protocolo vive en `Protocolo.kt`/`Canal.java`). Sin empujar: launcher y DbrServerPack. Falta prueba del usuario en telefono.
- 2026-11-11: prueba 5b en telefono (Honor): no se siente nada. `dumpsys vibrator_manager`: solo 2 vibraciones en toda la partida (privado 30/60/30 ms y golpe 20 ms), las dos `finished`, Usage TOUCH, sin control de amplitud. Causas: (1) deteccion: `hurtTime == maxHurtTime` nunca se cumple en END (ya bajo a 9), los sonidos casi no disparan; (2) pulsos de 20-30 ms sin amplitud no se sienten. El usuario rechaza la deteccion por sonido. Propuesta 5b-v2: deteccion directa (cliente: hurtTime, `Dbc.forma`, spawn de `EntityEnergyAtt` con `shootingEntity` propio, `AttackEntityEvent`; DbrGachaMod llama `Vibrar.evento`; servidor -> cliente por DbrCorePlugin para privado, mencion, nivel, romper bloque) y en el launcher pulsos minimos de 40-60 ms sin control de amplitud + `USAGE_GAME`. Espera OK.
- 2026-11-11: fuentes concretas para 5b-v2. Choque de ki: `core.choque.CamaraChoque` de DbrCore (`empezar` = inicio de la cinematica, `golpe` = PERFECTO propio, `terminar`), lo llama DbrKiMod `ChoqueCliente`. Nivel: `XpHud.levelUp` de DbrCorePlugin (lo usan BattlePass, Combat, Food, Maestrias, Mining y el propio core), llega al cliente en DbrXpHudMod `PacketHandler` -> `aplicarLevelUp`. Pendiente OK del usuario.
- 2026-11-11: usuario aprueba 5b-v2, hecho. DbrServerPack a80eaa28 (`core.movil.Vibrar` sin sonidos ni chat: dano por subida de `hurtTime`, caida, `Dbc.forma`, ki soltado por spawn de `JinRyuu.JRMCore.entity.EntityEnAttacks` con `shootingEntity` propio, `AttackEntityEvent`; `CamaraChoque` -> `ki.choque`/`ki.choque_perfecto`/`ki.choque_fin`; DbrXpHudMod levelUp -> `avisos.nivel`; DbrGachaMod mejor carta -> `avisos.premio`; canal `DBRVIBRAR` S->C 0x01 UTF id + float). DbrCorePlugin 8849842 (`corelib.movil.Vibrar` + `VibrarEventos`: privado por `PrivateMessageSentEvent` de EssentialsX por nombre, mencion en `AsyncPlayerChatEvent`, `BlockBreakEvent`; `movil.vibrar.activo`). Launcher 0f16db9 (`ondaFinal`: pulso minimo 30 ms, 45 ms sin control de amplitud con fuerza -> duracion; uso MEDIA/GAME; patrones mas largos; log de 30 vibraciones; 32 tests). Desplegado en TESTEO RESURRECTION (`.bak-20261111-vibrar`, falta reiniciar), experimental DBR-ASSETS 3cac1a1, APK por adb. Build: tests desde la ruta real, APK desde X:; si KSP dice "different roots", borrar `build/kspCaches` y `build/kotlin`. Sin empujar launcher, DbrServerPack ni DbrCorePlugin. Falta prueba en telefono.
- 2026-11-11: usuario prueba 5b-v2 en telefono: la vibracion funciona. **Paso 5 cerrado.** Se propone el paso 6 en tres partes (6a H, 6b I, 6c K); pendiente OK del usuario.
- 2026-11-11: usuario aprueba el paso 6 en tres partes. Decision: el giroscopio (revision y ajuste en el menu) queda para despues, fuera de 6c. Se empieza 6a.
- 2026-11-11: 6a hecho. Cambio de diseno: el aviso lo muestra el launcher (cartel `AvisoSistemaDbr` arriba del juego), no un toast de DbrCore, porque tocar un toast en partida mueve la camara o golpea. Por eso no hay `AVISO_SISTEMA`; el unico mensaje nuevo es `REDUCIR` (103, launcher -> juego, u8 0/1) con `CAP_REDUCIR` (1 shl 5) en los dos lados. Launcher 9e7a23d: `AvisosSistema` (calor >= THERMAL_STATUS_SEVERE, se rearma en <= LIGHT y ofrece Restaurar si esta reducido; bateria 15% y 5% sin cargar, una vez por umbral, se rearma al cargar), Reducir = resolucion x0.7 en caliente en `refreshWindowSize` + `REDUCIR`; 7 tests (39 en canal_movil). DbrServerPack ec36a1c3: `core.movil.ModoReducido` (particulas minimas, distancia de render max 6, nada se guarda, restaura si el jugador no lo cambio, oyentes) y DbrVfxMod `VfxConfig` en Baja en memoria; 2 tests. Jar `DbrServerPack-5.8.0.jar` compilado, APK instalado por adb. Sin subir a experimental ni empujar. Prueba sin calentar el telefono: `adb shell cmd thermalservice override-status 3` (y `reset`), `adb shell dumpsys battery unplug` + `set level 14` (y `dumpsys battery reset`).
- 2026-11-11: 6a desplegado: TESTEO RESURRECTION (`.bak-20261111-reducir`, falta reiniciar), experimental DBR-ASSETS 9d85b12, APK por adb. Empujados launcher, DbrServerPack (con 9f9dc47a/a80eaa28 de la vibracion) y DBR-ASSETS. DbrCorePlugin sigue sin empujar (8849842). Falta prueba en telefono.
- 2026-11-11: el usuario deja las pruebas de 6a para despues (ver "Pruebas pendientes"). Se empieza 6b.
- 2026-11-11: medicion 6b en el telefono del usuario (2388x1080, 392 dpi, muesca 99 px): con `resolutionRatio` 50% la ventana es 1194x540 y `guiScale` ya esta en su maximo (2), asi que la escala automatica vanilla no aporta. Un control de `UiScreen` mide 16 unidades x2 = ~4 mm; 9 mm exigiria factor >= 4, imposible en 540 de alto. Decision del usuario: muesca igual que en el plan y, en vez de agrandar el dibujo, **zona de toque ampliada** (el control se ve igual, la zona que responde llega a ~7 mm donde no choca con otro control). Se descarta la escala automatica de `guiScale` y los 9 mm.
- 2026-11-11: 6b hecho. Launcher: `PANTALLA` (104, launcher -> juego, version + 6 floats: margen izq/arr/der/aba como fraccion de la vista, tope 0.25, y ancho/alto en mm, 20..400), `CAP_PANTALLA` (1 shl 6); `VMActivity.medirPantallaDbr` (safeInsets de `displayCutout` / tamano de la vista, mm con la media de xdpi/ydpi) en cada `refreshWindowSize`; `CanalMovil` lo guarda y lo reenvia al conectar; 4 tests. DbrCore: `core.movil.Pantalla` (fracciones, `pxPorMm`), `UiScreen.initGui` encaja la caja en la zona segura (fit con el ancho sin margenes y `ox/oy` corridos), `HudZone.originX/Y` y `moveTo` cuentan offsets desde la zona segura, `core.ui.ToqueAmpliado` (7 mm; rects de `hit()` del frame anterior + botones del marco; el toque dentro de un control no se mueve, fuera va al mas cercano cuya zona lo contiene; se mueve el punto en `mouseClicked` y el hover, asi los 75 `onClick` no cambian); 10 tests. APK instalado por adb, jar compilado.
- 2026-11-11: 6c hecho. La resolucion en caliente ya existia en el menu de ZL2 (slider + `onRefreshWindowSize`), no hizo falta codigo. Pestana Dbr nueva en el menu en partida (`MenuDbr.kt`, sexta pestana, icono estrella): vibracion (general, intensidad con prueba, categorias), aviso de calor, aviso de bateria, modo reducido (encender/apagar en cualquier momento), chips sobre el teclado y zona de toque ampliada. Ajustes nuevos `dbrAvisoCalor`, `dbrAvisoBateria`, `dbrChips`, `dbrToqueAmpliado` (todos encendidos). Con el aviso de calor apagado igual sale "Restaurar" si el modo reducido quedo encendido. `PANTALLA` pasa a 26 bytes: u8 de banderas, bit 0 = toque ampliado (DbrCore `Pantalla.toqueAmpliado()`); el interruptor refresca la ventana para reenviarlo. Giroscopio sin tocar (pospuesto). Launcher 44 tests canal_movil, DbrCore c6ffd6d5 (a1677c1c de 6b). Desplegado: TESTEO RESURRECTION (`.bak-20261111-pantalla`, falta reiniciar), experimental DBR-ASSETS, APK por adb. Empujados launcher, DbrServerPack y DBR-ASSETS. **Paso 6 cerrado salvo pruebas.**
- 2026-11-11: paso 7 (J) planificado y aprobado (seccion "Paso 7 (J) detallado"). Decisiones: privado solo con remitente, AFK por AutoAfkPlus, eventos = API + ejemplo en DbrInvasionPlugin, el launcher filtra por segundo plano. Se empieza por 7.0 (comprobar que el cliente sigue con tick minimizado).
- 2026-11-11: 7.0 probado por el usuario: juego minimizado ~80 s (usagestats, hora PC 04:06:43-04:08:04) sin perder la conexion; el timeout del servidor es 30 s, asi que el cliente sigue con tick en segundo plano. Se sigue con 7a-7d. Nota: un /msg desde CONSOLA no vibra ni en primer plano (VibrarEventos solo cubre privados entre jugadores); para probar privados usar otra cuenta. El reloj del telefono va ~20 s adelantado respecto al PC. Incidente: TESTEO arrancado por mi sin UTF-8 (03:44) piso FeatherBoard/CratesPlus/ChatColor; restaurados (`.default-20261111-utf8`).
- 2026-11-11: 7a-7d hechos. Launcher def02cf: `NOTIFICAR` (6) + `CAP_NOTIFICAR` (1 shl 7), ritmo 4 / 1 por s; `Notificaciones.kt` (catalogo cerrado de 9 ids, `PoliticaNotif`: 1 alerta con sonido cada 30 s por categoria, el resto en silencio con contador); `NotificadorDbr.kt` (solo con `VMActivity` en `onStop`, una notificacion por categoria, `VISIBILITY_PRIVATE` + `publicVersion` sin nombre, se cancelan en `onStart`); 4 canales `dbr.*` con importancia DEFAULT; ajustes `dbrNotif*` + interruptores en la pestana Dbr; permiso: se marca en el primer `onStop` y `PermisoNotifDbr` lo pide al volver (una vez, `dbrNotifPermisoPedido`); 9 tests (53 en canal_movil). Cambio: tocar la notificacion usa el intent del icono del launcher, no `VMActivity` directo (su `onCreate` revienta sin extras si el juego murio). DbrServerPack c3d51c12: `core.movil.Notificar` (atacado: subida de `hurtTime` que no es caida/fuego/lava/ahogo, 1 cada 30 s; vida baja < 25 % con rearme > 50 %, cuerpo de DBC por `JRMCoreH.curBody/maxBody` o `getHealth`; desconectado por `GuiDisconnected` salvo tras `GuiConnecting`; canal `DBRNOTIF`); 4 tests. DbrCorePlugin 64496c2: `corelib.movil.Notificar` (`enviar`, `enviarATodos`; nombre invalido se manda vacio) + `NotificarEventos` (privado con remitente, mencion con autor, AFK); `movil.notificar.activo`; 5 tests con testkit (145 en total, 0 fallos). El plugin de AFK es **AntiAFKPlus 2.18** (no AutoAfkPlus): `AfkStatusChangedEvent(player, afk)`, sin evento previo al kick, asi que `conexion.afk_kick` no se manda (el kick lo cubre `conexion.desconectado`). DbrInvasionPlugin 0e035be: `eventos.invasion` a todos al lanzar. Modelos de seguridad: launcher 64e1627 (INV-4), DbrCorePlugin INV-8. Desplegado: TESTEO (`.bak-20261111-notificar`, servidor apagado), experimental DBR-ASSETS e462005 (empujado), APK por adb. Sin empujar launcher, DbrServerPack, DbrCorePlugin ni DbrInvasionPlugin. Falta prueba en telefono.
- 2026-11-11: prueba 7 en telefono (1): `conexion.desconectado` llega bien al cerrar TESTEO. Los privados no podian llegar: TESTEO tiene **Essentials Pre2.14** (no EssentialsX, sin `PrivateMessageSentEvent`); por eso tampoco vibraban nunca. Arreglo DbrCorePlugin 4df8f8f: `PrivadosEssentials` compara cada 10 ticks el `replyTo` de Essentials (objeto nuevo por mensaje, cubre `/msg`, `/r` y consola) en jugadores con el canal; se ignora si el jugador hizo un comando hace menos de 3 s (su propio mensaje). Lo usan `NotificarEventos` y `VibrarEventos` si falta EssentialsX. Copiado a TESTEO (servidor apagado). Ojo: lanzar TESTEO a la vez que el usuario choca de puerto; preguntar antes.
- 2026-11-11: prueba 7 (2): privados llegan ("Mensaje privado de CONSOLE"). DbrServerPack f97273c6: `Plataforma` pulida (senal nueva `os.version` con "android", constante `PROPIEDAD_LAUNCHER`, `esLauncherDbr()`); `Canal.conectar` ya no lee la propiedad a mano. Es el unico chequeo de plataforma de los pasos 1-7: el resto de `core.movil` cuelga de `Canal`. DbrOptimizer repite su propia deteccion en 6 clases (`build.prop` u `os.version`), sin tocar: build standalone sin DbrCore.
- 2026-11-11: prueba 7 completa en telefono, el usuario confirma que funciona. **Paso 7 cerrado.** Paso 8 (F) planificado y aprobado (seccion "Paso 8 (F) detallado"). Decisiones: el teclado se abre y cierra solo con el chat; el juego subraya la composicion. Se empieza por 8.0 (empujar los 4 repos del paso 7).
- 2026-11-11: 8.0 hecho: empujados launcher (6d934f8), DbrServerPack (f97273c6), DbrCorePlugin (4df8f8f) y DbrInvasionPlugin (0e035be). Sigue 8a.
- 2026-11-11: 8a y 8b escritos en el launcher, sin compilar ni commit (pausa: otra sesion usa el worktree para el diagnostico de arranque). Cambio de formato: el largo del texto de `TEXTO_*` va en u16 (100 caracteres UTF-8 pueden pasar de 255 B). `seq` de `TEXTO_ESTADO` = ultimo seq de `TEXTO_EDITAR` aplicado por el juego (eco). Falta: compilar y tests del launcher, 8c DbrCore.
- 2026-11-11: 8a, 8b y 8c hechos, sin commit. Launcher: tests `canal_movil` OK, `assembleDebug` OK e instalado por adb. DbrCore: `TextoMovil` + tipo 105 + `CAP_TEXTO` + subrayado en `ChatAutocompletado`, `gradlew build` OK (7 tests nuevos). `SECURITY_MODEL.md` con tipos 7 y 105. Falta: commits, jar de DbrCore a experimental DBR-ASSETS, prueba en telefono.
- 2026-11-11: paso 8 empujado y desplegado. Launcher 5fc066f, DbrServerPack 9265d96a, TESTEO RESURRECTION (`.bak-20261111-texto`, servidor apagado), experimental DBR-ASSETS d63b518. APK debug ya instalado por adb. Falta prueba en telefono (seccion "Verificacion" del paso 8).
- 2026-11-11: paso 8 funciona en el telefono, pero con SwiftKey en horizontal (257 dp de 360) no se ve lo que se escribe. Plan 8d aprobado: barra de texto propia sobre el teclado + juego levantado con toques corregidos.
- 2026-11-11: 8d hecho, sin commit. `TextoTeclado` (estado del teclado para la barra), `DistribucionTeclado` (una o dos filas + levantado, 2 tests), `BarraTextoDbr`/`FranjaTecladoDbr` (cursor, seleccion, subrayado, tocar mueve el cursor, contador desde 90), `VMActivity` usa la franja para levantar el juego y esconde el campo del juego bajo la barra, `DesplazamientoJuego` corrige toques en `sendPosition` y en el tap. Tests canal_movil OK (69), APK por adb. Falta prueba en telefono y commit/push.
- 2026-11-11: el usuario confirma probados 5a, 5b, 6a, 6b y 6c. **Paso 6 cerrado.** Se planifica 8b (mando).
- 2026-11-11: fase 8 restante afinada y aprobada (seccion "Fase 8 restante"): orden 8p (servicio PvP unificado, todos los usos) -> 8c (lock-on) -> 8b (mando, Android + PC juego; Electron, giroscopio y flick despues). Se empieza 8p.
- 2026-11-11: 8p codigo hecho, sin commit ni despliegue. DbrCore `core.combate.ReglasPvp` (vetos por id, falla = veto, 5 tests). DbrCorePlugin `corelib.combate.PvpMod` (puente por reflexion, lista local sin mod, se quita al deshabilitar el plugin, 3 tests, 148 total OK) + `ProveedoresPvp` (mundo y WorldGuard por reflexion; WorldGuard sumado a softdepend). Vetos: Arena (`canDamage`), TPersonal (mundos de sala), Batallas (`Reglas.vetoPvp`), Staff (vanish, se quita con el modulo), DbrTierra (`GuardiaZonas.registrarPvp`). Consumidores: Talentos (`Efectos.puedePegar` lee ReglasPvp; `MotorPuente` sin evento falso), DbrKiMod (`RazaKi.herir` cancela ki entre jugadores sin PvP; curas usan `Combate.rivales`). Compilan los 3 mods; tests de los 5 plugins OK. Falta: probar con dbr-test (spawn/WorldGuard, arena, sala) y desplegar. Sigue 8c.
- 2026-11-11: 8c codigo hecho, sin commit ni despliegue. DbrKiMod: `cliente/LockOn` (Z fija/suelta con Ki Sense y `JRMCoreConfig.lockon`; mas cercano a la mira en cono 30 grados, 35 bloques; keybind "Cambiar objetivo" = clic de la rueda, `cambiar(dir)` para el mando; camara suave 80 ms en RenderTick START; se suelta muerto/lejos/sin vista 1 s/menu/rechazo), `MixinJRMCoreCliTicH_LockOn` (redirige la lectura de `JRMCoreConfig.lockon` en `onRenderTick` y `onInputEvent`, verificado contra JRMCore-v1.3.51), `Guiado` valida cada FIJAR (Ki Sense, 35+3, vista con 1.5 s de gracia, jugador: `jrmcRelease >= 5` y `ReglasPvp`) y manda `0x0C` rechazo / `0x0D` aviso al fijado; `GuiadoCliente` manda FIJAR aunque el guiado este apagado; config `e2_lockon` (`nuevo`, `liberacionMin`) con `lockOnNuevo` al final de CONFIG; lang es/en/pt + variantes. DbrMod `DbrHudKi.pintarFijado` (ojo rojo 9x5 sobre la mira, dibujado con rects como la marca del guiado, no con el atlas). DbrCore `Dbc.fijando()` + bit ESTADO `FIJANDO` (1<<6). Launcher: `EstadoDbr.FIJANDO` (`lock_on`) + texto del editor, icono `swap_horiz`, boton "Cambiar" (clic de rueda, `dbrShowIf: lock_on`) sobre "Fijar" en `default_layout.json`. Compilan DbrKiMod, DbrMod, DbrCore y el launcher. Falta: dbr-test (lock, cambiar, rechazo por ki oculto y zona sin PvP, aviso al fijado, DbrAntiCheat sin VL con melee + lock) y prueba en telefono. Sigue 8b.
- 2026-11-11: 8b.0 resuelto (usuario + bytecode de DBC 1.4.85 / JRMCore 1.3.51). DBC no registra teclas de tecnicas: con "2nd Fn" (LCtrl, configurable) mantenido, el numero de la barra o la rueda eligen la tecnica (DBC lee `inventory.currentItem`), y "2nd Fn" + clic derecho mantenido carga y dispara al soltar. Hay **4** tecnicas equipables, no 8. Keybinds de JRMCore: Energy Release C, Energy Control/Flight F, Turbo Mode R, Lock On Z, 2nd Fn LCtrl, Action menu X, Data Sheet V, Bloodline On G / Off H; DBC: 3rd Fn, Scouter. Consecuencias para 8b: "LB + A/B/X/Y = tecnica 1-4" es una macro que sigue las teclas reales del jugador (busca "2nd Fn" por descripcion): mantiene 2nd Fn, elige el slot N, mantiene clic derecho mientras el boton siga apretado, al soltar suelta todo y devuelve el slot de la mano que tenia. El radial ya no lleva "tecnicas 5-8": por defecto F5, lista de jugadores, ocultar HUD, rueda de formas, menu de acciones, Data Sheet, Turbo, ajustes del mando.
- 2026-11-11: 8b.1 hecho, sin commit. DbrCore `core.mando`: puras `Boton`, `EstadoMando`, `Ejes` (zona muerta radial + curva), `Accion` (`tecla:<descripcion>` o `dbr:*`), `Perfil` (JSON en `config/dbrcore/mando/<modelo>.json`, defaults Sparking Zero, normalizar), `Interprete` (tocar/mantener 250 ms, modificador LB, cambiar de tabla suelta todo sin redisparar); 15 tests OK. Con Minecraft: `Backend` (interfaz para 8b.2/8b.3), `TeclaVirtual` (aprieta el KeyBinding por objeto: `pressed`/`pressTime`, SRG verificados, por el limite de una accion por tecla), `MovimientoMando` (stick izquierdo analogico; solo reemplaza el MovementInput de vanilla para no romper cinematicas ni choques), `Mando` (tick START, macro de tecnica 2nd Fn + slot + clic derecho y devuelve el slot, hotbar, menu, atras, camara por fotograma, stick a un lado con lock = `LockOn.cambiar` por reflexion, `usandoMando()`), registrado en el ClientProxy de DbrMod. Compilan DbrCore y DbrMod. Sin backend todavia no hace nada. Sigue 8b.2 (backend Android por el canal).
- 2026-11-11: 8b.2 hecho, sin commit ni prueba. Protocolo: `CAP_MANDO` (1<<9) en los dos lados, `MANDO_ESTADO` 106 (short botones en orden de `Boton`, 4 bytes de sticks con signo, 2 de gatillos sin signo) y `MANDO_INFO` 107 (conectado + modelo UTF-8 hasta 64 B); no hizo falta `MANDO_VIBRAR`. Juego: `core.mando.BackendCanal` (se pone solo como backend al primer MANDO_INFO; 2 tests), despacho en `Canal`; `Vibrar` aplica el perfil del mando (interruptor, categorias, intensidad) cuando se usa el mando. Launcher: `MandoDbr` (captura teclas y ejes del mando solo si el juego trae CAP_MANDO, hat como cruceta, zona plana del dispositivo, como mucho un envio cada 8 ms y siempre el ultimo cambio, desconexion por `InputDeviceListener`, reanuncia tras un HOLA nuevo, `vibrador()` del mando en Android 12+), enganchado en `GameHandler.shouldIgnoreKeyEvent` (antes del remapper de ZL2), `VMActivity.dispatchGenericMotionEvent` y `GameScreen` (esconde los controles tactiles con actividad del mando); `VibradorDbr` hace vibrar el mando si tiene motor. `MandoProtocoloTest` (4) + canal_movil OK; launcher compila. Sigue 8b.3 (Jamepad en PC).
- 2026-11-11: 8b.3 hecho, sin commit ni prueba. Decision del usuario: Jamepad va dentro de **DbrMod** (DbrCore no tiene jar propio). Jamepad 2.30.0.0 (SDL 2.30.0, Java 7) + gdx-jnigen-loader 2.2.0, jars oficiales de Maven Central (sha1 verificado) vendorizados en `DbrMod/libs-embed` y en `embed` de los dos build.gradle (DbrMod y raiz); licencias Apache-2.0 + zlib (Hartman, SDL) en `META-INF/licencias` del jar y en DBR-ASSETS `experimental/CREDITOS.txt` (seccion 5) + `LICENCIAS/` (Apache-2.0, Zlib-SDL2, Zlib-Jamepad), sin publicar. `dbr.main.client.mando.BackendJamepad` (primer mando, hotplug, SDL se inicia en la primera lectura en el hilo del cliente, si falla queda apagado; nunca en Android), registrado en el ClientProxy de DbrMod. Las natives las extrae gdx-jnigen-loader a su carpeta temporal, no a `.minecraft/natives/dbr` como decia el plan. Vibracion en PC: `Vibrar` manda al backend con duracion por categoria y `Movil` corre la deteccion local solo con el mando en uso (sin abrir DBRVIBRAR del servidor en PC). DbrOfficialMod pasa de 6.8 a 10.3 MB. Compilan DbrCore y DbrMod; tests de DbrCore OK. Sigue 8b.4 (navegacion de menus).
- 2026-11-11: 8b.4 hecho, sin commit ni prueba. `core.mando.Navegador` (pixeles reales): destinos = rects de `hit()` del ultimo frame de `UiScreen` (`destinosMando()`, mas los botones del marco), slots de `GuiContainer` (guiLeft/guiTop por SRG) y `buttonList` vanilla. Cruceta o stick izquierdo saltan al destino en esa direccion (avance + 2x desvio; repite a 350 ms y cada 110 ms); sin destinos el stick izquierdo y siempre el derecho mueven un cursor libre. A/X = clic izq/der (baja y sube como el raton, por `mouseClicked`/`mouseMovedOrUp`), Y = shift-clic (`handleMouseClick` modo 1, sirve en creativo), B/Start = ESC (`keyTyped`), LB/RB = `UiScreen.scrollMando`. Cursor en el raton de LWJGL (hover) + anillo de foco / cursor propio en `DrawScreenEvent.Post`; si se mueve el raton de verdad, manda el raton. Funciona tambien sin mundo (titulo, servidores). 5 tests (`NavegadorTest`); compilan DbrCore y DbrMod. A probar: si en Android `Mouse.setCursorPosition` mueve el hover (si no, solo se ve el anillo). Sigue 8b.5 (teclado en pantalla, solo PC).
- 2026-11-11: 8b.5 hecho, sin commit ni prueba. `core.mando.TecladoMando` (solo PC; en Android sigue el teclado del sistema) + `TecladoDisposicion` (pura: QWERTY con ñ, pagina de simbolos, 10 unidades por fila; 4 tests). Aparece solo con el mando en uso y un campo con foco (`DetectorCampo.area()`, ahora publico; `CampoActivo` tambien reporta en PC con el mando), en la mitad opuesta al campo (chat abajo = teclado arriba). Botones fijos: cruceta/stick mueven, A aprieta, X borra (repite), Y espacio, Start envia, LB mayus, RB simbolos, LT/RT cursor (repiten), B sigue siendo ESC. Arriba, barra con las sugerencias del popup o los comandos del servidor: `ChipsMovil` guarda la ultima lista tambien sin launcher; chip = reemplaza el texto por el comando, sugerencia = `aceptarSugerencia`. Teclas por `keyTyped` (chat, campos vanilla, `TextInput`). `Interprete.Evento` lleva el boton para que Mando no pase al Navegador los del teclado. Textos `dbrcore.mando.teclado.*` es/en/pt + sync-lang. Compilan DbrCore y DbrMod, tests OK. Sigue 8b.6 (radial).
- 2026-11-11: 8b.6 hecho, sin commit ni prueba. `core.mando.RadialMando`: se abre al mantener RB (accion `dbr:radial`, solo sin pantalla), el stick derecho apunta 1 de 8 casillas (0 arriba, horario; `casilla()` pura, 3 tests), LT/RT cambian de pagina (hasta 3, del perfil; con la radial abierta los gatillos no atacan ni usan), al soltar RB se toca la accion apuntada (baja y sube a los 2 ticks); soltar sin apuntar no hace nada; la camara queda quieta; se cancela al abrir una pantalla o perder el mando. Dibujo en `RenderGameOverlayEvent.Post` (pixeles reales). `NombreAccion` (keybind por I18n, `dbr:*` por `dbrcore.mando.accion.*` es/en/pt), sirve tambien para 8b.7. Cambio de defaults: en 1.7.10 F1 no es keybind, asi que `tecla:key.hideGui` pasa a `dbr:ocultar_hud` (nuevo, alterna `hideGUI`), y la lista de jugadores (solo se veria 2 ticks; ya esta en BACK mantenido) pasa a `key.chat`. Compilan DbrCore y DbrMod, tests OK. Sigue 8b.7 (iconos y ajustes).
- 2026-11-11: 8b.7 se parte en 8b.7a (glifos), 8b.7b (pantalla de ajustes), 8b.7c (entradas). 8b.7a hecho, sin commit: atlas nuevo `DbrCore/.../textures/gui/mando.png` (16 px, 4 estilos x 32 celdas: Xbox, PlayStation, Switch, generico; glifo = orden de `Boton` + stick izq/der + cruceta; sin logos), generador `tools/gen-mando-icons.py` registrado en `atlaslib` (alias `mando`, sin .java de indices) e `iconlib.LOTE_PROPIO` (L31-mando). Placeholder dibujado con pruebas exactas, revisado por subagente en 3 vueltas (OK); `check-atlas mando` ok. Lote L31-mando abierto para el Taller de Claude Design: `tools/art/L31-mando/` (manifiesto + kit.py), kit `tools/_preview/design-kit-L31-mando.zip`, encargo `docs/rediseno-texturas/L31-prompt.md` (falta que el usuario lo pase al Taller). Java: `core.mando.GlifosMando` (atlas, `celda(estilo, boton)`, estilo por el nombre del mando o `Perfil.estiloIconos` = auto/xbox/ps/switch/generico; 2 tests). Sigue 8b.7b (pantalla de ajustes del mando en core.ui).
- 2026-11-11: L31-mando vuelta 1 de Claude Design importada (80 celdas reemplazan al placeholder; checks ok). La revision pide retoques (rotulos de gatillos apretados, flechas del stick R, cruceta, genericos, guia, triangulo PS): encargo `docs/rediseno-texturas/L31-retoque-prompt.md`. No bloquea 8b.7b.
- 2026-11-11: 8b.7b hecho, sin commit ni prueba en el juego. `core.mando.MandoAjustesScreen` sobre `SettingsScreen` (host propio como `AccesibilidadScreen`, textos `mando.cfg.*` es/en/pt + sync-lang). Pestañas de campos: sticks (zona muerta izq/der, velocidad H/V, curva, invertir Y), gatillos y combos (umbral, boton de tecnicas LB/RB: al cambiarlo los combos pasan al nuevo y las acciones de los dos se cruzan), vibracion (interruptor, intensidad, 4 categorias), iconos (auto/xbox/ps/switch/generico); se guardan con Aplicar/Listo (`onApplied` vuelca al perfil). Pestañas propias, se guardan al momento: Botones (tabla en partida / en menus, tocar y mantener por boton con su glifo, combos del modificador; los de tecnica 1-4 fijos), Rueda (paginas 1-3, agregar/quitar, 8 casillas), Probar (dibujo del mando en vivo: botones, gatillos con barra, sticks). Elegir accion: Nada + acciones Dbr + todos los keybinds por categoria. Preset "Valores de fabrica". `Mando.paraEditar()` (copia del perfil conectado o el generico) y la accion `dbr:ajustes` (rueda) abre la pantalla. El `.cfg` `_pantalla.cfg` solo existe porque SettingsScreen pide un store; la verdad es el JSON. 2 tests (`MandoAjustesTest`), detector de diseno 0/0, compilan DbrCore y DbrMod. Pendiente: critica de diseno con capturas (dbr-test) y probarla con mando. Sigue 8b.7c (entradas: Opciones > Controles, menu en partida Dbr, aviso al conectar un mando nuevo).
- 2026-11-11: 8b.7c hecho, sin commit ni prueba. Entradas a `MandoAjustesScreen`: comando de cliente `/dbrmando` (alias mando, controller, controle; `MandoAjustesScreen.registrar()` desde el ClientProxy de DbrMod), boton "Mando..." arriba a la derecha de Opciones > Controles (`InitGuiEvent`/`ActionPerformedEvent` en `Mando`), tarjeta "Mando" en la categoria Sistema del menu ESC de DbrMenuMod (`Locales`, orden 9, aparece si existe el comando), aviso en el chat (clic = `/dbrmando`) la primera vez que se conecta un modelo, y la casilla de la rueda. Textos es/en/pt + sync-lang. Compilan DbrCore, DbrMod y DbrMenuMod; tests de DbrCore OK. **Con esto el codigo de 8b esta completo**; falta probar (PC con Xbox y telefono con mando), critica de la pantalla con capturas y el retoque L31.
- 2026-11-11: prueba de 8d en telefono: con SwiftKey + barra de herramientas + fila de numeros quedan ~21 dp libres y la barra (44 dp) sale por arriba. Plan 8e aprobado: cadena de modos (dos filas, una fila, barra compacta, pantalla completa del teclado) y franja nunca fuera de pantalla.
- 2026-11-11: 8e hecho, sin commit. Medido por adb: region tactil del teclado desde y=61 px (~20 dp libres). `DistribucionTeclado` con `Modo` (DOS_FILAS, UNA_FILA, COMPACTA, PANTALLA_COMPLETA, RESPALDO) y `subirFranja`; `TextoDbrView.ponerPantallaCompleta` (quita NO_FULLSCREEN/NO_EXTRACT_UI + restartInput, vuelve al cerrar el chat); barra compacta 12 sp; aviso `dbr_teclado_tapa_chat` una vez por sesion. Tests canal_movil OK (Distribucion 4/4), APK por adb. Falta prueba en telefono.
- 2026-11-11: prueba 8e: la primera apertura del chat paso sola al editor a pantalla completa de SwiftKey; las siguientes, bien (una fila). Causa probable: medida falsa del teclado al abrirse. Fix: pedir pantalla completa solo si dura 400 ms (`ESPERA_PANTALLA_COMPLETA_MS` en `VMActivity`). APK por adb.
- 2026-11-11: el usuario confirma en telefono que 8d y 8e funcionan (primera apertura incluida). **Pasos 8d y 8e cerrados.** Falta commit/push.

## Paso 7 (J) detallado (aprobado 2026-11-11)

### Context
Paso 7 de `PLAN-canal-movil.md`. Si el jugador minimiza el juego en Android, hoy no se entera de nada: privados, eventos,
ataques, AFK o desconexion. J agrega notificaciones de Android que salen solo con la app en segundo plano. Reglas que se
mantienen: el canal nunca lleva texto arbitrario del chat (regla 3), los paquetes del servidor nunca pasan crudos (regla 4)
y con la pantalla bloqueada la notificacion no lleva texto.

### Decisiones del usuario (2026-11-11)
- Privado: solo el remitente ("Mensaje privado de Goku"). Nunca el texto del mensaje.
- AFK: lo detecta el plugin **AutoAfkPlus** del servidor.
- Eventos: API `Notificar.evento` + un plugin enganchado como ejemplo (DbrInvasionPlugin). El resto despues.
- Desvio del plan original: el launcher filtra por segundo plano (sabe su ciclo de vida); DbrCore manda siempre. No hace falta un mensaje de estado nuevo.

### 7.0 Verificacion previa (adb, sin codigo)
Confirmar que el cliente 1.7.10 sigue haciendo tick con la app minimizada. `VMActivity.onPause` solo manda
`GLFW_FOCUSED=0` y la superficie se destruye (`mIsSurfaceDestroyed`). Si el render se bloquea sin superficie, el
tick se para y el servidor corta por timeout.
- Prueba: entrar a TESTEO, minimizar 2 min, mandar `/msg` desde otra cuenta o la consola. Mirar con `adb logcat` si llega el log del canal.
- Si el tick sigue: se hace el plan entero.
- Si el tick se para: STOP. Le informo al usuario y replanteamos antes de seguir. Opciones: buscar en `ZLBridge`/`egl` que el swap no bloquee sin superficie, o reducir J a "te desconectaste" al volver.

### 7a Protocolo `NOTIFICAR`
- Tipo 6, juego -> launcher. `CAP_NOTIFICAR = 1 shl 7` en los dos lados.
- Payload: u8 version, u8 largo + id ASCII `categoria.clave` (regex de `Vibrar`: `[a-z]{1,12}\.[a-z0-9_]{1,19}`), u8 largo + nombre opcional (0..16, `[A-Za-z0-9_]`).
- Categorias = canales de Android: `privado` (privados y menciones), `eventos`, `peligro` (ataque, vida baja), `conexion` (AFK, desconexion).
- Catalogo cerrado en el launcher. Ids iniciales: `privado.mensaje`, `privado.mencion`, `eventos.invasion`, `eventos.generico`, `peligro.atacado`, `peligro.vida_baja`, `conexion.afk`, `conexion.afk_kick`, `conexion.desconectado`. Un id fuera del catalogo se descarta.
- Rate limit en `CanalMovil`: `NOTIFICAR` con capacidad 4 y 1 por segundo.
- Archivos: `Protocolo.kt` (launcher), `Canal.java` (DbrCore).

### 7b Launcher
- `canal_movil/Notificaciones.kt`, puro y testeable:
  - parser del payload;
  - catalogo id -> string res + categoria;
  - politica por categoria: alerta con sonido como maximo cada 30 s, el resto actualiza en silencio (`setOnlyAlertOnce`), agrupado por categoria con contador.
- `canal_movil/NotificadorDbr.kt`, Android:
  - publica con `NotificationManagerCompat` desde el proceso `:game` (donde ya corre `CanalMovil`);
  - descarta si la app esta en primer plano (`ProcessLifecycleOwner` o un flag de `VMActivity.onStart`/`onStop`);
  - `setVisibility(PRIVATE)` con `publicVersion` sin nombre ("Nuevo mensaje privado");
  - al tocarla, `PendingIntent` a `VMActivity` con `FLAG_ACTIVITY_REORDER_TO_FRONT`;
  - al volver al juego se cancelan sus notificaciones.
- `NotificationChannelData.kt`: 4 canales nuevos. `peligro` y `privado` con importancia DEFAULT. `eventos` y `conexion` igual. Strings es/en/pt.
- Permiso `POST_NOTIFICATIONS` (Android 13+):
  - en el primer `onStop` de `VMActivity` con el permiso sin pedir, se guarda una bandera;
  - al volver se muestra un dialogo con la explicacion y despues se pide el permiso;
  - no se puede pedir con la app en segundo plano. Se reusa el patron de `ui/components/_Notification.kt`.
- `CanalMovil.recibir`: rama `Mensaje.Notificar -> NotificadorDbr.publicar(...)`.
- Pestana Dbr del menu en partida (`MenuDbr.kt`): interruptor general + uno por categoria. Ajustes nuevos `dbrNotif`, `dbrNotifPrivado`, `dbrNotifEventos`, `dbrNotifPeligro`, `dbrNotifConexion`, todos encendidos.
- Tests JVM: parser, catalogo, ids invalidos, tope de 30 s, nombre invalido.

### 7c DbrCore: `core.movil.Notificar`
- API: `Notificar.evento(String id, String nombre)`, que exige `Canal.launcherSoporta(CAP_NOTIFICAR)`. Se aplica un anti-repeticion por id, igual que `Vibrar.ULTIMO`.
- Deteccion en el cliente, con tick desde `Movil.onTick`:
  - `peligro.atacado`: subida de `hurtTime` causada por una entidad. Se reusa la logica de `Vibrar.tick`. Como maximo 1 cada 30 s.
  - `peligro.vida_baja`: la vida cruza hacia abajo el 25% del maximo. Con DBC se lee el body de `Dbc` si existe; si no, `getHealth`. Se rearma por encima del 50%.
  - `conexion.desconectado`: se abre `GuiDisconnected` (`GuiOpenEvent` en `Movil`).
- Canal S->C `DBRNOTIF`:
  - mismo patron que `Vibrar.abrirCanalServidor` (`DbrChannel.open` + hilo principal);
  - tipo 0x01: UTF id + UTF nombre;
  - se valida con la misma regex y se reenvia por `evento`.
- Se registra en `Movil.iniciar`.
- Tests: codificacion y validacion de id y nombre.

### 7d DbrCorePlugin: `corelib.movil.Notificar` + `NotificarEventos`
- `Notificar.enviar(plugin, player, id, nombre)`: copia el patron de `corelib/movil/Vibrar.java` (canal `DBRNOTIF`, `sendIfMod`, regex).
- `NotificarEventos`:
  - privado: `PrivateMessageSentEvent` de EssentialsX por nombre (como `VibrarEventos`); el receptor recibe `privado.mensaje` + remitente;
  - mencion: en `AsyncPlayerChatEvent`, reusa la deteccion de `VibrarEventos.onChat`; manda `privado.mencion` + autor;
  - AFK: AutoAfkPlus. Al implementar, se baja el jar desde TESTEO y se inspeccionan sus eventos con `javap`. Se registra por nombre y por reflexion (softdepend), como Essentials. AFK -> `conexion.afk`; aviso previo al kick, si el plugin lo expone -> `conexion.afk_kick`. Si no tiene API: solo `conexion.afk` por el cambio de estado que exponga, y el kick lo cubre `conexion.desconectado` del cliente.
- Config `movil.notificar.activo: true`.
- Ejemplo: en DbrInvasionPlugin, al empezar una invasion se manda `Notificar.enviar(..., "eventos.invasion", "")` a los jugadores online.
- Tests con dbr-testkit: id invalido descartado, jugador sin mod no recibe nada.
- Actualizar el modelo de seguridad de DbrCorePlugin y `SECURITY_MODEL.md` del launcher (regla 5).

### Archivos clave
- Launcher (`android/ZalithLauncher2/ZalithLauncher/src/main/java/com/movtery/zalithlauncher/`):
  - `game/support/canal_movil/{Protocolo,CanalMovil}.kt`, nuevos `Notificaciones.kt` y `NotificadorDbr.kt`;
  - `notification/NotificationChannelData.kt`, `ui/activities/VMActivity.kt`, `MenuDbr.kt`, ajustes, `res/values*/strings.xml`.
- DbrCore: `DbrServerPack/DbrCore/src/main/java/dbr/machitos/core/movil/{Canal,Movil}.java`, nuevo `Notificar.java`.
- DbrCorePlugin: `src/main/java/dbr/machitos/corelib/movil/`, nuevos `Notificar.java` y `NotificarEventos.java`.
- DbrInvasionPlugin: el punto donde arranca una invasion.

### Verificacion
- Tests: launcher (`canal_movil`, desde la ruta real), DbrCore (`gradle test`), DbrCorePlugin (`mvn test`).
- Build: APK desde `X:`/`C:\dev\dbr-wt` y `assembleDebug`; jar de DbrServerPack; DbrCorePlugin y DbrInvasionPlugin.
- Despliegue como en el paso 6:
  - TESTEO con `.bak-20261111-notificar`;
  - experimental DBR-ASSETS;
  - APK por adb.
- Prueba en el telefono, con el juego minimizado:
  - `/msg` desde la consola: notificacion de privado con remitente; con la pantalla bloqueada, sin nombre;
  - mencion en el chat;
  - golpe de un mob o de un NPC;
  - vida baja;
  - kick desde la consola (desconectado);
  - AFK de AutoAfkPlus;
  - `/invasion` de prueba.
  - Ademas: con la app en primer plano no sale nada; tocar la notificacion vuelve al juego; 2 privados en menos de 30 s = 1 sonido; los interruptores de la pestana Dbr funcionan; el permiso se pide al volver tras el primer minimizado.

## Paso 8 (F) detallado (aprobado 2026-11-11)

### Context
Paso 8 de `PLAN-canal-movil.md`. Hoy el teclado de Android escribe en un `EditText` oculto con 30 espacios de relleno (`TouchCharInput.java`): cada letra va como `sendChar`, cada borrado como Backspace. Por eso no andan el autocorrector, las predicciones, el dictado por voz, mover el cursor ni copiar y pegar. El objetivo es que el teclado vea el texto real de la barra del chat, y que el juego vea lo que edita el teclado, en los dos sentidos. Solo chat y comandos (decisión del plan general).

### Decisiones del usuario (2026-11-11)
- El teclado **se abre y se cierra solo** con el chat (T, `/`, botón Chat; cierra al cerrar el chat o enviar). El botón de teclado sigue funcionando.
- El juego **subraya la composición** del teclado en la barra del chat.

### 8.0 Cierre del paso 7
- Empujar launcher, DbrServerPack, DbrCorePlugin y DbrInvasionPlugin (pendiente de la bitácora). Pruebas de 6a/6b/6c siguen en "Pruebas pendientes".

### 8a Protocolo `TEXTO`
- `TEXTO_ESTADO` juego -> launcher, tipo **7**: u8 version, u16 seq, u8 banderas (bit 0 = chat abierto con campo), u16 selInicio, u16 selFin, u16 compInicio, u16 compFin (0xFFFF = sin composición), u8 largo + UTF-8 (tope 100 caracteres UTF-16, 400 B).
- `TEXTO_EDITAR` launcher -> juego, tipo **105**: mismo formato, seq propio del launcher.
- `CAP_TEXTO = 1 shl 8` (las capacidades son `Int`, hay lugar).
- Índices en unidades UTF-16 (iguales en Java y Kotlin). Validación en los dos lados: índices dentro del texto, inicio <= fin, sin controles, sin surrogates (emoji), sin `§`, largo exacto.
- Ritmo: launcher manda como máximo cada 33 ms y solo el último estado (se junta); juego manda solo al cambiar, tope 20/s.

### 8b Launcher
- `TextoSincronizado.kt` (puro, testeable): estado (texto, selección, composición), aplicar edición del IME, aplicar estado del juego, filtro (100 caracteres, sin emoji/controles/`§`), seq para ignorar el eco.
- `TextoDbrInputConnection` modelado sobre `TouchControllerInputConnection` (`touch_controller/TouchController.kt:101-590`): commitText, setComposingText/Region, finishComposingText, setSelection, deleteSurroundingText, batch edit, getTextBefore/AfterCursor, getExtractedText, `performContextMenuAction` (selectAll, cut, copy, paste con `ClipboardManager`). Enter = `LWJGLCharSender.sendEnter()` como hoy; nunca envía solo. Tab sigue como tecla.
- Cuando llega un estado del juego que no es eco y el texto difiere: `restartInput` (como TouchController `:204-217`).
- Vista oculta nueva que usa esa conexión, en lugar de `TouchCharInput`, **solo** con `CAP_TEXTO` + bandera de chat abierto. Sin canal o con juego viejo: `TouchCharInput` como hoy.
- Apertura automática: bandera de chat 0 -> 1 abre el teclado (`textInputMode = ENABLE`), 1 -> 0 lo cierra. Si el jugador lo cierra a mano con el chat abierto, no se reabre hasta el próximo chat.
- Ajuste `dbrTextoSync` (encendido) en la pestaña Dbr del menú en partida.
- Tests JVM: parser y escritor de los dos tipos (largos malos, índices fuera de rango, surrogates, `§`), eco por seq, filtro de 100 caracteres, juntado por ritmo.

### 8c DbrCore
- `core.movil.TextoMovil`: dueño `ChatAutocompletado` (ya reemplaza `GuiChat`). Cada tick END compara texto, cursor y selección de `inputField` con lo último enviado y manda `TEXTO_ESTADO` si cambió (incluye cambios del juego: Tab, historial, chips `INSERTAR`, vaciado al enviar). Al cerrar el chat manda bandera 0.
- Al recibir `TEXTO_EDITAR` (solo con `CAP_TEXTO` y el chat abierto): valida con `ChatAllowedCharacters`, aplica `setText` + `setCursorPosition` + `setSelectionPos` y refresca el autocompletado igual que al teclear. Si el juego corta o cambia algo, su próximo `TEXTO_ESTADO` corrige al launcher (así el juego "informa" lo que la fuente no soporta).
- Subrayado: `ChatAutocompletado.drawScreen` dibuja una línea de 1 px bajo el rango de composición (posición con `fontRenderer.getStringWidth`, respetando el desplazamiento del campo).
- `Canal.java`: registrar tipo 105 y `CAP_TEXTO`. Todo con try/catch; nada del canal va al servidor.
- Tests: validación del payload, recorte de índices.

### Archivos clave
- Launcher: `game/support/canal_movil/Protocolo.kt`, `CanalMovil.kt`, nuevo `TextoSincronizado.kt`; `ui/control/input/TextInput.kt` (vista oculta), `VMActivity.kt:479-495` (elección de vista y apertura automática), `MenuDbr.kt`; referencia `touch_controller/TouchController.kt`, `ui/control/input/LegacyTextInput.kt` (manejo de SwiftKey, reusar si sirve).
- DbrCore: `core/movil/Canal.java`, nuevo `core/movil/TextoMovil.java`, `core/comandos/ChatAutocompletado.java`.
- `SECURITY_MODEL.md` del launcher (nuevo tipo entrante 105 lado juego, 7 lado launcher).

### Verificación
- Launcher: `compileDebugKotlin`, tests `canal_movil`, `assembleDebug` desde `X:` (subst) e instalar por adb.
- DbrCore: `gradlew build`, tests; jar a experimental DBR-ASSETS.
- Teléfono (Gboard y, si hay, SwiftKey), en TESTEO arrancado con UTF-8:
  - abrir chat con T y con `/`: teclado sale solo; cerrar con Esc/atrás y al enviar: se va;
  - autocorrector corrige una palabra y se ve subrayada mientras compone; predicciones;
  - dictado por voz;
  - mover cursor deslizando la barra espaciadora, seleccionar, copiar, pegar, cortar;
  - Tab del autocompletado, flecha arriba (historial) y chip: el teclado ve el texto nuevo;
  - 100 caracteres: no deja escribir más; emoji: no entra;
  - con el ajuste apagado o canal apagado: escribe como hoy.

## Paso 8d (aprobado 2026-11-11): ver lo que se escribe con el teclado abierto (barra de texto + juego levantado)

### Context
Paso 8 (texto sincronizado) funciona en el telefono, pero con el teclado abierto no se ve lo que se escribe. Medido por adb (Honor, 2388x1080, densidad 3): SwiftKey en horizontal ocupa y=309..1080 px, o sea 257 dp de 360. Quedan **103 dp** libres arriba. Ahi ya estan la fila de chips (40 dp, `FilaChipsDbr`) y el juego levantado (`VMActivity.kt:824-841`, `absoluteOffset` del `AndroidView` usando `CanalMovil.areaTexto`). La opcion 2 ya existe a medias: levanta el juego, pero el chat queda casi tapado por los chips y el poco espacio que sobra. Ademas, los toques no se corrigen al levantar: el juego se dibuja mas arriba, pero `GameScreen.kt:1052` manda la coordenada sin el desplazamiento.

El usuario pidio implementar la 1 (barra de texto propia sobre el teclado, como Roblox o los juegos hechos con Unity) y la 2 (juego levantado, como Bedrock) juntas.

### Diseno

### 1. Barra de texto Dbr (launcher)
- Fuente del estado: `TextoDbrView` (`ui/control/input/TextoDbrInput.kt`) publica su `EstadoTexto` en un objeto nuevo `TextoTeclado` (StateFlow `estado: EstadoTexto?`, null sin texto sincronizado). Se actualiza en `editar` y `aplicarJuego` y vuelve a null en `cerrar`. `TextoTeclado.moverCursor(i)` llama a la vista activa (referencia debil) y esta usa `EdicionTexto.seleccionar` + `programarEnvio` + `imm.updateSelection`.
- Composable nuevo `BarraTextoDbr` (en `ui/screens/game/elements/`, junto a `FilaChipsDbr.kt`), con los mismos colores y forma que los chips:
  - texto con cursor que parpadea, seleccion resaltada y la composicion subrayada (como en el juego);
  - desplazamiento horizontal para que el cursor siempre se vea;
  - tocar mueve el cursor al caracter tocado (`TextLayoutResult.getOffsetForPosition`);
  - contador `n/100` solo desde 90 caracteres;
  - texto gris "Escribe en el chat…" cuando esta vacio (es/en/pt).
- Solo aparece con texto sincronizado activo (`TextoTeclado.estado != null`). Sin `CAP_TEXTO` o con el ajuste apagado todo queda como hoy.
- Distribucion segun el espacio libre `libre = alto - teclado` (en dp):
  - `libre >= 40 + 40 + 96`: dos filas, la barra pegada al teclado y los chips encima;
  - si no: **una sola fila de 44 dp**, con la barra a la izquierda (peso 0.5) y los chips a la derecha con desplazamiento horizontal. Es el caso de SwiftKey en este telefono.
- El alto total que ocupan (`altoFranjaDbr`) se calcula en un solo lugar de `VMActivity.Screen` y lo usan la barra, los chips y el levantado del juego. Reemplaza el `chipsPx` actual.

### 2. Juego levantado (ajuste de lo que ya hay)
- Con la barra activa, el campo del chat del juego queda escondido justo debajo de la franja Dbr. Asi lo que sobra arriba muestra los ultimos mensajes y el popup de autocompletado, en lugar de repetir la linea que ya muestra la barra: `levantar = teclado + franja - distanciaAbajo - altoCampo`, con `altoCampo` de `canalArea.alto`. Sin barra, la cuenta de hoy.
- **Toques corregidos**: el desplazamiento aplicado se publica en un estado compartido (`DesplazamientoJuego.px`, junto a `ALTO_FILA_CHIPS` o en `CanalMovil`) y `Offset.sendPosition()` (`GameScreen.kt:1052`) suma ese valor a `y` antes de `sumPosition()`. Se verifica tambien el camino de los toques de LayerController o del mouse virtual, si usa otra conversion.
- Las sugerencias del popup ya salen como chips (`SUGERENCIAS`): no hace falta nada nuevo.

### Fuera de alcance
- Achicar la ventana (opcion 3) y el editor del teclado a pantalla completa (opcion 4).
- DbrCore no cambia.

### Archivos
- Nuevo: `ui/screens/game/elements/BarraTextoDbr.kt`, `ui/control/input/TextoTeclado.kt` (o dentro de `TextoDbrInput.kt`).
- `ui/control/input/TextoDbrInput.kt`: publicar el estado y mover el cursor.
- `ui/activities/VMActivity.kt` (`Screen`, ~769-883): calcular `altoFranjaDbr`, ubicar la barra y los chips, nueva cuenta del levantado y publicar el desplazamiento.
- `ui/screens/game/elements/FilaChipsDbr.kt`: aceptar `Modifier`/ancho para ir a la derecha de la barra en modo una fila.
- `ui/screens/game/GameScreen.kt`: `sendPosition` con el desplazamiento.
- `res/values*/strings_dbr.xml`: texto de ayuda de la barra vacia (es/en/pt).
- Test JVM: la cuenta de la distribucion (una o dos filas) y del levantado como funcion pura (`DistribucionTeclado.kt` en `canal_movil`).

### Pasos
0. Al aprobar: copiar este plan a `PLAN-canal-movil.md` como "Paso 8d" con una entrada en la bitacora.
1. `TextoTeclado` + publicar el estado desde `TextoDbrView`.
2. Funcion pura de distribucion y levantado, con tests.
3. `BarraTextoDbr` + cambios de `FilaChipsDbr`.
4. `VMActivity.Screen`: franja, levantado y desplazamiento publicado.
5. Toques corregidos en `GameScreen.sendPosition`.
6. Compilar, tests, APK por adb. Commit y push solo si el usuario lo pide.

### Verificacion
- `testDebugUnitTest --tests "*canal_movil*"` (desde la ruta real; si falla el daemon de Kotlin, `-Pkotlin.compiler.execution.strategy=in-process`), `assembleDebug` desde `X:`, instalar por adb.
- Telefono, TESTEO, SwiftKey en horizontal:
  - abrir el chat: una fila con la barra a la izquierda y los chips a la derecha; el texto se ve mientras escribes, con cursor, seleccion y subrayado del autocorrector;
  - encima se ven los ultimos mensajes del chat (el juego levantado); el popup de autocompletado tambien aparece como chips;
  - tocar la barra mueve el cursor; con mas de 90 caracteres aparece el contador;
  - tocar un mensaje o un link del chat levantado cae en el lugar correcto (toques corregidos);
  - Gboard, o SwiftKey con el teclado achicado: dos filas;
  - con "Teclado completo en el chat" apagado: como antes, sin barra.

## Paso 8e (aprobado 2026-11-11): el texto del chat siempre visible, sea cual sea el alto del teclado

### Context
Prueba de 8d en telefono: con SwiftKey en horizontal, barra de herramientas abierta y fila de numeros, el teclado
ocupa ~94% del alto (~21 dp libres de 360). La franja Dbr mide 44 dp y se ancla encima del teclado
(`VMActivity.kt`, `IntOffset(0, -imeHeight)`), asi que sale por arriba. `DistribucionTeclado.franja` no tiene caso
para `libre < 44 dp`. No se puede dibujar sobre el teclado (otra ventana). Objetivo: que el texto se vea siempre.

### Diseno: modos segun `libre = alto - teclado` (dp)
1. `libre >= 44+40+96`: dos filas (como hoy).
2. `libre >= 44`: una fila, barra + chips (como hoy).
3. `24 <= libre < 44`: barra compacta de alto = `libre`, sin chips, texto 12 sp.
4. `libre < 24`: pantalla completa del teclado (extract UI): `TextoDbrView` hace `restartInput` sin
   `IME_FLAG_NO_FULLSCREEN | IME_FLAG_NO_EXTRACT_UI`; el teclado muestra su editor con el texto (`getExtractedText`
   ya existe). Franja Dbr y levantado apagados. Se mantiene hasta cerrar el chat o el teclado.
   - Respaldo si el teclado ignora el extract UI: barra compacta pegada arriba (minimo 20 dp) + aviso unico.
5. La franja nunca sale por arriba: `offsetY = -min(imeAlto, alto - altoFranjaPx)`.

### Archivos
- `canal_movil/DistribucionTeclado.kt` (+ test): `Franja.modo`, `MIN_COMPACTA_DP`, offset seguro.
- `ui/control/input/TextoDbrInput.kt`: `pantallaCompleta` cambia `imeOptions` + `restartInput`; reset en `cerrar`.
- `ui/activities/VMActivity.kt` (`Screen`): modos, offset recortado, sin levantar en pantalla completa.
- `ui/screens/game/elements/BarraTextoDbr.kt`: variante compacta.
- `res/values*/strings_dbr.xml`: aviso (es/en/pt).

### Verificacion
- Tests `canal_movil`, `assembleDebug` desde `C:\dev\dbr-wt`, APK por adb.
- Telefono: SwiftKey con barra de herramientas (pantalla completa del teclado con el texto), sin ella (compacta o
  una fila, siempre entera), Gboard (dos filas), respaldo + aviso si SwiftKey no hace pantalla completa.

## Fase 8 restante (aprobada 2026-11-11): PvP unificado (8p), lock-on (8c), mando (8b)

### Context
`PLAN-canal-movil.md`: pasos 1-8 cerrados, 8d (barra de texto) hecho y pendiente de prueba en teléfono. Faltan L (mando) y M (lock-on). Al afinar salió que el lock-on necesita saber si hay PvP entre dos jugadores, y hoy hay 7 reglas PvP sueltas (ningún mod ve WorldGuard). El usuario pidió unificarlas dentro de la fase 8.

Orden: **8p → 8c → 8b**. Release de Android + juego en PC. El launcher Electron, el giroscopio y el flick stick quedan para un release posterior.

### Decisiones del usuario (2026-11-11)
- 8c antes que 8b. Mando de prueba: Xbox (BT/USB).
- PvP: servicio único y escalable, con **todos** los usos migrados en la fase 8.
- Lock-on: alcance **35 fijo** (como DBC). En PC se cambia de objetivo con el **clic de la rueda** y en el teléfono con un **botón "cambiar"** (solo visible con el lock activo). Las reglas de soltar y el ki oculto (<5%) quedan como en el plan. El aviso al fijado es un **ícono chico en el HUD**, sin nombre.
- Mando: ajustes **dentro del juego** (`core.ui`), iguales en PC y Android.
- Remapeo con dos vistas: lista por acción y dibujo del mando.
- Se puede asignar: acciones Dbr fijas, cualquier keybind, y tocar vs mantener. Combo fijo **LB + A/B/X/Y = técnicas 1-4**; el modificador se puede cambiar, pero no hay combos libres.
- Dos mapas: en partida y en menús. Un perfil por modelo de mando.
- Ajustes: sticks (zona muerta, sensibilidad H/V, curva, invertir Y), umbral de gatillos y vibración del mando.
- Entradas a los ajustes: Opciones > Controles, menú en partida Dbr y aviso al conectar un mando nuevo.
- Otras GUIs: saltar entre botones vanilla y, si no hay, cursor virtual.
- Teclado: en Android, el del sistema (con la barra del 8d). En PC, el teclado propio del juego.
- Radial: 8 casillas editables, hasta 3 páginas que se cambian con los gatillos.
- Vibración en Android: vibra el mando si tiene motor (API 31+), si no el teléfono.
- Natives de Jamepad dentro del jar de DbrCore, extraídas al iniciar; no se cargan en Android.

### 8p. Servicio PvP unificado
Modelo a copiar: `core.combate.GuardiaVida` (DbrCore) + `corelib.combate.GuardiaMod` (DbrCorePlugin): `Class.forName`, solo tipos JDK, append-only, sin `@Mod`.
- **DbrCore `core.combate.ReglasPvp`**: lista de proveedores `(UUID atacante, UUID victima) -> motivo de veto o null`. `permite(a, b)` y `motivo(a, b)` se llaman solo en el hilo del servidor. Lo pueden registrar los mods directo y los plugins por `corelib.combate.PvpMod`.
- **Proveedores en plugins (por `PvpMod`)**:
  - DbrCorePlugin: mundo (`world.getPVP()`) y WorldGuard (flag `PVP` en las dos posiciones; softdepend por reflexión).
  - DbrArenaPlugin `ArenaManager.canDamage`.
  - DbrTPersonalPlugin salas (`SalaProtectionListener`).
  - DbrBatallasPlugin protegidos (`Reglas`).
  - DbrStaffPlugin vanish (veto al atacante).
  - Cada plugin mantiene su listener Bukkit actual: el proveedor se agrega, no reemplaza nada.
- **Proveedor en mod**: DbrTierra `GuardiaZonas`. `RegionesDbc` (la copia a WorldGuard) se mantiene por ahora y se anota como duplicado.
- **Consumidores**:
  - DbrTalentosMod `Efectos.fijarPvp` lee de `ReglasPvp`; `MotorPuente` deja el evento de daño falso.
  - DbrKiMod `RazaKi` (AoE y curas): `Combate.enPvp && ReglasPvp.permite`.
  - Lock-on (8c).
  - DbrCombatTagPlugin sin cambio: marca golpes reales, y eso ya respeta las reglas.
- Fuera: InvasionPlugin y AldeasPlugin (no son PvP).
- Tests: `ReglasPvp` (JUnit, puro) y `PvpMod` con dbr-testkit.

### 8c. Lock-on nuevo (DbrKiMod)
- **Mixin en `JRMCoreCliTicH`** (DbrKiMod ya tiene mixins): anula el toggle de Z (:233-247) y el `setAngles` de golpe (:162-183). Se sigue escribiendo el mismo campo `lockOn`, así que no cambian el render de Ki Sense, `GuiadoCliente` ni `CineCliente.soltarLockOn`. Se respeta `JRMCoreConfig.lockon`.
- **Cliente `cliente/LockOn.java`**:
  - Elige el objetivo más cercano a la mira dentro de 35 bloques. Hace falta Ki Sense (`SklLvl(6) > 0`).
  - Objetivos: NPCs, jefes y mobs; jugadores solo si el servidor lo acepta.
  - Cámara suave (~80 ms, exponencial) en `RenderTickEvent START`: mueve `rotationYaw`/`rotationPitch` y los `prev*`. No pelea con `CamaraCine.activa()`.
  - Se suelta fuera de 35 bloques, sin línea de vista más de 1 s, con el objetivo muerto o al abrir un menú.
  - Cambiar objetivo: keybind nuevo "Cambiar objetivo" (por defecto el clic de la rueda; en el teléfono, el botón del layout) y el stick derecho (8b).
- **Red `KiRed`**:
  - Se reusa `0x10 FIJAR` (`Guiado`, que ya llega al cambiar y cada 20 ticks).
  - El servidor valida al recibirlo: Ki Sense > 0, distancia ≤ 35, línea de vista (1 s de gracia), objetivo jugador con `jrmcRelease >= 5` y `ReglasPvp.permite`.
  - Nuevos S→C: `0x0C LOCK_RECHAZO` (el cliente suelta) y `0x0D FIJADO` (on/off al jugador fijado).
  - Los topes de `Guiado` no cambian.
- **HUD del fijado**: ícono chico cerca de la mira (zona `core.hud`, ícono del atlas Dbr) mientras alguien te tiene fijado.
- **Android**: bit nuevo `ESTADO` "lock activo" (`EstadoMovil.java` + `EstadoDbr.kt`). En el layout oficial, botón "cambiar" con `dbrShowIf = lock`.
- **DbrAntiCheat**: no hay check de snap; `KillAuraCheck` marca a más de 80°. Verificar con dbr-test que el melee con lock no suma VL.

### 8b. Mando (`core.mando` en DbrCore)
0. **Verificar en el juego** qué keybinds lanzan las técnicas DBC 1-8, transformar, dash y volar. `options.txt` no tiene teclas de técnicas, y `TalentosTeclas` menciona hotbar y F4. Esto define las "acciones Dbr fijas".
1. **Núcleo**:
   - `EstadoMando` (botones + 6 ejes) y la interfaz `Backend`.
   - `Accion` (fijas Dbr o keybind por descripción) y `Mapeo` (partida y menús; tocar vs mantener; modificador LB fijo y editable).
   - `Perfil` por modelo en `config/dbrcore/mando/<modelo>.json`.
   - Simula teclas con `KeyBinding.setKeyBindState`/`onTick` (patrón `DbrAutoClicker/ClickerTicker`; hotbar en `KeyInputEvent` según `TalentosTeclas`).
   - Cámara con zona muerta, curva y sensibilidad; umbral de gatillos.
   - Cambio automático entre mando y teclado/táctil.
   - Tests puros (mapeo, tocar/mantener, zona muerta).
2. **Backend Android (canal)**:
   - `CAP_MANDO = 1<<9`.
   - `MANDO_ESTADO` 106 (launcher → juego, solo al cambiar, como mucho uno por fotograma, ~20 B).
   - `MANDO_INFO` 107 (modelo, conectado/desconectado).
   - Con `HOLA` que trae `CAP_MANDO`, el launcher no usa el remapper de ZL2 (`GameHandler.shouldIgnoreKeyEvent`, `SimpleGamepadCapture`).
   - Los controles táctiles ya se esconden con mando (`hideWhenGamepad`).
   - `VibradorDbr`: usa `InputDevice.vibratorManager` si el mando tiene motor; si no, el teléfono.
   - Con mando, el chat abre el teclado del sistema (barra 8d).
3. **Backend PC (Jamepad 2.x)**:
   - Va shadeado en DbrCore. Natives a `.minecraft/natives/dbr` al iniciar, solo si no es Android (`Plataforma`).
   - Vibración del mando.
   - Licencias Apache 2.0 + zlib en `CREDITOS.txt` (skill dbr-licencias).
4. **Navegación**:
   - `GuiContainer`: el cursor salta de slot en slot.
   - `UiScreen`: anillo de foco. Se registran los rects de `hit()` en cada fotograma (`UiScreen.java:1337`).
   - Pantallas vanilla: salto por `buttonList`; si no hay botones, cursor virtual.
   - Guía de botones según el contexto.
5. **Teclado en pantalla (solo PC)**: QWERTY con ñ, chips y autocompletado arriba. X borra, Y pone espacio, Start envía, los gatillos mueven el cursor.
6. **Radial (RB)**:
   - 3 páginas de 8 casillas editables, que se cambian con los gatillos.
   - Por defecto: técnicas 5-8, F5, lista de jugadores, ocultar HUD, ajustes del mando.
7. **Iconos y ajustes**:
   - Atlas de glifos Xbox/PS/Switch/genérico con mc-pixel-art, sin logos.
   - Pantalla `core.ui` de ajustes: lista por acción + dibujo del mando, perfiles, sticks, gatillos, vibración, prueba en vivo y restaurar valores.
   - Entradas: botón "Mando" en Opciones > Controles, pestaña en el menú en partida Dbr y aviso al conectar un modelo nuevo.

### Archivos clave
- DbrCore: `core/combate/ReglasPvp.java` (nuevo), `core/mando/*` (nuevo), `core/movil/Canal.java` + `EstadoMovil.java`, `ui/UiScreen.java`, `ui/IconAtlas.java`.
- DbrCorePlugin: `corelib/combate/PvpMod.java` (nuevo), proveedores mundo y WorldGuard.
- DbrKiMod: `cliente/LockOn.java`, mixin `JRMCoreCliTicH`, `red/KiRed.java`, `logica/Guiado.java`, `logica/RazaKi.java`.
- DbrTalentosMod `efecto/Efectos.java` + DbrTalentosPlugin `MotorPuente.java`. DbrTierra `GuardiaZonas.java`. Plugins Arena, TPersonal, Batallas y Staff (un proveedor cada uno).
- Launcher: `canal_movil/Protocolo.kt`, `CanalMovil.kt`, `VibradorDbr.kt`, `GameHandler`, `EstadoDbr.kt`, layout oficial.

### Verificación
- Tests: `ReglasPvp`, `PvpMod` (testkit), núcleo `core.mando`, `canal_movil` (`MANDO_*`) y `mvn test` de cada plugin tocado.
- dbr-test (servidor aislado):
  - PvP: en spawn/WorldGuard, Arena y sala no hay lock ni AoE de ki entre jugadores; en zona PvP sí.
  - Lock-on: el melee con lock no suma VL en DbrAntiCheat.
- Teléfono con Xbox: combate, LB+botón, radial, navegación de inventario y `UiScreen`, chat con teclado del sistema, vibración en el mando, botón "cambiar" del lock.
- PC con Xbox: lo mismo con Jamepad, más el teclado en pantalla.
- Desconectar el mando a mitad de partida: vuelven los controles táctiles o el teclado.

### Al aprobar
1. Copiar este plan a `PLAN-canal-movil.md` como "Fase 8 restante" y anotarlo en la bitácora.
2. Empezar por 8p.
3. Commit y push solo si el usuario lo pide.

## Pruebas pendientes en telefono
- Ninguna de los pasos 5 y 6: 5a, 5b, 6a, 6b y 6c probados por el usuario (2026-11-11).
- 8d/8e: probados por el usuario (2026-11-11).

- 2026-11-11: commit y push de 8p, 8c y 8b en todos los repos. Desplegado: DbrServerPack-5.8.0.jar (14:23) y los plugins Core, Arena, TPersonal, Batallas, Staff y Talentos en TESTEO (backups .bak-20261111-mando; TESTEO estaba apagado, no se reinicio) y el pack en DBR-ASSETS experimental (989f3db). Capturas de /dbrmando en 3 idiomas en curso para la critica.

- 2026-11-11: critica de capturas de /dbrmando (3 idiomas): 5,5/10. P0 pestaña prueba cortada (mando de 120 px no cabe, mando fantasma sin mando). P1: rail con 7 iconos iguales; nombres de keybind sin traducir (Turbo Mode, Form Wheel); cabecera de grupo "Dbr" en elegir sin separador. P2: panel botones bajo, iconos/gatillos vacios, glifos sin color, vibracion corta fila. Avisos de fuente (Í, ãõ) = falso positivo. Pendiente: arreglos con OK del usuario.

- 2026-11-11: arreglados P0/P1 de la critica: prueba sin mando = estado vacio con CTA y mando en 2 filas (~65 px); rail con icono por pestaña (hook `SettingsScreen.iconoPestana`); 14 teclas JRMCore/DBC traducidas (`dbrcore.mando.tecla.*`, `NombreAccion.claveTecla`); cabecera "Acciones Dbr" con divisor. Verificado con capturas en 3 idiomas. Sin commit. Quedan los P2.

- 2026-11-11: P2 de la critica: sin franja de ayuda en pestañas propias, vista previa de estilos de iconos y de umbral/combos en gatillos, color en A/B/X/Y (Xbox/PS). Commit d43a51a6, pack desplegado en TESTEO (.bak-20261111-mando2) y experimental (509594b). La fila cortada de Vibracion queda: es el scroll general de SettingsScreen.

- 2026-11-11: vista previa de iconos ajustada al alto (4 filas siempre). Commit 6a047aae, pack en TESTEO y experimental. Verificado con capturas es_ES/pt_BR.

- 2026-11-11: prueba en PC con mando, fallos y arreglo (3d17816e, experimental 526c865, TESTEO): tecnicas por JRMCoreH.EnAtSlct (no barra; DBC exige mano vacia); teclas virtuales como fisicas (Keyboard.keyDownBuffer) + KeyInputEvent propio (rueda de formas npcdbc); lo abierto desde la radial queda apretado hasta A/B; raton suelto = stick derecho mueve cursor (menu de acciones JRMCore); camara F5 directa; LB+abajo destransforma, ficha a LB+derecha (Perfil.VERSION 2, migracion); LB/RB cambian pestaña en UiScreen. Teclado en pantalla OK. Falta reprobar.

- 2026-11-11: prueba en PC: tecnicas, menus DBC y pestañas OK. Faltan turbo/vuelo lentos (DBC mira las teclas de movimiento), correr y guia de botones. Plan "Mando en PC, ronda 2" aprobado (abajo).

- 2026-11-11: ronda 2 hecha (6d36e442, experimental d475852, TESTEO, copia directa al cliente PC): teclas de movimiento desde el stick (turbo/vuelo DBC), LS corre, doble A vuela (Interprete @doble, perfil v3), GuiaBotones en menus y contexto (rueda, lock-on, sostenida) con opcion en Iconos. Capturas 3 idiomas OK. Falta prueba del usuario con Xbox (guia no visible sin mando en dbr-test).

- 2026-11-11: prueba ronda 2: doble A no volaba (toque baja/sube en la misma lectura y "mantener" re-apretaba: DBC alterna el vuelo cada tick); guia se apagaba con el cursor del mando (setCursorPosition genera eventos de raton). Arreglado: toques se aprietan una vez y sueltan a los 3 ticks; raton ignorado 300 ms tras actividad del mando. Desplegado + copia al cliente PC.

- 2026-11-11: pistas de partida tipo Bedrock (decision del usuario: todas): GuiaBotones.partida(Situacion) con romper/usar/colocar, atacar/hablar/fijar, comer/beber/tensar, nadar, volar (subir/bajar/dejar de volar), transformar/destransformar, tecnica elegida; max 3, del mapa real, se van a los 4 s. Desplegado + copia al cliente PC.

- 2026-11-11: diagnóstico frente al mando de Bedrock: en partida, 7 de 13 acciones vanilla estaban en su sitio. El usuario eligió el esquema punto por punto (sección "Mando: esquema vanilla", al final). Hecho en DbrServerPack dd2bdbaf (perfil v4 con migración solo de los perfiles de fábrica v3; las pistas de la rueda y del lock-on salen del mapeo real; tests del mando sin fallos), experimental 51edde0, TESTEO y copia al cliente PC. Falta la prueba del usuario con Xbox.

- 2026-11-11: prueba del esquema vanilla: todo OK salvo la rueda de formas desde ←, que crasheaba. Causa: al soltar la tecla, la rueda se cierra mientras se dibuja y la guía recibía partida sin situación (NPE). Arreglo: la guía no se dibuja si la pantalla ya cerró, y las teclas DBC (no `key.*`) que abren un menú desde un botón quedan sostenidas hasta A o B. DbrServerPack 86c7d438, experimental b90f9a2, TESTEO y copia al cliente PC.

- 2026-11-11: el usuario confirma que todo el mando en PC funciona por ahora (esquema vanilla, rueda de formas, vuelo, guia y pistas). Queda: telefono con mando por Bluetooth, lock-on y PvP en TESTEO, luego 9 y 10.

- 2026-11-11: el usuario confirma lock-on OK. Mando por Bluetooth en el telefono funcionaba pero con el mapeo viejo: el APK instalado era de las 12:13 y `MandoDbr` (puente al `core.mando`) es de las 14:22 (ff9d5b9), asi que mandaba el remapper de ZL2. APK nuevo compilado e instalado por adb (17:26); falta reprobar. Linux, PlayStation, giroscopio y flick quedan para despues. Nuevo: 8f, launchers navegables con mando (propuesta abajo, pendiente OK).
- 2026-11-11: 8f, texto en PC: el usuario elige teclado en pantalla.
- 2026-11-11: plan 8f aprobado (seccion "Paso 8f"). Se empieza 8f.1 (PC).
- 2026-11-11: 8f.1 escrito en DbrLauncher `main`, sin commit: `src/renderer/src/mando/` (entrada, navegar, teclado, Glifo, MandoRaiz con teclado en pantalla y pistas), montado en `App.tsx`, `FOCUSABLE` exportado, `data-mando-inicio` en Jugar, botones de ventana fuera de la navegacion, anillo de foco en `main.css`, 12 claves `mando.*`. typecheck y build OK; logica pura probada con esbuild (19/19). Falta prueba real con Xbox (`npm run dev`).
- 2026-11-11: 8f.1 probado por el usuario con Xbox: todo OK. Commit DbrLauncher 0f5047f (main). Se empieza 8f.2.
- 2026-11-11: 8f.2 escrito, sin commit: `ui/dbr/MandoLauncher.kt` (`dbrFoco` borde dorado, `rememberMandoConectado`, `FocoInicialConMando` pasa a modo teclado y enfoca Jugar, `dbrPestanasMando` LB/RB), aplicado en `GoldButton`/`StoneNavButton`, `MainScreen` (LB/RB alternan Inicio/Ajustes) y `LauncherScreen` (foco en Jugar); `MandoDbr.esMando` pasa a internal. compileDebugKotlin OK, APK instalado. Diagnostico por adb pendiente: el telefono estaba bloqueado con codigo.
- 2026-11-11: el usuario prueba 8f.2 y el mando en partida por Bluetooth: todo OK. **Paso 8f cerrado.** Sigue 9 (docs) y 10 (release coordinado).
- 2026-11-11: plan del paso 9 aprobado (sección "Paso 9", al final): spec `docs/canal-movil.md`, SECURITY_MODEL de launcher, DbrServerPack y DbrCorePlugin, docs/claude de DbrCore (movil, mando, autocompletado) y DbrCorePlugin (comandos, movil). Un subagente por repo.
- 2026-11-11: paso 9 hecho. Launcher: `docs/canal-movil.md` + 12 tipos e INV-5 en SECURITY_MODEL (tipo 8 no existe, hueco libre). DbrCore: `docs/claude/{movil,mando,autocompletado}.md` + INV-5 en DbrServerPack/SECURITY_MODEL. DbrCorePlugin: `docs/claude/{comandos,movil}.md`, indice nuevo, INV-9, skill dbr-corelib. Diferencias codigo-plan (documentado el codigo): recarga `/dbrcore comandos recargar`; claves `permitidos`/`bloqueados` en `filtro-comandos.yml`; arbol se reenvia cada 30 s (permisos tardan hasta 30 s), ocupado por paquete BLOQUEADOS cada 20 ticks; comandos de MyCommand sin chequeo de permiso (excepcion en INV-9); `FiltroTab` no mira permiso ni ocupado; ningun tipo dinamico registrado (homes/warps/kits los registra el plugin dueno); sin emisor `peligro.*`; `BackendCanal.recibirEstado` no recorta -128 (-1,008). Posibles arreglos para antes del 10, con OK del usuario.

## Siguiente paso

Reprobar el mando por Bluetooth con el APK nuevo. 8f cerrado (PC y Android con mando, probado). Siguiente: 9 (docs) y 10 (release coordinado). Antes: Fase 8 escrita, subida y desplegada (TESTEO + experimental). Mando en PC con Xbox probado y OK (2026-11-11). Falta probar a mano: telefono con mando por Bluetooth, lock-on y PvP en TESTEO; ver la lista de la respuesta del 2026-11-11 y la seccion Verificacion. Despues 9 (docs) y 10 (release android-v30 coordinado). Pendiente aparte: retoque L31 (glifos) cuando vuelva de Claude Design.

## Mando en PC, ronda 2 (aprobado 2026-11-11): movimiento DBC, correr, volar con doble toque y guía de botones

### Context
El usuario probó el mando en PC con el pack `ecf3c800`, copiado a mano. Las técnicas, los menús DBC y LB/RB ya funcionan. Quedan tres problemas:
1. **Turbo y vuelo van súper lentos.**
   - Causa: DBC mira las teclas de movimiento con `keyBindForward/Back/Left/Right.getIsKeyPressed()` (`DBCKiTech.java:246-250, 362, 403, 525`).
   - El stick solo mueve `MovimientoMando.moveForward/moveStrafe` y no aprieta esas teclas. DBC cree que no te mueves y no aplica la velocidad de dash ni la de vuelo.
2. **No hay botón para correr.** Vanilla 1.7.10 usa `key.sprint` (`keyBindSprint`, con `moveForward >= 0.8`).
3. **Falta una guía de botones en pantalla**, sutil y útil, como en Minecraft. El plan original la tenía (8b punto 4: "Guía de botones según el contexto") y no se hizo.

### Decisiones del usuario (2026-11-11)
- **Correr** pasa al clic del stick izquierdo (LS).
- **Volar** (`Energy Control/Flight`) pasa a **doble toque de A**. El salto suelto sigue saliendo al instante.
- **Guía:** menús + contexto.
  - En menús e inventario, una franja con 3-5 glifos.
  - En partida solo sale en situaciones especiales (lock-on, rueda abierta, menú DBC sostenido) y se desvanece.

### Cambios (todo en DbrCore `core.mando`, salvo los `.lang`)

### 1. Movimiento que DBC ve
- `Mando.mover()` aprieta con `TeclaVirtual.poner` los keybinds `keyBindForward/Back/Left/Right` según el stick izquierdo.
  - Umbral 0,3 por eje, con histéresis a 0,2.
  - Solo sin pantalla. Lleva su propio estado de qué está apretado y suelta al abrir pantalla, al desconectar y con el stick en reposo.
- `MovimientoMando` no cambia: el valor analógico sigue mandando sobre el 1/0 de las teclas.

### 2. Correr y volar
- **Perfil por defecto:**
  - `LS = key.sprint`
  - `A@doble = Energy Control/Flight`
  - `A = key.jump`, sin cambios
- **`Interprete`:**
  - Sufijo nuevo `Perfil.DOBLE = "@doble"` y `DOBLE_MS = 300`.
  - La acción normal del botón sale al apretar, como hoy, sin esperar.
  - Si llega un segundo toque antes de `DOBLE_MS` desde el anterior, sale además la acción `@doble` como toque (baja y sube).
  - Convive con `@mantener`: con las dos, cuenta como doble el segundo toque corto.
  - Tests nuevos en `InterpreteTest`:
    - doble dentro de la ventana → salto + vuelo;
    - fuera de la ventana → dos saltos;
    - con modificador no hay doble.
- **Migración `Perfil.VERSION = 3`**, en `migrar()`, solo si sigue como venía de fábrica:
  - si `LS` era Flight → `LS = key.sprint`;
  - si no hay `A@doble` → `A@doble = Flight`.
- **Pestaña Botones de `MandoAjustesScreen`:**
  - Una fila "doble toque" para A/B/X/Y, igual que la fila "mantener".
  - Lang `mando.cfg.botones.doble` en es/en/pt.
- **`NombreAccion`:** `key.sprint` ya tiene nombre vanilla; Flight ya está traducido.

### 3. Guía de botones (`core.mando.GuiaBotones`, nueva)
- **Parte pura, testeable:**
  - `List<int[]/Par> entradas(Contexto c, Perfil p)` → pares (Boton, texto).
  - En menús, el texto sale del mapa real `perfil.menus` vía `NombreAccion.de`, así respeta los remapeos.
- **Contextos y entradas:**
  - Contenedor (`GuiContainer`): A Elegir, X Clic derecho, Y Mover rápido, B Cerrar.
  - `UiScreen` con más de una sección: A Elegir, B Atrás, LB/RB Pestaña.
  - Otra pantalla: A Elegir, B Atrás.
  - Partida, rueda abierta: stick derecho Apuntar, LT/RT Página, soltar RB Elegir.
  - Partida, lock-on: stick derecho a un lado Cambiar objetivo, RS Soltar.
  - Partida, tecla sostenida (rueda de formas, menú de acciones): stick derecho Cursor, A Elegir, B Cerrar.
  - Con el teclado en pantalla no sale: `TecladoMando` ya muestra lo suyo.
- **Dibujo:**
  - Píldora oscura semitransparente con glifo de 10 px (atlas `GlifosMando`, con color si es A/B/X/Y) + etiqueta en fuente chica, separadas por 8 px.
  - En menús: abajo a la izquierda, en `alDibujarPantalla`.
  - En partida: abajo a la derecha, sobre la mano, en `alDibujarHud`. Entra en 150 ms y se va a los 4 s sin cambio de contexto.
  - Solo si `Mando.usandoMando()`, sin `hideGUI` y con la opción activa.
- **Opción:** `Perfil.guia = true` y campo `ConfigField.bool(ICONOS, "guia", true)` en la pestaña Íconos, que está casi vacía. Lang `mando.cfg.iconos.guia(.tip)`.
- **Lang de etiquetas** `dbrcore.mando.guia.*` (apuntar, pagina, elegir, cambiar_objetivo, soltar, cursor, cerrar, pestana) en es_ES/en_US/pt_BR + `tools/sync-lang.py`.

### Archivos
- DbrCore `core/mando/`: `Mando.java`, `Interprete.java`, `Perfil.java`, `MandoAjustesScreen.java`, `GuiaBotones.java` (nuevo).
- Tests: `InterpreteTest.java`, `PerfilMigracionTest.java`, `GuiaBotonesTest.java` (nuevo).
- Lang: `DbrCore/src/main/resources/assets/dbrcore/lang/{es_ES,en_US,pt_BR}.lang`.
- Reusar:
  - `TeclaVirtual.poner/buscar`
  - `GlifosMando.atlas/celda/color/estilo`
  - `NombreAccion.de`
  - `Dbc.fijando()`
  - `RadialMando.abierto()`
  - el estado `sostenida` de `Mando`

### Verificación
1. `./gradlew compileJava test --tests 'dbr.machitos.core.mando.*'` en DbrCore.
2. `sync-lang.py --check` y `check-scroll.py`.
3. dbr-test `--pasos mando-` en es_ES/en_US/pt_BR, con crítica de capturas por subagente: pestaña Botones con la fila "doble toque" y pestaña Íconos con la opción de guía.
4. Pack `./gradlew build`.
5. Commit + push de DbrServerPack (regla dbr-git, comprobar que no hay atribución).
6. Despliegue en TESTEO y DBR-ASSETS experimental. Mientras R2 siga sin actualizarse por el incidente de GitHub, también copia directa a `%APPDATA%/dbr-launcher/game/mods`.
7. Prueba del usuario con Xbox en PC:
   - turbo y vuelo a velocidad normal;
   - LS corre;
   - doble A vuela y A suelto salta al instante;
   - franja en inventario, pantallas Dbr y vanilla;
   - guía con lock-on, rueda y menú DBC.
8. Bitácora en `PLAN-canal-movil.md`.

## Mando: esquema vanilla (2026-11-11)

Decisiones del usuario: lo vanilla en el sitio de Bedrock y lo de DBC encima.

| Botón | Toque | Otro |
|---|---|---|
| RT / LT | atacar / usar | |
| A | saltar | doble: vuelo DBC |
| B | soltar objeto | |
| X | técnica elegida | LB+X: técnica 3 |
| Y | inventario | mantener: cargar ki |
| LB | barra anterior | mantener: modificador (LB+A/B/X/Y técnicas 1-4) |
| RB | barra siguiente | mantener: rueda |
| LS | correr | doble: turbo |
| RS | agacharse | LB+RS: lock-on |
| ↑ | cámara | LB+↑: transformar |
| ↓ | menú de acciones DBC | LB+↓: destransformar |
| ← / → | rueda de formas / Data Sheet | |
| BACK | chat | mantener: lista de jugadores |
| START | pausa | |

- **Rueda, página 1:** ocultar HUD, menú de acciones, lista de jugadores, destransformar, Info Panel, Scouter Functions, Story System y ajustes.
- **Menús:** sin cambios.
- **Migración v4:** solo pasa al esquema nuevo el perfil que seguía igual al de fábrica v3 con modificador LB. Al cambiar el modificador a RB, la barra sigue la posición de los botones.

## Paso 8f (aprobado 2026-11-11): launchers de PC y Android navegables con mando

### Context
El mando ya funciona en el juego (PC probado; Android con APK nuevo, falta reprobar). Fuera del juego los dos launchers solo se manejan con ratón o táctil. El usuario quiere elegir cuenta, ajustar y darle a Jugar solo con el mando. Decisiones (2026-11-11): en PC hay teclado en pantalla propio (opción 1). Linux, PlayStation, giroscopio y flick quedan para después.

Orden: **8f.1 PC** (repo `DbrLauncher`, rama `main`) y luego **8f.2 Android** (esta rama `android-zalith`).

### 8f.1 Launcher de PC (Electron 22 + React)
Raíz: `DbrLauncher/src/renderer/src/`. Pantallas: `App.tsx` (Login / Home / Settings según `store.tab`), `components/NavBar.tsx`, `components/ui.tsx` (`Btn`, `Toggle`, `Modal` con trampa de foco y constante `FOCUSABLE`), modales `GameLogModal`, `LiteProposalModal`, `UpdateOverlay`, `FuseBanner`.

Archivos nuevos en `mando/`:
1. **`useMando.ts`**: bucle `requestAnimationFrame` sobre `navigator.getGamepads()` (mapeo `standard`).
   - Flancos de botón y repetición al mantener (400 ms y después 120 ms). Stick con zona muerta 0,5 para moverse.
   - Ignora la entrada si `!document.hasFocus()` (con el juego abierto, el mando no toca el launcher).
   - Expone `modo` (`'mando' | 'raton'`). Pone `data-input="mando"` en `<body>` con la primera entrada del mando y lo quita al mover el ratón o al usar el teclado.
2. **`navegar.ts`** (puro, testeable): elige el siguiente elemento en una dirección.
   - Candidatos: el `FOCUSABLE` de `ui.tsx` (se exporta), visibles y con rectángulo distinto de cero.
   - Se limita al `[role=dialog]` / `[role=alertdialog]` de mayor z-index si hay uno abierto.
   - Puntaje: distancia en el eje principal más 2× el desvío lateral, solo con candidatos que estén en ese semiplano. Si no hay foco, toma el primero (o `[data-mando-inicio]`).
3. **`MandoRaiz.tsx`**: se monta una vez en `App.tsx` y usa el hook.
   - Cruceta y stick izquierdo mueven el foco. A hace `click()`. Sobre un input de texto, A abre el teclado. Sobre un `range`, izquierda/derecha cambian el valor (setter nativo + evento `input`, para que React lo vea).
   - B dispara `Escape` (lo cierra `Modal`). Sin modal, B en Settings vuelve a Home.
   - LB/RB cambian la pestaña principal (`setTab`). LT/RT cambian el `role="tablist"` visible (pestañas de Settings).
   - Start = Jugar (`[data-mando-inicio]` en el botón de `Home.tsx`). Stick derecho hace scroll del contenedor desplazable más cercano al foco.
   - Llama `scrollIntoView({block:'nearest'})` al mover el foco.
4. **`TecladoPantalla.tsx`**: copia del diseño de `DbrServerPack/DbrCore/.../core/mando/TecladoDisposicion.java` y `TecladoMando.java`. No se reusa el código Java.
   - Disposición QWERTY con ñ, página de símbolos y teclas especiales (mayús, borrar, símbolos, espacio, aceptar). Se pasa a una tabla TS.
   - Controles: A pulsa la tecla, X borra, Y pone espacio, Start acepta, LB mayúsculas, RB símbolos, LT/RT mueven el cursor del texto y B cierra sin cambios.
   - Con `type=number` solo muestra el teclado numérico (ancho y alto).
   - Escribe con el setter nativo del input + evento `input`. Al aceptar manda `Enter` y `blur`, para que `CommitInput` de Settings guarde y Login dispare `loginPirata`. Respeta `maxLength`.
   - Se dibuja como panel abajo, sin tapar el campo, con estilo `mc-panel`.
5. **`BarraPistas.tsx`**: solo en modo mando, una franja sobre la `NavBar` con glifos dibujados en CSS (sin logos): A Elegir, B Atrás, LB/RB Pestañas, Start Jugar. Las pistas cambian según el contexto (teclado abierto, modal).
6. **Estilo**: en `index.css` (o donde estén las clases `mc-*`), un anillo de foco visible solo con `body[data-input=mando] :focus`.
7. **Textos**: claves nuevas `mando.*` en `src/shared/i18n.ts` (es, en, pt).

Lo que se toca de lo existente: `App.tsx` (montar), `ui.tsx` (exportar `FOCUSABLE`), `Home.tsx` (`data-mando-inicio`), `i18n.ts` y el CSS. Nada en `main/`.

### 8f.2 Launcher de Android (ZL2 Compose)
Android ya convierte la cruceta y el stick en movimiento de foco, A en confirmar y B en Atrás. Lo que falta es ver dónde está el foco y los atajos.
1. **Diagnóstico por adb, sin código**: `adb shell input gamepad keyevent KEYCODE_DPAD_DOWN|BUTTON_A|BUTTON_B` en Inicio, Ajustes, Cuentas, Versiones y diálogos. Las capturas las revisa un subagente que devuelve una lista: pantalla, elemento no alcanzable o foco invisible.
2. **`ui/dbr/DbrComponents.kt`**: nuevo `Modifier.dbrFoco()` (`onFocusChanged` + borde dorado de 2 dp). Se aplica en `GoldButton`, `StoneNavButton` y `DbrBottomBar`, y en los elementos que el diagnóstico marque.
3. **Foco inicial en Jugar** (`ui/screens/content/LauncherScreen.kt:251`, `FocusRequester`) cuando hay un mando conectado (`InputManager`, con el mismo filtro `esMando` que `MandoDbr`).
4. **`ui/activities/MainActivity.kt` `dispatchKeyEvent`**: LB/RB alternan Inicio ↔ Ajustes (las mismas lambdas `toMainScreen` / `toSettingsScreen` que usa `DbrBottomBar` en `MainScreen.kt:229`, por `EventViewModel`). No toca `isCaptureKey` ni `VMActivity` / `MandoDbr`.
5. Los campos de texto abren el teclado del sistema (no hace falta código).

### Verificación
- PC: `npm run typecheck` / `npm run build`. Prueba `navegar.ts` si el repo tiene runner (si no, se agrega vitest solo si el usuario lo aprueba).
- PC, prueba real con Xbox (`npm run dev`):
  - Login con nick por teclado en pantalla.
  - Home: Start juega.
  - Settings: pestañas con LT/RT, sliders de RAM, ancho y alto numéricos, JVM con texto.
  - Modales: log, Lite, cambio de variante. B cierra.
  - El ratón apaga el anillo de foco.
  - Con el juego abierto, el mando no mueve el launcher.
- Android: `compileDebugKotlin`, APK con `subst X:` (memoria `android-apk-local-build-subst`) e instalación por adb. Repetir el diagnóstico de adb y probar con el mando por Bluetooth.
- Release: PC por tag `vX.Y.Z` (CI). Android entra en el `android-v30` del paso 10.

### Al aprobar
- Pasar este plan a `PLAN-canal-movil.md` (reemplaza la propuesta 8f) con una línea en la bitácora y commit.
- Luego empezar 8f.1.

## Paso 9 (aprobado 2026-11-11): documentación

### Context
Pasos 0–8f hechos y probados (2026-11-11). Antes del release coordinado (paso 10) falta dejar escrito lo
construido. Estado actual de la documentación:
- Launcher `DbrLauncher-android`: no existe `docs/canal-movil.md` (la spec prometida en el bloque A).
  `SECURITY_MODEL.md` lista solo 3 de los 15 tipos del canal (`NOTIFICAR`, `TEXTO_ESTADO`, `TEXTO_EDITAR`).
- DbrCore (`DbrServerPack/DbrCore`): `core.movil` (12 clases) y `core.mando` (19 clases) sin doc en
  `docs/claude/`. `DbrServerPack/SECURITY_MODEL.md` no menciona canal, móvil ni mando.
- DbrCorePlugin: `corelib.comandos` (autocompletado, filtros, Tab, migración de DbrAntiCommand) y
  `corelib.movil` sin doc. `CLAUDE.md` (295 B) no tiene índice "Detalle por tema"; remite a la skill
  `dbr-corelib`, que tampoco los menciona. `SECURITY_MODEL.md` tiene INV-8 (DBRVIBRAR/DBRNOTIF) pero no el
  paquete de autocompletado ni el filtro de Tab.

Solo docs. Sin cambios de código. Las fuentes de verdad son el código: cada número (largos, rate limit,
caps) se copia leyendo `Protocolo.kt`, `CanalMovil.kt`, `glfw_shim.c` y las clases Java, no del plan.

### 9a. Launcher (`DbrLauncher-android`, rama `android-zalith`)
1. **`docs/canal-movil.md`** (nuevo, spec canónica):
   - Transporte: `GLFW.dbrSend`/`dbrPoll` en el stub LWJGL2Bridge, native `glfw_shim.c`, ring buffer de
     32, `CallbackBridge.onDbrMessage`; flag `-Ddbr.movil.canal=1` (`LaunchArgs.kt`).
   - Formato: byte de versión `PROTO`, big-endian, handshake `HOLA`/`HOLA_ACK` con bits `CAP_*`.
   - Tabla por tipo (id, sentido, payload campo a campo, largo, rate limit, cap, clase Kotlin y clase
     DbrCore): 1–9 juego→launcher, 101–107 launcher→juego.
   - Cómo agregar un tipo nuevo (append-only, cap nuevo, test en `CanalMovilTest`, fila en
     SECURITY_MODEL).
2. **`SECURITY_MODEL.md`**: filas de Entradas para los 12 tipos faltantes (incluye `ABRIR_URL` +
   `UrlSegura`, `MANDO_ESTADO`/`MANDO_INFO`, `VIBRAR` con topes en código y JSON firmado), invariante del
   canal (nada se interpreta como ruta/intent/comando; versión distinta = canal apagado), `file:` quitado de
   `ZLNativeInvoker.openLink`. Enlace a `docs/canal-movil.md`.
3. `CLAUDE.md` del worktree: una línea a `docs/canal-movil.md`.

### 9b. DbrCore (`DbrServerPack`)
1. **`DbrCore/docs/claude/movil.md`**: `core.movil` — activación (flag + clase presente, en PC no carga),
   `DetectorCampo` (orden de detección), `ChipsMovil`, `TextoMovil`, `Vibrar`, `Notificar`, `Pantalla`,
   `ModoReducido`, reglas (try/catch, nada del canal va al servidor). Enlaza la spec del launcher.
2. **`DbrCore/docs/claude/mando.md`**: `core.mando` — backends (Jamepad PC, `BackendCanal` Android),
   `Perfil` + versión y migraciones (v2–v4), esquema vanilla, `Interprete` (@doble, toques de 3 ticks,
   ratón ignorado 300 ms), `TeclaVirtual` (keyDownBuffer + KeyInputEvent), radial, teclado, `GuiaBotones`,
   `/dbrmando`, trampas encontradas en las pruebas (NPE de la rueda, DBC alterna vuelo por tick).
3. **`DbrCore/docs/claude/autocompletado.md`** (lado cliente): popup del chat, fuentes, Tab vanilla con
   300 ms / 3 por s.
4. Índice "Detalle por tema" de `DbrCore/CLAUDE.md`: 3 líneas. Sin más texto en CLAUDE.md.
5. **`DbrServerPack/SECURITY_MODEL.md`**: entradas del canal (launcher→juego), del paquete de
   autocompletado (S→C) y del mando; invariante "el canal nunca reenvía al servidor".

### 9c. DbrCorePlugin
1. **`docs/claude/comandos.md`**: `corelib.comandos` — filtro (árbol ∩ permiso ∩ no bloqueado ∩ no
   ocupado), YAML de uso (`PatronUso`, tipos), chips y lista fija de riesgosos, `FiltroTab` (ProtocolLib),
   migración de DbrAntiCommand y su retiro.
2. **`docs/claude/movil.md`**: `corelib.movil` — `Notificar`/`NotificarEventos`, `Vibrar`/`VibrarEventos`,
   `PrivadosEssentials`, canales `DBRNOTIF`/`DBRVIBRAR`.
3. `CLAUDE.md`: sección "Detalle por tema" nueva con esas 2 líneas.
4. **`SECURITY_MODEL.md`**: entradas del paquete de autocompletado y del filtro de Tab; invariante "solo
   comandos que el jugador puede usar salen al cliente".
5. Skill `dbr-corelib` (`~/.claude/skills/dbr-corelib/SKILL.md`): 2 líneas que apuntan a los docs nuevos
   (no se copia el detalle; la skill ya pesa 20 KB).

### Método
- Un subagente por repo (3, en paralelo) lee el código y escribe los docs de su repo; vuelve con la lista
  de archivos y cualquier diferencia entre código y plan. Yo reviso los diffs.
- Commits por repo con la skill `dbr-git` (Conventional Commits en español, `docs(...)`), sin push hasta
  el OK del usuario.
- Bitácora de `PLAN-canal-movil.md`: plan del paso 9 + línea al cerrar cada subpaso.

### Verificación
- Cada número de la spec cruzado contra `Protocolo.kt` y los Java (el subagente lista las constantes que
  usó con su archivo:línea).
- `grep` de los 15 tipos en `SECURITY_MODEL.md` del launcher: todos presentes.
- Enlaces relativos de los índices apuntan a archivos que existen.
- `CLAUDE.md` de DbrCore sigue bajo 20k caracteres (hoy 10,3k).
- Sin cambios de código: `git diff --stat` solo muestra `.md`.

### Siguiente
Paso 10: prueba completa y release coordinado `android-v30`.
