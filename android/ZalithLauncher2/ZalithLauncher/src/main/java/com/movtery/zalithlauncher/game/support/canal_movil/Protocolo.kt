package com.movtery.zalithlauncher.game.support.canal_movil

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

/**
 * DBR mobile channel protocol (docs/canal-movil.md). Pure Kotlin, no Android types, so it can be
 * unit tested on the JVM.
 *
 * Every payload starts with one byte: the protocol version. Numbers are big-endian. A message that
 * does not match its exact layout is dropped: the parser returns null and never throws.
 */
object Protocolo {
    const val VERSION: Int = 1
    const val MAX_PAYLOAD: Int = 1024

    // Game -> launcher
    const val HOLA = 1
    const val AREA_TEXTO = 2
    const val SUGERENCIAS = 3
    /** Game state bits for the context controls (EstadoDbr.bit), sent only when they change. */
    const val ESTADO = 4
    /** Haptic event: short id "categoria.nombre" + strength (Vibracion.kt plays it). */
    const val VIBRAR = 5
    /** Android notification while the app is in the background: id "categoria.clave" + optional name. */
    const val NOTIFICAR = 6
    /** Chat field text, selection and composition (TextoSincronizado). */
    const val TEXTO_ESTADO = 7
    const val ABRIR_URL = 9

    // Launcher -> game
    const val HOLA_ACK = 101
    const val INSERTAR = 102
    /** Reduced mode on/off after the heat warning (AvisosSistema): u8 0 or 1. */
    const val REDUCIR = 103
    /** Screen geometry: cutout margins (fraction of the window per side) and size in mm. */
    const val PANTALLA = 104
    /** Keyboard edit of the chat field: same layout as TEXTO_ESTADO, launcher seq. */
    const val TEXTO_EDITAR = 105
    /** Gamepad raw state (MandoDbr): short buttons, 4 signed stick bytes, 2 unsigned trigger bytes. */
    const val MANDO_ESTADO = 106
    /** Gamepad connected or not + model name (UTF-8, up to 64 bytes). */
    const val MANDO_INFO = 107

    /** Capabilities this launcher build implements (bit flags, sent in HOLA_ACK). */
    const val CAP_AREA_TEXTO = 1 shl 0
    const val CAP_ABRIR_URL = 1 shl 1
    const val CAP_CHIPS = 1 shl 2
    const val CAP_ESTADO = 1 shl 3
    const val CAP_VIBRAR = 1 shl 4
    /** Game side: DbrCore applies REDUCIR. Launcher side: it may send it. */
    const val CAP_REDUCIR = 1 shl 5
    const val CAP_PANTALLA = 1 shl 6
    const val CAP_NOTIFICAR = 1 shl 7
    /** Synced chat text (TEXTO_ESTADO / TEXTO_EDITAR). */
    const val CAP_TEXTO = 1 shl 8
    const val CAP_MANDO = 1 shl 9
    const val CAPACIDADES = CAP_AREA_TEXTO or CAP_ABRIR_URL or CAP_CHIPS or CAP_ESTADO or CAP_VIBRAR or
        CAP_REDUCIR or CAP_PANTALLA or CAP_NOTIFICAR or CAP_TEXTO or CAP_MANDO

    /** TEXTO_*: longest text in UTF-16 units (the 1.7.10 chat limit) and in UTF-8 bytes. */
    const val MAX_TEXTO = 100
    const val MAX_TEXTO_BYTES = 400
    /** TEXTO_* index meaning "no composition". */
    const val SIN_COMPOSICION = 0xFFFF
    const val TEXTO_ABIERTO = 1
    private const val CABECERA_TEXTO = 14

    /** PANTALLA limits: no cutout takes more than a quarter of a side; window size in mm. */
    const val MAX_MARGEN = 0.25f
    const val MIN_MM = 20f
    const val MAX_MM = 400f

    /** VIBRAR id: lowercase ASCII "categoria.nombre", at most this many bytes. */
    const val MAX_ID_VIBRAR = 32
    private val ID_VIBRAR = Regex("[a-z]{1,12}[.][a-z0-9_]{1,19}")

    /** NOTIFICAR name: a player name, at most 16 ASCII letters, digits or underscores. */
    const val MAX_NOMBRE = 16
    private val NOMBRE = Regex("[A-Za-z0-9_]{0,16}")

