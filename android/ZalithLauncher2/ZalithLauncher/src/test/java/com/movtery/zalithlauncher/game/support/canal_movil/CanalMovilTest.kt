package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

class CanalMovilTest {
    private fun area(flag: Int, vararg f: Float): ByteArray {
        val b = ByteBuffer.allocate(2 + f.size * 4).put(1).put(flag.toByte())
        f.forEach { b.putFloat(it) }
        return b.array()
    }

    @Test
    fun holaValido() {
        val datos = ByteBuffer.allocate(5).put(1).putInt(3).array()
        assertEquals(Mensaje.Hola(3), Protocolo.leer(Protocolo.HOLA, datos))
    }

    @Test
    fun versionDistintaSeDescarta() {
        val datos = ByteBuffer.allocate(5).put(2).putInt(3).array()
        assertNull(Protocolo.leer(Protocolo.HOLA, datos))
    }

    @Test
    fun tipoDesconocidoSeDescarta() {
        assertNull(Protocolo.leer(77, byteArrayOf(1, 0)))
        assertNull(Protocolo.leer(Protocolo.HOLA_ACK, Protocolo.holaAck()))
    }

    @Test
    fun largosMalosSeDescartan() {
        assertNull(Protocolo.leer(Protocolo.HOLA, byteArrayOf(1, 0, 0)))
        assertNull(Protocolo.leer(Protocolo.HOLA, ByteArray(0)))
        assertNull(Protocolo.leer(Protocolo.HOLA, null))
        assertNull(Protocolo.leer(Protocolo.AREA_TEXTO, ByteArray(Protocolo.MAX_PAYLOAD + 1) { 1 }))
        assertNull(Protocolo.leer(Protocolo.AREA_TEXTO, area(1, 0.1f, 0.1f, 0.5f)))
    }

    @Test
    fun areaValidaYSinCampo() {
        val m = Protocolo.leer(Protocolo.AREA_TEXTO, area(1, 0.1f, 0.8f, 0.5f, 0.05f)) as Mensaje.AreaTexto
        assertEquals(0.8f, m.area!!.y, 0f)
        assertEquals(Mensaje.AreaTexto(null), Protocolo.leer(Protocolo.AREA_TEXTO, byteArrayOf(1, 0)))
    }

    @Test
    fun areaConNaNOInfinitoSeDescarta() {
        assertNull(Protocolo.leer(Protocolo.AREA_TEXTO, area(1, Float.NaN, 0f, 0.5f, 0.1f)))
        assertNull(Protocolo.leer(Protocolo.AREA_TEXTO, area(1, 0f, 0f, Float.POSITIVE_INFINITY, 0.1f)))
    }

    @Test
    fun areaFueraDeRangoSeRecorta() {
        val m = Protocolo.leer(Protocolo.AREA_TEXTO, area(1, -3f, 0.9f, 9f, 9f)) as Mensaje.AreaTexto
        val a = m.area!!
        assertEquals(0f, a.x, 0f)
        assertTrue(a.x + a.ancho <= 1f && a.y + a.alto <= 1f)
        assertNull(Protocolo.leer(Protocolo.AREA_TEXTO, area(1, 0.5f, 0.5f, 0f, 0.1f)))
    }

    @Test
    fun urlConControlesOUtf8RotoSeDescarta() {
        val control = byteArrayOf(1) + "https://a.com/\nx".toByteArray()
        assertNull(Protocolo.leer(Protocolo.ABRIR_URL, control))
        assertNull(Protocolo.leer(Protocolo.ABRIR_URL, byteArrayOf(1, 0xC3.toByte())))
        assertNotNull(Protocolo.leer(Protocolo.ABRIR_URL, byteArrayOf(1) + "https://discord.gg/x".toByteArray()))
    }

    @Test
    fun limiteDeRitmo() {
        var ahora = 0L
        val limite = LimiteRitmo(mapOf(1 to LimiteRitmo.Limite(2, 1.0))) { ahora }
        assertTrue(limite.permitir(1))
        assertTrue(limite.permitir(1))
        assertFalse(limite.permitir(1))
        assertFalse(limite.permitir(9)) // no configured limit = rejected
        ahora += 1_000_000_000L
        assertTrue(limite.permitir(1))
        assertFalse(limite.permitir(1))
    }

    @Test
    fun milMensajesPorSegundoSeRecortan() {
        val limite = LimiteRitmo(mapOf(2 to LimiteRitmo.Limite(20, 20.0))) { 0L }
        val pasan = (1..1000).count { limite.permitir(2) }
        assertEquals(20, pasan)
    }

    @Test
    fun urlSoloHttpYHttps() {
        assertNotNull(UrlSegura.validar("https://discord.gg/abc"))
        assertNotNull(UrlSegura.validar("http://example.com/a?b=c"))
        assertNull(UrlSegura.validar("file:///sdcard/Download/x.apk"))
        assertNull(UrlSegura.validar("javascript:alert(1)"))
        assertNull(UrlSegura.validar("intent://scan/#Intent;scheme=zxing;end"))
        assertNull(UrlSegura.validar("content://com.android.contacts/data"))
        assertNull(UrlSegura.validar("data:text/html,hi"))
        assertNull(UrlSegura.validar("https://user:pass@example.com"))
        assertNull(UrlSegura.validar("https:///sinhost"))
        assertNull(UrlSegura.validar("https://a.com/" + "x".repeat(UrlSegura.MAX_LARGO)))
        assertNull(UrlSegura.validar("https://a.com/ con espacio"))
        assertNull(UrlSegura.validar(null))
    }

    @Test
    fun urlUnicodeSeMuestraEnPunycode() {
        val url = UrlSegura.validar("https://dіscord.gg/x") // Cyrillic "і"
        assertNotNull(url)
        assertTrue(url!!.hostAscii.startsWith("xn--"))
        assertFalse(url.confiable)
    }

    @Test
    fun dominiosDeConfianza() {
        assertTrue(UrlSegura.validar("https://discord.gg/x")!!.confiable)
        assertTrue(UrlSegura.validar("https://ptb.discord.com/x")!!.confiable)
        assertFalse(UrlSegura.validar("https://discord.gg.evil.com/x")!!.confiable)
        assertFalse(UrlSegura.validar("https://evildiscord.gg/x")!!.confiable)
    }
}
