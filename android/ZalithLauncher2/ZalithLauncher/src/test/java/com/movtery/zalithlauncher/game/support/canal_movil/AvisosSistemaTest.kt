package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.AvisosSistema.Aviso
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AvisosSistemaTest {
    @Test
    fun bateriaAvisaUnaVezPorUmbral() {
        val u = AvisosSistema.Umbrales()
        assertNull(u.alBateria(40, false))
        assertEquals(Aviso.Bateria(15), u.alBateria(15, false))
        assertNull(u.alBateria(14, false))
        assertNull(u.alBateria(10, false))
        assertEquals(Aviso.Bateria(5), u.alBateria(5, false))
        assertNull(u.alBateria(3, false))
    }

    @Test
    fun bateriaSaltaDirectoAl5() {
        val u = AvisosSistema.Umbrales()
        assertEquals(Aviso.Bateria(4), u.alBateria(4, false))
        assertNull(u.alBateria(12, false))
    }

    @Test
    fun cargarRearmaLaBateria() {
        val u = AvisosSistema.Umbrales()
        assertEquals(Aviso.Bateria(15), u.alBateria(15, false))
        assertNull(u.alBateria(15, true))
        assertEquals(Aviso.Bateria(14), u.alBateria(14, false))
    }

    @Test
    fun bateriaInvalidaSeIgnora() {
        val u = AvisosSistema.Umbrales()
        assertNull(u.alBateria(-1, false))
        assertNull(u.alBateria(101, false))
    }

    @Test
    fun calorAvisaUnaVezYSeRearmaAlEnfriar() {
        val u = AvisosSistema.Umbrales()
        assertNull(u.alCalor(2, false))
        assertEquals(Aviso.Calor, u.alCalor(3, false))
        assertNull(u.alCalor(4, false))
        assertNull(u.alCalor(2, false))
        // Cool again without reduced mode: re-arm silently.
        assertNull(u.alCalor(1, false))
        assertEquals(Aviso.Calor, u.alCalor(3, false))
    }

    @Test
    fun alEnfriarConModoReducidoOfreceRestaurar() {
        val u = AvisosSistema.Umbrales()
        assertEquals(Aviso.Calor, u.alCalor(5, false))
        assertEquals(Aviso.Fresco, u.alCalor(0, true))
        assertNull(u.alCalor(0, true))
    }

    @Test
    fun mensajeReducir() {
        assertArrayEquals(byteArrayOf(1, 1), Protocolo.reducir(true))
        assertArrayEquals(byteArrayOf(1, 0), Protocolo.reducir(false))
        assertTrue((Protocolo.CAPACIDADES and Protocolo.CAP_REDUCIR) != 0)
    }
}
