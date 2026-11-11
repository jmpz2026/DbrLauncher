# Canal móvil juego <-> launcher

Especificación del canal entre el juego (Minecraft 1.7.10, mod DbrCore) y DbrLauncher Android
(fork de Zalith Launcher 2). Es la fuente de verdad: si el código y este archivo discrepan,
se arregla uno de los dos en el mismo cambio. Modelo de amenazas: [SECURITY_MODEL.md](../SECURITY_MODEL.md).

Rutas (desde la raíz del repo):

- Kotlin: `android/ZalithLauncher2/ZalithLauncher/src/main/java/com/movtery/zalithlauncher/game/support/canal_movil/`
- Nativo: `android/ZalithLauncher2/ZalithLauncher/src/main/jni/dbr_canal/` y `.../jni/glfw_shim/glfw_shim.c`
- Puente LWJGL2: `android/ZalithLauncher2/LWJGL2Bridge/src/main/java/org/lwjgl/glfw/GLFW.java`
- Lado juego (repo DbrServerPack): `DbrCore/src/main/java/dbr/machitos/core/movil/` y `core/mando/BackendCanal.java`
- Tests: `.../src/test/java/com/movtery/zalithlauncher/game/support/canal_movil/` (`CanalMovilTest.kt` y un archivo por tema)

## Transporte

Ambos sentidos llevan `(tipo, bytes)`. La capa nativa solo mueve arreglos acotados; nunca
interpreta un payload. La validación de cada tipo vive en el launcher (`Protocolo.kt`,
`CanalMovil.kt`) y en DbrCore (`core.movil`).

**Juego -> launcher**

1. DbrCore llama `GLFW.dbrSend(tipo, datos)` (clase `org.lwjgl.glfw.GLFW` del LWJGL2Bridge). Devuelve
   `false` si `tipo` no está en 1..255, `datos` es null o pesa más de 1024 bytes. No lanza.
2. `nDbrSend` (`glfw_shim.c`) vuelve a comprobar el largo (`0..DBR_CANAL_MAX_PAYLOAD`) antes de copiar
   a un buffer de pila de 1024 bytes y llama `dbr_canal_to_android`.
3. `dbr_canal_to_android` (`dbr_canal.c`) exige tipo 1..255 y largo 0..1024, y llama por JNI a
   `CallbackBridge.onDbrMessage(int, byte[])` en la VM de Android, en el hilo del juego.
4. `onDbrMessage` llama `CanalMovil.recibir(tipo, datos)` y atrapa cualquier `Throwable`.

**Launcher -> juego**

1. El launcher llama `CanalMovil.enviar` y este llama `CallbackBridge.nativeDbrPush(tipo, datos)`. Antes
   se rechaza todo payload de más de `Protocolo.MAX_PAYLOAD`.
2. `nativeDbrPush` (`dbr_canal.c`) comprueba tipo y largo antes de copiar y encola en un anillo de
   `DBR_CANAL_QUEUE_SLOTS` = 32 mensajes. Si está lleno se descarta el más viejo.
3. DbrCore llama `GLFW.dbrPoll()` una vez por tick de cliente, hasta 32 veces por tick. Devuelve un
   `byte[]` con el tipo (sin signo) en el byte 0 y el payload desde el byte 1, o `null` si no hay nada.

`libpojavexec.so` se carga una vez por proceso (VM de Android y luego JVM del juego), por eso la cola
estática es compartida por los dos lados.

| Constante | Valor | Dónde |
|---|---|---|
| `DBR_CANAL_MAX_PAYLOAD` / `Protocolo.MAX_PAYLOAD` / `GLFW.DBR_CANAL_MAX_PAYLOAD` | 1024 | `dbr_canal.h:14`, `Protocolo.kt:17`, `GLFW.java` |
| `DBR_CANAL_QUEUE_SLOTS` | 32 | `dbr_canal.h:16` |
| `Protocolo.VERSION` / `GLFW.DBR_CANAL_VERSION` | 1 | `Protocolo.kt:16`, `GLFW.java` |

## Activación

- `LaunchArgs.kt` añade `-Ddbr.movil.canal=1` solo cuando el juego usa LWJGL 2 nativo (`usesLwjgl2`).
- DbrCore activa `core.movil` solo con ese flag, en el launcher DbrLauncher (`Plataforma.esLauncherDbr()`),
  con `GLFW.DBR_CANAL_VERSION == 1` y los métodos `dbrSend` y `dbrPoll` presentes. Si la versión no
  coincide, el canal queda apagado y el juego sigue normal.
