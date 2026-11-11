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
    const val ABRIR_URL = 9

    // Launcher -> game
    const val HOLA_ACK = 101

    /** Capabilities this launcher build implements (bit flags, sent in HOLA_ACK). */
    const val CAP_AREA_TEXTO = 1 shl 0
    const val CAP_ABRIR_URL = 1 shl 1
    const val CAPACIDADES = CAP_AREA_TEXTO or CAP_ABRIR_URL

    /** Longest URL accepted, in UTF-8 bytes (the payload limit minus the version byte). */
    const val MAX_URL_BYTES = MAX_PAYLOAD - 1

    sealed interface Mensaje {
        data class Hola(val capacidades: Int) : Mensaje
        /** area null = no text field has focus. */
        data class AreaTexto(val area: AreaNormalizada?) : Mensaje
        data class AbrirUrl(val url: String) : Mensaje
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

    fun holaAck(): ByteArray =
        ByteBuffer.allocate(5).put(VERSION.toByte()).putInt(CAPACIDADES).array()
}
