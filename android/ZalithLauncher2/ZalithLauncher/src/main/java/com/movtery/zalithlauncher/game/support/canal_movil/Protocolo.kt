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
    const val ABRIR_URL = 9

    // Launcher -> game
    const val HOLA_ACK = 101
    const val INSERTAR = 102
    /** Reduced mode on/off after the heat warning (AvisosSistema): u8 0 or 1. */
    const val REDUCIR = 103

    /** Capabilities this launcher build implements (bit flags, sent in HOLA_ACK). */
    const val CAP_AREA_TEXTO = 1 shl 0
    const val CAP_ABRIR_URL = 1 shl 1
    const val CAP_CHIPS = 1 shl 2
    const val CAP_ESTADO = 1 shl 3
    const val CAP_VIBRAR = 1 shl 4
    /** Game side: DbrCore applies REDUCIR. Launcher side: it may send it. */
    const val CAP_REDUCIR = 1 shl 5
    const val CAPACIDADES = CAP_AREA_TEXTO or CAP_ABRIR_URL or CAP_CHIPS or CAP_ESTADO or CAP_VIBRAR or CAP_REDUCIR

    /** VIBRAR id: lowercase ASCII "categoria.nombre", at most this many bytes. */
    const val MAX_ID_VIBRAR = 32
    private val ID_VIBRAR = Regex("[a-z]{1,12}[.][a-z0-9_]{1,19}")

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
        /** Chat state for the chip row. abierto false = chat closed, lists are empty. */
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