- En PC no hay canal.

## Formato de mensaje

- Todo payload empieza con 1 byte: la versión (`PROTO` = 1). Los números van en big-endian.
- El tipo viaja aparte (parámetro `tipo`), salvo en `dbrPoll`, donde es el byte 0. Las tablas de abajo
  describen el payload **sin el tipo**, y siempre empiezan por el byte de versión. Los largos incluyen ese byte.
- Un mensaje con versión distinta, tipo desconocido, largo que no calza exacto o campo fuera de regla
  se descarta. El parser (`Protocolo.leer`) devuelve `null` y nunca lanza. Se loguea una vez por tipo.
- Lado juego: `Canal.procesar` ignora mensajes de menos de 2 bytes o de versión distinta, y los tipos desconocidos.
- Los tipos 1..9 van juego -> launcher; 101..107 van launcher -> juego. El tipo 8 no se usa (hueco libre).

## Handshake

1. Al conectar, DbrCore envía `HOLA` con su máscara de capacidades.
2. El launcher marca el canal como conectado, guarda las capacidades del juego y responde `HOLA_ACK` con las
   suyas. Luego reinicia el estado del mando, reenvía `REDUCIR` si el modo reducido ya estaba activo y envía `PANTALLA`.
3. Hasta que llega `HOLA`, el launcher descarta todo lo demás. Hasta que llega `HOLA_ACK`, DbrCore no envía
   nada que dependa de una capacidad ni acepta tipos launcher -> juego con capacidad (`Canal.launcherSoporta`).
4. El launcher envía `REDUCIR`, `PANTALLA` y los tipos de mando solo si el juego anunció `CAP_REDUCIR`,
   `CAP_PANTALLA` o `CAP_MANDO`. Acepta `TEXTO_ESTADO` solo si el juego anunció `CAP_TEXTO`.
5. `CanalMovil.reiniciar()` (al lanzar un juego nuevo) vuelve todo a "no conectado".

Capacidades (`Protocolo.kt:48-59`, `Canal.java:50-59`). Ambos lados anuncian los diez bits (`0x3FF`):

| Bit | Constante | Valor | Qué habilita |
|---|---|---|---|
| 0 | `CAP_AREA_TEXTO` | `1 << 0` | `AREA_TEXTO` |
| 1 | `CAP_ABRIR_URL` | `1 << 1` | `ABRIR_URL` |
| 2 | `CAP_CHIPS` | `1 << 2` | `SUGERENCIAS`, `INSERTAR` |
| 3 | `CAP_ESTADO` | `1 << 3` | `ESTADO` |
| 4 | `CAP_VIBRAR` | `1 << 4` | `VIBRAR` |
| 5 | `CAP_REDUCIR` | `1 << 5` | `REDUCIR` |
| 6 | `CAP_PANTALLA` | `1 << 6` | `PANTALLA` |
| 7 | `CAP_NOTIFICAR` | `1 << 7` | `NOTIFICAR` |
| 8 | `CAP_TEXTO` | `1 << 8` | `TEXTO_ESTADO`, `TEXTO_EDITAR` |
| 9 | `CAP_MANDO` | `1 << 9` | `MANDO_ESTADO`, `MANDO_INFO` |

## Tipos de mensaje

Juego -> launcher (el launcher valida con `Protocolo.leer` y `LimiteRitmo`):

| Id | Nombre | Cap | Largo del payload (bytes) | Ritmo (ráfaga, por segundo) | Clase Kotlin | Clase DbrCore |
|---|---|---|---|---|---|---|
| 1 | `HOLA` | - | exacto 5 | 2, 0.5 | `CanalMovil` | `Canal` |
| 2 | `AREA_TEXTO` | `CAP_AREA_TEXTO` | exacto 2 o 18 | 20, 20 | `CanalMovil` (`areaTexto`) | `DetectorCampo` |
| 3 | `SUGERENCIAS` | `CAP_CHIPS` | 2, o variable hasta 1024 | 10, 10 | `CanalMovil` (`sugerencias`) | `ChipsMovil` |
| 4 | `ESTADO` | `CAP_ESTADO` | exacto 5 | 20, 20 | `CanalMovil`, `EstadoDbr` | `EstadoMovil` |
| 5 | `VIBRAR` | `CAP_VIBRAR` | 4 a 35 | 8, 8 | `VibradorDbr`, `Vibracion` | `Vibrar` |
| 6 | `NOTIFICAR` | `CAP_NOTIFICAR` | 4 a 51 | 4, 1 | `NotificadorDbr`, `Notificaciones` | `Notificar` |
| 7 | `TEXTO_ESTADO` | `CAP_TEXTO` | 14 a 414 | 25, 25 | `TextoSincronizado` | `TextoMovil` |
| 9 | `ABRIR_URL` | `CAP_ABRIR_URL` | 2 a 1024 | 1, 0.5 | `CanalMovil` -> `ZLNativeInvoker.openLink` + `UrlSegura` | `Movil` |

