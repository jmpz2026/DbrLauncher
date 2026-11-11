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

## Pruebas pendientes en telefono
- 6a (variante experimental, TESTEO reiniciado): `adb shell cmd thermalservice override-status 3` -> cartel de calor; Reducir -> resolucion baja en caliente, particulas minimas, distancia <= 6, VFX en Baja; `override-status 0` -> cartel Restaurar y todo vuelve; `adb shell dumpsys battery unplug` + `set level 14` -> aviso 15%, `set level 4` -> aviso 5%; al final `cmd thermalservice reset` y `dumpsys battery reset`.
- 6c: menu en partida > pestana estrella: cada interruptor hace efecto (vibracion, avisos, chips al abrir el chat, modo reducido on/off, toque ampliado al reabrir una pantalla Dbr); slider de resolucion cambia sin reiniciar en 1.7.10.
- 6b: en horizontal con la muesca a un lado, una pantalla Dbr grande (caja maxima) y el HUD Dbr no quedan debajo de la muesca; girar el telefono 180 grados y ver que cambian de lado. Tocar justo al lado de un boton chico (X de cerrar, flechas de scroll, casillas) lo activa; tocar entre dos botones activa el mas cercano; arrastrar un HUD con el editor y que no salte.

## Siguiente paso

Paso 8 (F, texto sincronizado): hecho, empujado y desplegado (TESTEO + experimental + APK). Toca la prueba en telefono de "Verificacion" del paso 8. Paso 7 cerrado. Paso 6 hecho y desplegado (pruebas pendientes).
- 5a (D, controles por contexto): `core.dbc` en DbrCore (mover `DbrCamaraMod/client/Dbc.java`, DbrCamaraMod lo usa); mensaje `ESTADO` (tipo 4, juego -> launcher, bits: cargando ki, transformando, chat, contenedor, pantalla Dbr, otra pantalla; solo al cambiar); `CAP_ESTADO`; LayerController: campos opcionales `mostrarSi`/`ocultarSi` (listas de estados) en capa y widget, compatibles con layouts viejos; evaluacion en `Layout.kt` junto a `VisibilityType`; fundido 120 ms y boton tocado no desaparece hasta soltar; editor: seccion "Condiciones" con casillas; layout oficial Dbr con condiciones.
- 5b (E, vibracion): mensaje `VIBRAR` (tipo 5, id corto + fuerza); `core.movil.Vibrar` con los eventos del plan; catalogo `vibracion.json` en DBR-ASSETS verificado por `DbrSync`; topes en codigo (duracion, pulsos, separacion, por segundo); ajustes (general, intensidad, por categoria) sobre `VibrationHandler`.