    /** SUGERENCIAS limits: chips from the server tree and popup suggestions, each short. */
    const val MAX_CHIPS = 12
    const val MAX_SUGERENCIAS = 10
    const val MAX_ITEM_BYTES = 32

    /** INSERTAR: longest text, in characters (the chat line limit of 1.7.10). */
    const val MAX_INSERTAR = 100
    const val MODO_ESCRIBIR = 0
    const val MODO_SUGERENCIA = 1

    /** Longest URL accepted, in UTF-8 bytes (the payload limit minus the version byte). */
    const val MAX_URL_BYTES = MAX_PAYLOAD - 1

    sealed interface Mensaje {
        data class Hola(val capacidades: Int) : Mensaje
        /** area null = no text field has focus. */
        data class AreaTexto(val area: AreaNormalizada?) : Mensaje
        data class AbrirUrl(val url: String) : Mensaje
        /** Bit mask of active game states (see EstadoDbr). */
        data class Estado(val bits: Int) : Mensaje
        /** fuerza in 0..1 (u8 / 255). */
        data class Vibrar(val id: String, val fuerza: Float) : Mensaje
        /** nombre is empty when the event has no player name. */
        data class Notificar(val id: String, val nombre: String) : Mensaje
        /** Chat state for the chip row. abierto false = chat closed, lists are empty. */
        /** Chat field state. comp* are -1 when there is no composition. */
        data class TextoEstado(
            val seq: Int,
            val abierto: Boolean,
            val selInicio: Int,
            val selFin: Int,
            val compInicio: Int,
            val compFin: Int,
            val texto: String,
        ) : Mensaje
        data class Sugerencias(
            val abierto: Boolean,
            val chips: List<String>,
            val sugerencias: List<String>,
        ) : Mensaje
    }

    /** Rectangle in 0..1 of the game window, origin at the top left. */
    data class AreaNormalizada(val x: Float, val y: Float, val ancho: Float, val alto: Float)

    fun leer(tipo: Int, datos: ByteArray?): Mensaje? {
        if (datos == null || datos.isEmpty() || datos.size > MAX_PAYLOAD) return null
        if (datos[0].toInt() != VERSION) return null
        val buf = ByteBuffer.wrap(datos, 1, datos.size - 1)
        return when (tipo) {
            HOLA -> if (buf.remaining() == 4) Mensaje.Hola(buf.int) else null
            AREA_TEXTO -> leerArea(buf)
            SUGERENCIAS -> leerSugerencias(buf)
            ESTADO -> if (buf.remaining() == 4) Mensaje.Estado(buf.int) else null
            VIBRAR -> leerVibrar(buf)
            NOTIFICAR -> leerNotificar(buf)
            TEXTO_ESTADO -> leerTextoEstado(buf)
            ABRIR_URL -> leerTexto(buf)?.let { Mensaje.AbrirUrl(it) }
            else -> null
        }
    }

    private fun leerArea(buf: ByteBuffer): Mensaje? {
        if (buf.remaining() == 1) {
            return if (buf.get().toInt() == 0) Mensaje.AreaTexto(null) else null
        }
        if (buf.remaining() != 17 || buf.get().toInt() != 1) return null
        val x = buf.float
        val y = buf.float
        val ancho = buf.float
        val alto = buf.float
        if (!x.isFinite() || !y.isFinite() || !ancho.isFinite() || !alto.isFinite()) return null
        val cx = x.coerceIn(0f, 1f)
        val cy = y.coerceIn(0f, 1f)
        val cAncho = ancho.coerceIn(0f, 1f - cx)
        val cAlto = alto.coerceIn(0f, 1f - cy)
        if (cAncho <= 0f || cAlto <= 0f) return null
        return Mensaje.AreaTexto(AreaNormalizada(cx, cy, cAncho, cAlto))
    }