Launcher -> juego (DbrCore valida en `Canal.procesar` y en la clase de cada tipo):

| Id | Nombre | Cap | Largo del payload (bytes) | Ritmo | Clase Kotlin | Clase DbrCore |
|---|---|---|---|---|---|---|
| 101 | `HOLA_ACK` | - | exacto 5 | sin límite | `Protocolo.holaAck` | `Canal` |
| 102 | `INSERTAR` | `CAP_CHIPS` | 3 a 302 | 5, 5 (`ritmoInsertar`) | `CanalMovil.insertar` | `ChipsMovil.recibirInsertar` |
| 103 | `REDUCIR` | `CAP_REDUCIR` | exacto 2 | sin límite | `AvisosSistema` | `ModoReducido` |
| 104 | `PANTALLA` | `CAP_PANTALLA` | exacto 26 | sin límite (se omite si no cambió) | `CanalMovil.actualizarPantalla` | `Pantalla` |
| 105 | `TEXTO_EDITAR` | `CAP_TEXTO` | 14 a 414 | sin límite en el launcher | `TextoSincronizado` | `TextoMovil` |
| 106 | `MANDO_ESTADO` | `CAP_MANDO` | exacto 9 | mínimo 8 ms entre envíos (`MIN_ENVIO_MS`) | `MandoDbr` | `mando.BackendCanal` |
| 107 | `MANDO_INFO` | `CAP_MANDO` | 3 a 67 | sin límite | `MandoDbr` | `mando.BackendCanal` |

Notas:

- "Cap" es la capacidad que la otra parte debe haber anunciado. Además, el launcher descarta todo lo
  de juego -> launcher que llegue antes de `HOLA`.
- "Ritmo" es un cubo de fichas: la ráfaga es el tamaño del cubo y el segundo número es la recarga por
  segundo (`LimiteRitmo`, `CanalMovil.kt:25-34`).
- Un tipo sin límite configurado en `LimiteRitmo` se rechaza siempre. Por eso un tipo nuevo juego -> launcher
  tiene que sumarse ahí a propósito.
- Los tipos launcher -> juego no los parsea `Protocolo.leer` (devuelve `null`); el launcher solo los construye.

## Detalle de cada payload

Todos empiezan por `u8 versión`. `u16`, `u32` y `f32` son big-endian.

**1 HOLA**: `u8 versión`, `u32 capacidades del juego`. Largo 5.

**2 AREA_TEXTO**: dos formas.

- Sin campo con foco: `u8 versión`, `u8 0`. Largo 2.
- Con campo: `u8 versión`, `u8 1`, `f32 x`, `f32 y`, `f32 ancho`, `f32 alto`. Largo 18. Rectángulo en 0..1 de
  la ventana, origen arriba a la izquierda. Un `NaN` o infinito descarta el mensaje. Los valores se
  recortan a 0..1 y a la ventana; si ancho o alto quedan en 0 o menos, se descarta.

**3 SUGERENCIAS**: `u8 versión`, `u8 abierto`.

- `abierto = 0`: nada más. Largo 2. Chat cerrado, listas vacías.
- `abierto = 1`: `u8 n_chips` (máx. 12, `MAX_CHIPS`), n veces `[u8 largo, UTF-8]`, `u8 n_sugerencias` (máx. 10,
  `MAX_SUGERENCIAS`), n veces `[u8 largo, UTF-8]`. Cada ítem mide 1..32 bytes (`MAX_ITEM_BYTES`), UTF-8
  estricto, sin caracteres de control. Un byte de sobra descarta el mensaje. Cualquier otro valor de `abierto` también.

**4 ESTADO**: `u8 versión`, `u32 máscara`. Largo 5. Bits (`EstadoDbr`; el launcher ignora los bits desconocidos):
0 `CARGANDO_KI`, 1 `TRANSFORMANDO`, 2 `CHAT`, 3 `CONTENEDOR`, 4 `PANTALLA_DBR`, 5 `OTRA_PANTALLA`, 6 `FIJANDO`.
El juego lo envía solo cuando cambia.

