package com.movtery.zalithlauncher.game.support.canal_movil

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class MandoProtocoloTest {

    @Test
    fun infoConModeloCorto() {
        val d = Protocolo.mandoInfo(true, " Xbox ")
        assertArrayEquals(byteArrayOf(Protocolo.VERSION.toByte(), 1, 4, 'X'.code.toByte(), 'b'.code.toByte(), 'o'.code.toByte(), 'x'.code.toByte()), d)
    }

    @Test
    fun infoRecortaA64Bytes() {
        val d = Protocolo.mandoInfo(false, "a".repeat(100))
        assertEquals(3 + 64, d.size)
        assertEquals(0, d[1].toInt())
        assertEquals(64, d[2].toInt())
    }

    @Test
    fun estadoLlevaVersionDelante() {
        val d = Protocolo.mandoEstado(byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8))
        assertEquals(9, d.size)
        assertEquals(Protocolo.VERSION.toByte(), d[0])
        assertEquals(8.toByte(), d[8])
    }

    @Test
    fun capacidadMando() {
        assertEquals(1 shl 9, Protocolo.CAP_MANDO)
        assertEquals(Protocolo.CAP_MANDO, Protocolo.CAPACIDADES and Protocolo.CAP_MANDO)
    }
}
