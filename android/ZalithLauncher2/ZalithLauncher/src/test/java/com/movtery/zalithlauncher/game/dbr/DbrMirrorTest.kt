package com.movtery.zalithlauncher.game.dbr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Firma de los manifests del mirror R2. `news.json` y su `.sig` son una copia real de lo que
 * firmó la Action de la rama assets con MANIFEST_SIGN_KEY: si cambia la clave pública de
 * [DbrMirror], este test falla.
 */
class DbrMirrorTest {
    private fun res(name: String): ByteArray =
        javaClass.classLoader!!.getResourceAsStream("dbr-mirror/$name")!!.use { it.readBytes() }

    private val body = res("news.json")
    private val sig = res("news.json.sig").toString(Charsets.UTF_8)

    @Test
    fun firmaRealDeLaAction() {
        assertTrue(DbrMirror.verify(body, sig))
    }

    @Test
    fun unByteDeMasInvalidaLaFirma() {
        assertFalse(DbrMirror.verify(body + ' '.code.toByte(), sig))
    }

    @Test
    fun firmaBasuraNoValida() {
        assertFalse(DbrMirror.verify(body, "basura"))
        assertFalse(DbrMirror.verify(body, ""))
    }

    @Test
    fun basesDelManifestSoloHttps() {
        assertEquals(DbrMirror.ASSET_BASES, DbrMirror.bases(null))
        assertEquals(DbrMirror.ASSET_BASES, DbrMirror.bases(listOf("http://x/", "https://sin-barra")))
        assertEquals(listOf("https://a/f/"), DbrMirror.bases(listOf("https://a/f/", "ftp://b/")))
    }
}
