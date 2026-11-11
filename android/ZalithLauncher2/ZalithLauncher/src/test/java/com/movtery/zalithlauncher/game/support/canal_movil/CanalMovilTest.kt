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

    private fun sugerencias(chips: List<String>, sug: List<String>): ByteArray {
        val b = java.io.ByteArrayOutputStream()
        b.write(1); b.write(1)
        for (lista in listOf(chips, sug)) {
            b.write(lista.size)
            lista.forEach { val u = it.toByteArray(Charsets.UTF_8); b.write(u.size); b.write(u) }
        }
        return b.toByteArray()
    }

    @Test
    fun sugerenciasValidas() {
        val m = Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(listOf("/spawn", "/home"), listOf("/homes")))
        assertEquals(Mensaje.Sugerencias(true, listOf("/spawn", "/home"), listOf("/homes")), m)
        assertEquals(
            Mensaje.Sugerencias(false, emptyList(), emptyList()),
            Protocolo.leer(Protocolo.SUGERENCIAS, byteArrayOf(1, 0)),
        )
    }

    @Test
    fun sugerenciasMalasSeDescartan() {
        // Too many chips, item too long, empty item, control char, trailing bytes, cut short.
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(List(13) { "/a" }, emptyList())))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(listOf("x".repeat(33)), emptyList())))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(listOf(""), emptyList())))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(listOf("/a\n"), emptyList())))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, sugerencias(emptyList(), emptyList()) + 0))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, byteArrayOf(1, 1, 1, 5, 0x41)))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, byteArrayOf(1, 0, 0)))
        assertNull(Protocolo.leer(Protocolo.SUGERENCIAS, byteArrayOf(1, 2)))
    }

    @Test
    fun insertarValidaTexto() {
        val d = Protocolo.insertar(Protocolo.MODO_ESCRIBIR, "/spawn ")!!
        assertEquals(1, d[0].toInt())
        assertEquals(0, d[1].toInt())
        assertEquals("/spawn ", String(d, 2, d.size - 2, Charsets.UTF_8))
        assertNull(Protocolo.insertar(Protocolo.MODO_ESCRIBIR, ""))
        assertNull(Protocolo.insertar(Protocolo.MODO_ESCRIBIR, "x".repeat(101)))
        assertNull(Protocolo.insertar(Protocolo.MODO_ESCRIBIR, "hola\n/op yo"))
        assertNull(Protocolo.insertar(Protocolo.MODO_ESCRIBIR, "hola \uD83D\uDE00"))
        assertNull(Protocolo.insertar(7, "hola"))
        assertNotNull(Protocolo.insertar(Protocolo.MODO_SUGERENCIA, "ñandú"))
    }

    // --- Abuse (paso 10): a hostile or buggy game must never crash or flood the launcher. ---

    private val tiposEntrada = setOf(
        Protocolo.HOLA, Protocolo.AREA_TEXTO, Protocolo.SUGERENCIAS, Protocolo.ESTADO,
        Protocolo.VIBRAR, Protocolo.NOTIFICAR, Protocolo.TEXTO_ESTADO, Protocolo.ABRIR_URL,
    )

    @Test
    fun abusoSoloTiposDeEntradaTienenLimite() {
        assertEquals(tiposEntrada, Protocolo.LIMITES_ENTRADA.keys)
    }

    @Test
    fun abusoTiposDesconocidosSeDescartan() {
        val limite = LimiteRitmo(Protocolo.LIMITES_ENTRADA) { 0L }
        for (tipo in -5..300) {
            if (tipo in tiposEntrada) continue
            assertFalse("tipo $tipo", limite.permitir(tipo))
            assertNull("tipo $tipo", Protocolo.leer(tipo, byteArrayOf(1, 0, 0, 0, 3)))
        }
        // Launcher -> game types echoed back are not accepted either.
        assertNull(Protocolo.leer(Protocolo.INSERTAR, Protocolo.insertar(Protocolo.MODO_ESCRIBIR, "/op yo")))
    }

    @Test
    fun abusoPayloadDeDiezKbSeDescarta() {
        val hola = ByteBuffer.allocate(10 * 1024).put(1).putInt(Protocolo.CAPACIDADES).array()
        val url = byteArrayOf(1) + ("https://discord.gg/" + "a".repeat(10 * 1024)).toByteArray()
        for (tipo in tiposEntrada) {
            assertNull("tipo $tipo", Protocolo.leer(tipo, ByteArray(10 * 1024) { 1 }))
            assertNull("tipo $tipo", Protocolo.leer(tipo, hola))
            assertNull("tipo $tipo", Protocolo.leer(tipo, url))
        }
        // Exactly at the cap still parses; the URL gate then rejects what is too long.
        val tope = byteArrayOf(1) + ("https://a.com/" + "x".repeat(Protocolo.MAX_PAYLOAD - 15)).toByteArray()
        assertEquals(Protocolo.MAX_PAYLOAD, tope.size)
        assertNotNull(Protocolo.leer(Protocolo.ABRIR_URL, tope))
    }

    @Test
    fun abusoBasuraAleatoriaNoRevienta() {
        val azar = java.util.Random(20261111L)
        repeat(50_000) {
            val tipo = if (azar.nextBoolean()) tiposEntrada.random(kotlin.random.Random(azar.nextLong()))
            else azar.nextInt(256)
            val datos = ByteArray(azar.nextInt(Protocolo.MAX_PAYLOAD + 64))
            azar.nextBytes(datos)
            if (datos.isNotEmpty() && azar.nextInt(4) != 0) datos[0] = Protocolo.VERSION.toByte()
            if (datos.size > 1 && azar.nextBoolean()) datos[1] = azar.nextInt(16).toByte()
            Protocolo.leer(tipo, datos) // must return a message or null, never throw
            UrlSegura.validar(String(datos, Charsets.ISO_8859_1))
        }
    }

    @Test
    fun abusoMilMensajesPorSegundoEnCadaTipo() {
        var ahora = 0L
        val limite = LimiteRitmo(Protocolo.LIMITES_ENTRADA) { ahora }
        var total = 0
        for (i in 0 until 1000) {
            ahora = i * 1_000_000L // 1000 per second, all types at once
            for (tipo in tiposEntrada) if (limite.permitir(tipo)) total++
        }
        // At most the burst plus one second of refill per type.
        val tope = Protocolo.LIMITES_ENTRADA.values.sumOf { it.capacidad + it.porSegundo }.toInt()
        assertTrue("pasaron $total, tope $tope", total <= tope)
        assertTrue(total < 200)
    }

    @Test
    fun abusoUnaUrlCadaDosSegundos() {
        var ahora = 0L
        val limite = LimiteRitmo(Protocolo.LIMITES_ENTRADA) { ahora }
        val pasan = (0 until 10_000).count { ahora = it * 1_000_000L; limite.permitir(Protocolo.ABRIR_URL) }
        assertTrue("pasaron $pasan en 10 s", pasan <= 6)
    }

    @Test
    fun abusoVibracionDeDiezSegundosSeRecorta() {
        val diez = Patron.acotado(listOf(10_000L to 1f))!!
        assertTrue(diez.duracion <= Topes.MAX_TOTAL_MS)
        val json = """{"version":1,"generico":[[10000,1]],"eventos":{"ki.soltar":[[10000,1],[10000,1],[10000,1]]}}"""
        val c = CatalogoVibracion.leer(json)!!
        for (patron in listOf(c.patron("ki.soltar"), c.patron("ki.otro"))) {
            assertTrue(patron.duracion <= Topes.MAX_TOTAL_MS)
            for (amplitud in listOf(true, false)) {
                val (tiempos, _) = ondaFinal(patron, 1f, 1f, amplitud)!!
                assertTrue(tiempos.sum() <= Topes.MAX_TOTAL_MS)
                assertTrue(tiempos.all { it <= Topes.MAX_SEGMENTO_MS })
            }
        }
        // A thousand requests in one second start at most MAX_POR_SEGUNDO vibrations.
        val ritmo = RitmoVibracion()
        val inicios = (0 until 1000).count { ritmo.permitir(it.toLong(), Topes.MAX_TOTAL_MS, 1f) }
        assertTrue(inicios <= Topes.MAX_POR_SEGUNDO)
    }

    @Test
    fun abusoUrlsPeligrosas() {
        listOf(
            "JAVASCRIPT:alert(1)",
            "  javascript:alert(1)",
            "java\tscript:alert(1)",
            "intent:#Intent;action=android.intent.action.DELETE;end",
            "intent://x#Intent;scheme=http;package=evil;end",
            "file:/data/data/com.movtery.zalithlauncher/shared_prefs/x.xml",
            "FILE:///sdcard/x",
            "//evil.com/x",
            "market://details?id=evil",
            "tel:123",
            "sms:123",
            "https://discord.gg@evil.com/",
            "https://discord.gg%40evil.com@evil.com/",
            "https://evil.com\\@discord.gg/",
            "https://evil.com/\u0000",
        ).forEach { assertNull(it, UrlSegura.validar(it)) }
        // A right-to-left override in the path is percent-encoded: the dialog never shows it raw.
        val rlo = UrlSegura.validar("https://evil.com/\u202Egg.drocsid")!!
        assertEquals("evil.com", rlo.hostAscii)
        assertTrue(rlo.url.all { it.code < 0x80 })
        assertFalse(rlo.confiable)
    }

    @Test
    fun abusoPunycodeNoSeHacePasarPorConfiable() {
        val ascii = UrlSegura.validar("https://xn--dscord-6ve.gg/x")!!
        assertEquals("xn--dscord-6ve.gg", ascii.hostAscii)
        assertFalse(ascii.confiable)
        val unicode = UrlSegura.validar("https://disc\u043Erd.gg/x")!! // Cyrillic "o"
        assertTrue(unicode.hostAscii.startsWith("xn--"))
        assertFalse(unicode.confiable)
        assertFalse(UrlSegura.validar("https://discord.gg.xn--evil-abc.com/x")?.confiable ?: false)
    }
}