    /**
     * u16 seq, u8 flags, u16 selection start/end, u16 composition start/end (both [SIN_COMPOSICION]
     * = none), u16 UTF-8 length + text. Indices are UTF-16 units inside the text, start <= end.
     */
    private fun leerTextoEstado(buf: ByteBuffer): Mensaje? {
        if (buf.remaining() < CABECERA_TEXTO - 1) return null
        val seq = buf.short.toInt() and 0xFFFF
        val banderas = buf.get().toInt() and 0xFF
        val selInicio = buf.short.toInt() and 0xFFFF
        val selFin = buf.short.toInt() and 0xFFFF
        val compInicio = buf.short.toInt() and 0xFFFF
        val compFin = buf.short.toInt() and 0xFFFF
        val largo = buf.short.toInt() and 0xFFFF
        if (largo > MAX_TEXTO_BYTES || buf.remaining() != largo) return null
        val texto = if (largo == 0) "" else leerTexto(buf) ?: return null
        if (!textoValido(texto)) return null
        if (selInicio > selFin || selFin > texto.length) return null
        val sinComp = compInicio == SIN_COMPOSICION && compFin == SIN_COMPOSICION
        if (!sinComp && (compInicio > compFin || compFin > texto.length)) return null
        val abierto = (banderas and TEXTO_ABIERTO) != 0
        if (!abierto && texto.isNotEmpty()) return null
        return Mensaje.TextoEstado(
            seq, abierto, selInicio, selFin,
            if (sinComp || compInicio == compFin) -1 else compInicio,
            if (sinComp || compInicio == compFin) -1 else compFin,
            texto,
        )
    }

    /** Chat text rule shared by both directions: short, no controls, no surrogates (emoji), no section sign. */
    fun textoValido(texto: String): Boolean =
        texto.length <= MAX_TEXTO && texto.none { caracterProhibido(it) }

    fun caracterProhibido(c: Char): Boolean =
        Character.isISOControl(c) || Character.isSurrogate(c) || c == '§'

    /** TEXTO_EDITAR payload. Null when the state breaks the rules (the caller filters first). */
    fun textoEditar(
        seq: Int, selInicio: Int, selFin: Int, compInicio: Int, compFin: Int, texto: String,
    ): ByteArray? {
        if (!textoValido(texto)) return null
        if (selInicio !in 0..selFin || selFin > texto.length) return null
        val hayComp = compInicio >= 0 && compFin > compInicio && compFin <= texto.length
        val bytes = texto.toByteArray(StandardCharsets.UTF_8)
        if (bytes.size > MAX_TEXTO_BYTES) return null
        return ByteBuffer.allocate(CABECERA_TEXTO + bytes.size).put(VERSION.toByte())
            .putShort(seq.toShort()).put(TEXTO_ABIERTO.toByte())
            .putShort(selInicio.toShort()).putShort(selFin.toShort())
            .putShort((if (hayComp) compInicio else SIN_COMPOSICION).toShort())
            .putShort((if (hayComp) compFin else SIN_COMPOSICION).toShort())
            .putShort(bytes.size.toShort()).put(bytes).array()
    }

    /** u8 id length + ASCII id + u8 strength. */
    private fun leerVibrar(buf: ByteBuffer): Mensaje? {
        if (!buf.hasRemaining()) return null
        val largo = buf.get().toInt() and 0xFF
        if (largo == 0 || largo > MAX_ID_VIBRAR || buf.remaining() != largo + 1) return null
        val bytes = ByteArray(largo)
        buf.get(bytes)
        val id = String(bytes, StandardCharsets.US_ASCII)
        if (!ID_VIBRAR.matches(id)) return null
        val fuerza = (buf.get().toInt() and 0xFF) / 255f
        return Mensaje.Vibrar(id, fuerza)
    }

    /** u8 id length + ASCII id + u8 name length + ASCII name (0..[MAX_NOMBRE]). */
    private fun leerNotificar(buf: ByteBuffer): Mensaje? {
        val id = leerAscii(buf, 1, MAX_ID_VIBRAR) ?: return null
        val nombre = leerAscii(buf, 0, MAX_NOMBRE) ?: return null
        if (buf.hasRemaining() || !ID_VIBRAR.matches(id) || !NOMBRE.matches(nombre)) return null
        return Mensaje.Notificar(id, nombre)
    }

    private fun leerAscii(buf: ByteBuffer, min: Int, max: Int): String? {
        if (!buf.hasRemaining()) return null
        val largo = buf.get().toInt() and 0xFF
        if (largo < min || largo > max || buf.remaining() < largo) return null
        val bytes = ByteArray(largo)
        buf.get(bytes)
        return String(bytes, StandardCharsets.US_ASCII)
    }

