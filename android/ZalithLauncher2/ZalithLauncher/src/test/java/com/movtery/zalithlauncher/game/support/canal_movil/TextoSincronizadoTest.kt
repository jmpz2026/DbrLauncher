package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

class TextoSincronizadoTest {
    /** TEXTO_ESTADO payload as DbrCore writes it. */
    private fun estado(
        seq: Int, abierto: Boolean, selI: Int, selF: Int, compI: Int, compF: Int, texto: String,
        largo: Int? = null,
    ): ByteArray {
        val b = texto.toByteArray(StandardCharsets.UTF_8)
        return ByteBuffer.allocate(14 + b.size).put(1).putShort(seq.toShort()).put(if (abierto) 1 else 0)
            .putShort(selI.toShort()).putShort(selF.toShort()).putShort(compI.toShort()).putShort(compF.toShort())
            .putShort((largo ?: b.size).toShort()).put(b).array()
    }

    private fun leer(d: ByteArray) = Protocolo.leer(Protocolo.TEXTO_ESTADO, d) as Mensaje.TextoEstado?

    @Test
    fun estadoValido() {
        val m = leer(estado(7, true, 2, 4, 0xFFFF, 0xFFFF, "hola"))
        assertEquals(Mensaje.TextoEstado(7, true, 2, 4, -1, -1, "hola"), m)
        val c = leer(estado(1, true, 4, 4, 0, 4, "ñand"))
        assertEquals(0, c!!.compInicio)
        assertEquals(4, c.compFin)
    }

    @Test
    fun cerradoSinTexto() {
        assertEquals(Mensaje.TextoEstado(0, false, 0, 0, -1, -1, ""), leer(estado(0, false, 0, 0, 0xFFFF, 0xFFFF, "")))
        assertNull(leer(estado(0, false, 0, 0, 0xFFFF, 0xFFFF, "x")))
    }

