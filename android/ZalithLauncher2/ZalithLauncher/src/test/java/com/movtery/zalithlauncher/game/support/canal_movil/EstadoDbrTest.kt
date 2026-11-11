package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.layer_controller.data.EstadoDbr
import com.movtery.layer_controller.data.condicionesDbr
import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

class EstadoDbrTest {

    private fun estado(bits: Int): ByteArray =
        ByteBuffer.allocate(5).put(Protocolo.VERSION.toByte()).putInt(bits).array()

    @Test
    fun leeEstado() {
        val m = Protocolo.leer(Protocolo.ESTADO, estado(0b101)) as Mensaje.Estado
        assertEquals(setOf(EstadoDbr.CARGANDO_KI, EstadoDbr.CHAT), EstadoDbr.desdeBits(m.bits))
    }

    @Test
    fun estadoMalFormadoSeDescarta() {
        assertNull(Protocolo.leer(Protocolo.ESTADO, byteArrayOf(Protocolo.VERSION.toByte(), 1)))
        assertNull(Protocolo.leer(Protocolo.ESTADO, estado(1) + byteArrayOf(0)))
    }

    @Test
    fun bitsDesconocidosSeIgnoran() {
        assertEquals(setOf(EstadoDbr.TRANSFORMANDO), EstadoDbr.desdeBits((1 shl 1) or (1 shl 30)))
    }

    @Test
    fun sinCanalLasCondicionesNoOcultan() {
        assertTrue(condicionesDbr(null, setOf(EstadoDbr.CARGANDO_KI), setOf(EstadoDbr.CHAT)))
    }

    @Test
    fun mostrarSiYOcultarSi() {
        val chat = setOf(EstadoDbr.CHAT)
        assertFalse(condicionesDbr(chat, emptySet(), chat))
        assertTrue(condicionesDbr(emptySet(), emptySet(), chat))
        assertFalse(condicionesDbr(emptySet(), setOf(EstadoDbr.CARGANDO_KI), emptySet()))
        assertTrue(condicionesDbr(setOf(EstadoDbr.CARGANDO_KI), setOf(EstadoDbr.CARGANDO_KI), emptySet()))
        // ocultar gana
        assertFalse(condicionesDbr(setOf(EstadoDbr.CARGANDO_KI, EstadoDbr.CHAT), setOf(EstadoDbr.CARGANDO_KI), chat))
    }

    @Test
    fun capacidadAnunciada() {
        assertTrue(Protocolo.CAPACIDADES and Protocolo.CAP_ESTADO != 0)
    }
}