    private fun leerSugerencias(buf: ByteBuffer): Mensaje? {
        if (!buf.hasRemaining()) return null
        when (buf.get().toInt()) {
            0 -> return if (buf.hasRemaining()) null else Mensaje.Sugerencias(false, emptyList(), emptyList())
            1 -> Unit
            else -> return null
        }
        val chips = leerLista(buf, MAX_CHIPS) ?: return null
        val sugerencias = leerLista(buf, MAX_SUGERENCIAS) ?: return null
        if (buf.hasRemaining()) return null
        return Mensaje.Sugerencias(true, chips, sugerencias)
    }

    /** u8 count, then per item: u8 length + UTF-8 bytes. Null on any violation. */
    private fun leerLista(buf: ByteBuffer, max: Int): List<String>? {
        if (!buf.hasRemaining()) return null
        val n = buf.get().toInt() and 0xFF
        if (n > max) return null
        val lista = ArrayList<String>(n)
        repeat(n) {
            if (!buf.hasRemaining()) return null
            val largo = buf.get().toInt() and 0xFF
            if (largo == 0 || largo > MAX_ITEM_BYTES || buf.remaining() < largo) return null
            val parte = buf.slice()
            parte.limit(largo)
            buf.position(buf.position() + largo)
            lista.add(leerTexto(parte) ?: return null)
        }
        return lista
    }

    /** Strict UTF-8 without control characters. */
    private fun leerTexto(buf: ByteBuffer): String? {
        if (!buf.hasRemaining()) return null
        val texto = try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(buf)
                .toString()
        } catch (_: CharacterCodingException) {
            return null
        }
        return if (texto.any { Character.isISOControl(it) }) null else texto
    }

    fun reducir(activo: Boolean): ByteArray = byteArrayOf(VERSION.toByte(), if (activo) 1 else 0)

    /** PANTALLA flag bits. */
    const val PANTALLA_TOQUE_AMPLIADO = 1

    /**
     * Version + 6 floats: left, top, right, bottom margins (0..[MAX_MARGEN] of the window) and
     * window width and height in mm, then u8 flags. Null when the size in mm is not plausible.
     */
    fun pantalla(
        izq: Float, arr: Float, der: Float, aba: Float, anchoMm: Float, altoMm: Float,
        toqueAmpliado: Boolean = true,
    ): ByteArray? {
        if (!anchoMm.isFinite() || !altoMm.isFinite()) return null
        if (anchoMm !in MIN_MM..MAX_MM || altoMm !in MIN_MM..MAX_MM) return null
        fun m(v: Float) = if (v.isFinite()) v.coerceIn(0f, MAX_MARGEN) else 0f
        val flags = if (toqueAmpliado) PANTALLA_TOQUE_AMPLIADO else 0
        return ByteBuffer.allocate(26).put(VERSION.toByte())
            .putFloat(m(izq)).putFloat(m(arr)).putFloat(m(der)).putFloat(m(aba))
            .putFloat(anchoMm).putFloat(altoMm).put(flags.toByte()).array()
    }

    fun mandoEstado(estado: ByteArray): ByteArray =
        ByteBuffer.allocate(1 + estado.size).put(VERSION.toByte()).put(estado).array()

    fun mandoInfo(conectado: Boolean, modelo: String): ByteArray {
        var b = modelo.trim().toByteArray(Charsets.UTF_8)
        if (b.size > 64) b = b.copyOf(64)
        return ByteBuffer.allocate(3 + b.size).put(VERSION.toByte()).put(if (conectado) 1 else 0)
            .put(b.size.toByte()).put(b).array()
    }

    fun holaAck(): ByteArray =
        ByteBuffer.allocate(5).put(VERSION.toByte()).putInt(CAPACIDADES).array()

    /**
     * Text for the chat field. The game only writes it, it never sends the chat. Null when the
     * text is empty, too long or has control characters.
     */
    fun insertar(modo: Int, texto: String): ByteArray? {
        if (modo != MODO_ESCRIBIR && modo != MODO_SUGERENCIA) return null
        if (texto.isEmpty() || texto.length > MAX_INSERTAR) return null
        if (texto.any { Character.isISOControl(it) || Character.isSurrogate(it) }) return null
        val bytes = texto.toByteArray(StandardCharsets.UTF_8)
        return ByteBuffer.allocate(2 + bytes.size).put(VERSION.toByte()).put(modo.toByte()).put(bytes).array()
    }
}
