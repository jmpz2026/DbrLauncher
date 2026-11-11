package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class VibracionTest {
    private fun vibrar(id: String, fuerza: Int, extra: Int = 0): ByteArray {
        val bytes = id.toByteArray(Charsets.US_ASCII)
        return byteArrayOf(1, bytes.size.toByte()) + bytes + byteArrayOf(fuerza.toByte()) + ByteArray(extra)
    }

    @Test
    fun vibrarValido() {
        val m = Protocolo.leer(Protocolo.VIBRAR, vibrar("combate.golpear", 255)) as Mensaje.Vibrar
        assertEquals("combate.golpear", m.id)
        assertEquals(1f, m.fuerza, 0.001f)
    }

    @Test
    fun vibrarMalFormadoSeDescarta() {
        assertNull(Protocolo.leer(Protocolo.VIBRAR, vibrar("Combate.golpe", 10)))
        assertNull(Protocolo.leer(Protocolo.VIBRAR, vibrar("sinpunto", 10)))
        assertNull(Protocolo.leer(Protocolo.VIBRAR, vibrar("ki.soltar", 10, extra = 1)))
        assertNull(Protocolo.leer(Protocolo.VIBRAR, vibrar("ki.../x", 10)))
        assertNull(Protocolo.leer(Protocolo.VIBRAR, byteArrayOf(1, 0, 5)))
        assertNull(Protocolo.leer(Protocolo.VIBRAR, byteArrayOf(1, 40) + ByteArray(41)))
    }

    @Test
    fun categoriaPorPrefijo() {
        assertEquals(CategoriaVibracion.KI, CategoriaVibracion.de("ki.choque"))
        assertNull(CategoriaVibracion.de("otro.cosa"))
    }

    @Test
    fun patronAcotadoPorTopes() {
        val largo = Patron.acotado(List(20) { 1000L to 1f })!!
        assertTrue(largo.duracion <= Topes.MAX_TOTAL_MS)
        assertTrue(largo.tiempos.all { it <= Topes.MAX_SEGMENTO_MS })
        val pulsos = Patron.acotado(List(20) { i -> 10L to if (i % 2 == 0) 0.5f else 0f })!!
        assertEquals(Topes.MAX_PULSOS, pulsos.fuerzas.count { it > 0f })
        assertEquals(0.5f, pulsos.fuerzas.last(), 0f) // trailing pause dropped
        assertNull(Patron.acotado(listOf(50L to 0f)))
        assertNull(Patron.acotado(listOf(50L to Float.NaN)))
    }

    @Test
    fun catalogoLeeYSaltaEventosMalos() {
        val json = """
            {"version":1,"generico":[[30,0.5]],
             "eventos":{"ki.soltar":[[35,0.7],[30,0],[60,0.5]],"raro.x":[[10,1]],"ki.malo":[[1]],"combate.dano":"no"}}
        """
        val c = CatalogoVibracion.leer(json)!!
        assertEquals(1, c.tamano)
        assertArrayEquals(longArrayOf(35, 30, 60), c.patron("ki.soltar").tiempos)
        assertArrayEquals(longArrayOf(30), c.patron("ki.desconocido").tiempos)
        assertNull(CatalogoVibracion.leer("""{"version":2,"generico":[[30,0.5]],"eventos":{}}"""))
        assertNull(CatalogoVibracion.leer("""{"version":1,"eventos":{}}"""))
        assertNull(CatalogoVibracion.leer("no es json"))
    }

    /** The modpack file must parse and carry every built-in event. */
    @Test
    fun archivoDelModpackSiExiste() {
        val archivo = File("../../../../DBR-ASSETS/experimental/config/dbrcore/vibracion.json")
        if (!archivo.isFile) return
        val c = CatalogoVibracion.leer(archivo.readText())
        assertNotNull(c)
        assertTrue(c!!.tamano >= CatalogoVibracion.PORDEFECTO.tamano)
    }

    @Test
    fun ritmoSeparacionYPorSegundo() {
        val r = RitmoVibracion()
        assertTrue(r.permitir(0, 20, 0.5f))
        assertFalse(r.permitir(30, 20, 0.5f)) // too close, not stronger
        assertTrue(r.permitir(10, 20, 0.9f)) // stronger replaces the one playing
        var permitidas = 0
        for (t in 100L..1000L step 70) if (r.permitir(t, 20, 0.5f)) permitidas++
        assertTrue(permitidas <= Topes.MAX_POR_SEGUNDO)
    }

    @Test
    fun amplitudesConIntensidad() {
        val p = Patron.de(20L to 1f, 10L to 0f, 20L to 0.5f)
        assertArrayEquals(intArrayOf(153, 0, 76), amplitudes(p, 1f, 0.6f))
        assertEquals(1, amplitudes(p, 0.001f, 0.01f)[0])
    }

    @Test
    fun ondaSinAmplitudAlargaYOmiteDebiles() {
        val p = Patron.de(20L to 1f, 30L to 0f, 20L to 0.05f)
        val (t, a) = ondaFinal(p, 1f, 0.6f, conAmplitud = false)!!
        assertArrayEquals(longArrayOf(MIN_PULSO_SIN_AMPLITUD_MS), t) // weak pulse and trailing pause dropped
        assertArrayEquals(intArrayOf(255), a)
        val (t2, a2) = ondaFinal(Patron.de(200L to 1f), 1f, 1f, conAmplitud = false)!!
        assertEquals(Topes.MAX_SEGMENTO_MS, t2[0])
        assertEquals(255, a2[0])
    }

    @Test
    fun ondaConAmplitudPulsoMinimo() {
        val (t, a) = ondaFinal(Patron.de(10L to 1f), 1f, 1f, conAmplitud = true)!!
        assertEquals(MIN_PULSO_MS, t[0])
        assertEquals(255, a[0])
        assertNull(ondaFinal(Patron.de(10L to 1f), 1f, 0f, conAmplitud = false))
    }
}