**5 VIBRAR**: `u8 versión`, `u8 n`, `n` bytes ASCII del id, `u8 fuerza` (0..255 equivale a 0..1). Largo `3 + n`.
`n` en 1..32 (`MAX_ID_VIBRAR`). El id debe calzar `[a-z]{1,12}[.][a-z0-9_]{1,19}` ("categoria.nombre").
Categorías válidas: `combate`, `ki`, `mundo`, `avisos`. El patrón de vibración no viaja: lo define un catálogo
JSON del modpack, y el código le pone topes fijos que el JSON no puede superar (`Topes` en `Vibracion.kt`):

| Tope | Valor |
|---|---|
| Un segmento (pulso o pausa) | 250 ms |
| Patrón completo | 600 ms |
| Pulsos por patrón | 6 |
| Separación mínima entre dos vibraciones | 60 ms (la segunda se descarta salvo que sea más fuerte) |
| Vibraciones iniciadas por segundo | 6 |
| Eventos en el catálogo | 64 (`MAX_EVENTOS`) |

**6 NOTIFICAR**: `u8 versión`, `u8 n_id`, `n_id` bytes ASCII, `u8 n_nombre`, `n_nombre` bytes ASCII.
`n_id` en 1..32, `n_nombre` en 0..16 (`MAX_NOMBRE`). El id debe calzar el mismo patrón de `VIBRAR` y estar en el
catálogo cerrado `Notificaciones.CATALOGO`: `privado.mensaje`, `privado.mencion`, `eventos.invasion`,
`eventos.generico`, `peligro.atacado`, `peligro.vida_baja`, `conexion.afk`, `conexion.afk_kick`,
`conexion.desconectado`. El nombre debe calzar `[A-Za-z0-9_]{0,16}` y solo se usa en `privado.*`.
Largo exacto: un byte de sobra descarta el mensaje. Todo texto que ve el jugador sale de los strings del
launcher. Alerta con sonido: como mucho una por categoría cada 30 s (`ALERTA_MIN_MS`).

**7 TEXTO_ESTADO** y **105 TEXTO_EDITAR** (mismo formato): `u8 versión`, `u16 seq`, `u8 banderas`,
`u16 sel_inicio`, `u16 sel_fin`, `u16 comp_inicio`, `u16 comp_fin`, `u16 largo` (bytes UTF-8), `largo` bytes de texto.
Largo total `14 + largo`.

- Banderas: bit 0 = chat abierto (`TEXTO_ABIERTO`). Con el chat cerrado el texto debe ir vacío.
- `largo` <= 400 bytes (`MAX_TEXTO_BYTES`) y debe calzar exacto con lo que queda. Texto de hasta 100
  unidades UTF-16 (`MAX_TEXTO`).
- Sin controles, sin surrogates (emoji) y sin `§`. UTF-8 estricto.
- Índices en unidades UTF-16 dentro del texto: `sel_inicio <= sel_fin <= largo del texto`.
- Composición: `0xFFFF` en los dos (`SIN_COMPOSICION`) = no hay composición. Si no,
  `comp_inicio <= comp_fin <= largo del texto`. El launcher guarda `-1` cuando no hay composición o el rango está vacío.
- `seq` lo lleva cada lado. El juego nunca envía el chat con esto: solo refleja el estado del campo.

**9 ABRIR_URL**: `u8 versión`, resto = URL en UTF-8 estricto, sin controles. Máximo 1024 bytes de payload
(`MAX_URL_BYTES` = 1023 de URL). Antes de abrir nada, `ZLNativeInvoker.openLink` pasa la URL por
`UrlSegura.validar`: solo `http` y `https`, host real, sin usuario en la URL, sin espacios ni controles,
máximo 2048 caracteres (`UrlSegura.MAX_LARGO`). El host se pasa a ASCII (punycode) y se muestra así en un
diálogo de confirmación; el usuario decide. Dominios marcados como verificados: `discord.gg`, `discord.com` y
sus subdominios. Cualquier otro esquema (`file:`, `intent:`, `javascript:`, `content:`, `data:`) se rechaza y se loguea.

**101 HOLA_ACK**: `u8 versión`, `u32 capacidades del launcher`. Largo 5.

**102 INSERTAR**: `u8 versión`, `u8 modo`, texto UTF-8. Modo 0 = escribir (`MODO_ESCRIBIR`), 1 = sugerencia
(`MODO_SUGERENCIA`). Texto de 1..100 caracteres (`MAX_INSERTAR`), sin controles ni surrogates. Como un carácter
UTF-8 sin surrogates mide hasta 3 bytes, el largo máximo es `2 + 300`. Solo se envía con el chat abierto y la
conexión activa. El juego solo lo escribe en el campo; nunca lo envía como chat.

