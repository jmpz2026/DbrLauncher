package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificacionesTest {
    private fun notificar(id: String, nombre: String = "", extra: Int = 0): ByteArray {
        val i = id.toByteArray(Charsets.US_ASCII)
        val n = nombre.toByteArray(Charsets.US_ASCII)
        return byteArrayOf(1, i.size.toByte()) + i + byteArrayOf(n.size.toByte()) + n + ByteArray(extra)
    }

    @Test
    fun notificarValido() {
        val m = Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "Goku_99")) as Mensaje.Notificar
        assertEquals("privado.mensaje", m.id)
        assertEquals("Goku_99", m.nombre)
        val sin = Protocolo.leer(Protocolo.NOTIFICAR, notificar("eventos.invasion")) as Mensaje.Notificar
        assertEquals("", sin.nombre)
    }

    @Test
    fun idInvalidoSeDescarta() {
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("Privado.mensaje")))
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("sinpunto")))
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("")))
    }

    @Test
    fun nombreInvalidoSeDescarta() {
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "Goku Black")))
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "§cGoku")))
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "a".repeat(17))))
        assertNotNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "a".repeat(16))))
    }

    @Test
    fun bytesDeMasOFaltantesSeDescartan() {
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, notificar("privado.mensaje", "Goku", extra = 1)))
        val corto = notificar("privado.mensaje", "Goku")
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, corto.copyOf(corto.size - 1)))
        assertNull(Protocolo.leer(Protocolo.NOTIFICAR, byteArrayOf(1)))
    }

    @Test
    fun catalogoCerrado() {
        assertNull(Notificaciones.evento("privado.texto"))
        assertNull(Notificaciones.evento("combate.dano"))
        assertEquals(CategoriaNotif.PELIGRO, Notificaciones.evento("peligro.vida_baja")?.categoria)
        Notificaciones.CATALOGO.values.forEach { assertTrue(it.id.startsWith(it.categoria.prefijo + ".")) }
    }

    @Test
    fun nombreSoloEnEventosQueLoUsan() {
        assertEquals("Goku", Notificaciones.nombre(Notificaciones.evento("privado.mensaje")!!, "Goku"))
        assertEquals("", Notificaciones.nombre(Notificaciones.evento("eventos.invasion")!!, "Goku"))
    }

    @Test
    fun unaAlertaCada30Segundos() {
        val p = PoliticaNotif()
        val a = p.registrar(CategoriaNotif.PRIVADO, 1_000)
        assertTrue(a.alertar)
        assertEquals(1, a.cuenta)
        val b = p.registrar(CategoriaNotif.PRIVADO, 20_000)
        assertFalse(b.alertar)
        assertEquals(2, b.cuenta)
        // Otra categoria no comparte el tope.
        assertTrue(p.registrar(CategoriaNotif.PELIGRO, 20_000).alertar)
        assertTrue(p.registrar(CategoriaNotif.PRIVADO, 31_000).alertar)
    }

    @Test
    fun alVolverSeVaciaLaCuentaPeroNoElTope() {
        val p = PoliticaNotif()
        p.registrar(CategoriaNotif.EVENTOS, 0)
        p.registrar(CategoriaNotif.EVENTOS, 1_000)
        p.vaciar()
        val d = p.registrar(CategoriaNotif.EVENTOS, 2_000)
        assertEquals(1, d.cuenta)
        assertFalse(d.alertar)
    }

    @Test
    fun capacidadAnunciada() {
        assertTrue((Protocolo.CAPACIDADES and Protocolo.CAP_NOTIFICAR) != 0)
    }
}
