package com.movtery.zalithlauncher.game.support.canal_movil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

class PantallaTest {
    private fun leer(datos: ByteArray): FloatArray {
        val b = ByteBuffer.wrap(datos, 1, datos.size - 1)
        return FloatArray(6) { b.float }
    }

    @Test
    fun codificaVersionMargenesYMm() {
        val d = Protocolo.pantalla(0.04f, 0f, 0f, 0f, 154f, 70f)
        assertNotNull(d)
        assertEquals(25, d!!.size)
        assertEquals(1, d[0].toInt())
        val v = leer(d)
        assertEquals(0.04f, v[0], 0f)
        assertEquals(154f, v[4], 0f)
        assertEquals(70f, v[5], 0f)
    }

    @Test
    fun margenesFueraDeRangoSeRecortan() {
        val v = leer(Protocolo.pantalla(-1f, 0.9f, Float.NaN, 0.1f, 150f, 70f)!!)
        assertEquals(0f, v[0], 0f)
        assertEquals(Protocolo.MAX_MARGEN, v[1], 0f)
        assertEquals(0f, v[2], 0f)
        assertEquals(0.1f, v[3], 0f)
    }

    @Test
    fun tamanoImposibleNoSeManda() {
        assertNull(Protocolo.pantalla(0f, 0f, 0f, 0f, 5f, 70f))
        assertNull(Protocolo.pantalla(0f, 0f, 0f, 0f, 150f, Float.POSITIVE_INFINITY))
        assertNull(Protocolo.pantalla(0f, 0f, 0f, 0f, 1000f, 70f))
    }

    @Test
    fun numerosDelProtocolo() {
        assertEquals(104, Protocolo.PANTALLA)
        assertTrue((Protocolo.CAPACIDADES and Protocolo.CAP_PANTALLA) != 0)
    }
}