**103 REDUCIR**: `u8 versión`, `u8 activo` (0 o 1). Largo 2. Modo reducido tras el aviso de calor.

**104 PANTALLA**: `u8 versión`, `f32 izq`, `f32 arr`, `f32 der`, `f32 aba`, `f32 ancho_mm`, `f32 alto_mm`, `u8 banderas`.
Largo 26. Márgenes (recorte de pantalla) en 0..0.25 de la ventana por lado (`MAX_MARGEN`); ancho y alto en
20..400 mm (`MIN_MM`, `MAX_MM`), fuera de eso el launcher no lo envía. Banderas: bit 0 = toque ampliado
(`PANTALLA_TOQUE_AMPLIADO`). Se reenvía cuando el juego (re)conecta.

**106 MANDO_ESTADO**: `u8 versión`, `u16 botones` (máscara con `Boton.ordinal()` de DbrCore), `i8 lx`, `i8 ly`,
`i8 rx`, `i8 ry` (-127..127), `u8 lt`, `u8 rt` (0..255). Largo 9. Solo al cambiar. Orden de botones: A=0, B=1, X=2, Y=3,
LB=4, RB=5, BACK=6, START=7, GUIA=8, LS=9, RS=10, arriba=11, abajo=12, izquierda=13, derecha=14.

**107 MANDO_INFO**: `u8 versión`, `u8 conectado` (0 o 1), `u8 n`, `n` bytes UTF-8 del modelo (n <= 64; el
launcher recorta). Largo `3 + n`.

## Qué pasa cuando algo falla

| Caso | Resultado |
|---|---|
| Versión distinta en el payload | Se descarta el mensaje |
| Versión del puente distinta de la de DbrCore | DbrCore no activa el canal |
| Tipo desconocido | Launcher: lo frena `LimiteRitmo` (no tiene límite configurado). Juego: se ignora |
| Largo o campo fuera de regla | Se descarta y se loguea una vez por tipo |
| Más mensajes de los permitidos | Se descartan los que no tienen ficha |
| Cola launcher -> juego llena (32) | Se descarta el más viejo |
| Falta la librería nativa | `dbrSend` devuelve `false`, `dbrPoll` devuelve `null`; el juego sigue normal |

## Cómo agregar un tipo

1. **Id nuevo, siempre al final.** Los ids no se reutilizan ni se renumeran (un DbrCore o un launcher viejo
   debe seguir entendiendo el resto). Juego -> launcher: el siguiente libre bajo 100 (el 8 está libre).
   Launcher -> juego: el siguiente sobre 107.
2. **Bit de capacidad nuevo** (el siguiente libre, el 10 hoy) si el tipo es opcional. Súmalo a
   `Protocolo.CAPACIDADES` y a `Canal.CAPACIDADES` de DbrCore. Quien envía el tipo comprueba antes que la otra parte lo anunció.
3. **Launcher:** constante en `Protocolo.kt`, caso en `Protocolo.leer` con largo exacto y reglas estrictas
   (nunca lanzar, nunca confiar en un largo), `Mensaje` nuevo, rama en `CanalMovil.recibir` y una entrada en
   `LimiteRitmo` (sin ella el tipo se rechaza). Si va launcher -> juego, un constructor en `Protocolo.kt` que devuelva `null` si no cumple.
4. **Juego (DbrCore):** constante en `Canal.java`, rama en `Canal.procesar` con su `launcherSoporta`, y la clase
   del tipo con las mismas reglas.
5. **No interpretar el payload** como ruta, intent, comando ni código. Si el payload elige algo, que elija
   dentro de un catálogo cerrado (como `NOTIFICAR`) y que el texto salga de los strings del launcher.
6. **Test** en `CanalMovilTest.kt` (o en un archivo propio del tema): caso válido, largo malo, versión distinta,
   campos fuera de rango y límite de ritmo.
7. **`SECURITY_MODEL.md`:** una fila en "Entradas" con quién la dispara, qué guarda y el archivo.
8. **Este archivo:** filas en las tablas, detalle del payload y, si cambia, la tabla de capacidades.
9. Subir `Protocolo.VERSION` (y `DBR_CANAL_VERSION`) solo si cambia un formato existente. Agregar un tipo no lo requiere.