    @Test
    fun largosMalosSeDescartan() {
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "abc", largo = 2)))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "abc", largo = 4)))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "abc").copyOf(10)))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "a".repeat(101))))
    }

    @Test
    fun indicesFueraDeRangoSeDescartan() {
        assertNull(leer(estado(1, true, 0, 5, 0xFFFF, 0xFFFF, "hola")))
        assertNull(leer(estado(1, true, 3, 2, 0xFFFF, 0xFFFF, "hola")))
        assertNull(leer(estado(1, true, 0, 0, 3, 1, "hola")))
        assertNull(leer(estado(1, true, 0, 0, 0, 9, "hola")))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 2, "hola")))
    }

    @Test
    fun caracteresProhibidosSeDescartan() {
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "a§cb")))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "a\nb")))
        assertNull(leer(estado(1, true, 0, 0, 0xFFFF, 0xFFFF, "a😀")))
    }

    @Test
    fun escritorIdaYVuelta() {
        val d = Protocolo.textoEditar(65535, 1, 3, 1, 3, "áéíó")!!
        assertEquals(14 + 8, d.size)
        val m = leer(d)
        assertEquals(Mensaje.TextoEstado(65535, true, 1, 3, 1, 3, "áéíó"), m)
        assertNull(Protocolo.textoEditar(1, 0, 0, -1, -1, "§"))
        assertNull(Protocolo.textoEditar(1, 2, 1, -1, -1, "abc"))
        assertNull(Protocolo.textoEditar(1, 0, 0, -1, -1, "a".repeat(101)))
        assertNotNull(Protocolo.textoEditar(1, 0, 0, -1, -1, "€".repeat(100)))
    }

    @Test
    fun filtroYTope() {
        val e = EdicionTexto.confirmar(EstadoTexto(), "a\nb§c😀d", 1)
        assertEquals(EstadoTexto("abcd", 4, 4), e)
        val lleno = EdicionTexto.confirmar(EstadoTexto("x".repeat(98), 98, 98), "12345", 1)
        assertEquals("x".repeat(98) + "12", lleno.texto)
        assertEquals(100, lleno.selInicio)
    }

    @Test
    fun composicionYConfirmacion() {
        var e = EdicionTexto.componer(EstadoTexto("hola ", 5, 5), "mun", 1)
        assertEquals(EstadoTexto("hola mun", 8, 8, 5, 8), e)
        e = EdicionTexto.componer(e, "mundo", 1)
        assertEquals(EstadoTexto("hola mundo", 10, 10, 5, 10), e)
        e = EdicionTexto.confirmar(e, "Mundo", 1)
        assertEquals(EstadoTexto("hola Mundo", 10, 10), e)
    }

    @Test
    fun borrarAlrededorYRetroceso() {
        val e = EstadoTexto("abcdef", 3, 3)
        assertEquals(EstadoTexto("adef", 1, 1), EdicionTexto.borrarAlrededor(e, 2, 0))
        assertEquals(EstadoTexto("abc", 3, 3), EdicionTexto.borrarAlrededor(e, 0, 99))
        assertEquals(EstadoTexto("abdef", 2, 2), EdicionTexto.retroceso(e))
        assertEquals(EstadoTexto("adef", 1, 1), EdicionTexto.retroceso(EstadoTexto("abcdef", 1, 3)))
        assertEquals(EstadoTexto("", 0, 0), EdicionTexto.retroceso(EstadoTexto("", 0, 0)))
    }

    @Test
    fun seleccionAlRevesSeOrdena() {
        assertEquals(EstadoTexto("hola", 1, 3), EdicionTexto.seleccionar(EstadoTexto("hola"), 3, 1))
        assertEquals(EstadoTexto("hola", 4, 4), EdicionTexto.seleccionar(EstadoTexto("hola"), 9, 9))
    }

    private fun abrir(s: TextoSincronizado, texto: String = "", seq: Int = 0) {
        s.aplicarJuego(Mensaje.TextoEstado(seq, true, texto.length, texto.length, -1, -1, texto), 0)
    }

    @Test
    fun ritmoJuntaEdiciones() {
        val s = TextoSincronizado()
        abrir(s)
        s.editar(EstadoTexto("a", 1, 1))
        assertNotNull(s.paraEnviar(1000))
        s.editar(EstadoTexto("ab", 2, 2))
        s.editar(EstadoTexto("abc", 3, 3))
        assertNull(s.paraEnviar(1010))
        assertEquals(23L, s.esperaMs(1010))
        val d = s.paraEnviar(1033)!!
        assertEquals("abc", leer(d)!!.texto)
        assertEquals(2, leer(d)!!.seq)
        assertNull(s.paraEnviar(2000))
        s.editar(EstadoTexto("abcd", 4, 4))
        assertNotNull(s.paraEnviar(2001, forzar = true))
    }

    @Test
    fun ecoSeIgnoraYCambioDelJuegoSeAdopta() {
        val s = TextoSincronizado()
        abrir(s, seq = 0)
        s.editar(EstadoTexto("/sp", 3, 3, 1, 3))
        s.paraEnviar(1000)!!
        // Old state (seq 0) arrives after our edit: ignored.
        assertEquals(TextoSincronizado.Resultado.IGNORAR,
            s.aplicarJuego(Mensaje.TextoEstado(0, true, 0, 0, -1, -1, ""), 1010))
        // Echo of seq 1: ignored, composition kept.
        assertEquals(TextoSincronizado.Resultado.IGNORAR,
            s.aplicarJuego(Mensaje.TextoEstado(1, true, 3, 3, 1, 3, "/sp"), 1020))
        assertEquals(1, s.estado.compInicio)
        // Tab in the game: adopted, keyboard must restart.
        assertEquals(TextoSincronizado.Resultado.TEXTO,
            s.aplicarJuego(Mensaje.TextoEstado(1, true, 7, 7, -1, -1, "/spawn "), 1100))
        assertEquals(EstadoTexto("/spawn ", 7, 7), s.estado)
    }

    @Test
    fun pendienteGanaYEdicionPerdidaSeRecupera() {
        val s = TextoSincronizado()
        abrir(s)
        s.editar(EstadoTexto("x", 1, 1))
        assertEquals(TextoSincronizado.Resultado.IGNORAR,
            s.aplicarJuego(Mensaje.TextoEstado(0, true, 0, 0, -1, -1, ""), 5000))
        s.paraEnviar(5000)
        // No answer for seq 1 after 500 ms: the game state wins.
        assertEquals(TextoSincronizado.Resultado.TEXTO,
            s.aplicarJuego(Mensaje.TextoEstado(0, true, 2, 2, -1, -1, "yy"), 5600))
        assertEquals("yy", s.estado.texto)
    }

    @Test
    fun cerrarYAbrir() {
        val s = TextoSincronizado()
        assertEquals(TextoSincronizado.Resultado.ABIERTO,
            s.aplicarJuego(Mensaje.TextoEstado(9, true, 1, 1, -1, -1, "/"), 0))
        assertEquals(EstadoTexto("/", 1, 1), s.estado)
        assertEquals(TextoSincronizado.Resultado.CERRADO,
            s.aplicarJuego(Mensaje.TextoEstado(9, false, 0, 0, -1, -1, ""), 10))
        assertEquals(EstadoTexto(), s.estado)
        s.editar(EstadoTexto("a", 1, 1))
        assertNull(s.paraEnviar(100))
        assertArrayEquals(null, s.paraEnviar(200))
    }
}
