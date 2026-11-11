package com.movtery.zalithlauncher.game.dbr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class DbrHashCacheTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val ahora = 1_000_000_000_000L
    private var lecturas = 0

    /** Hasher falso: el "sha1" de un archivo es su contenido. Cuenta las lecturas. */
    private val hasher: (File, String?) -> Boolean = { f, s ->
        lecturas++
        f.isFile && f.readText() == s
    }

    private fun cache(cacheFile: File, t: Long = ahora) = DbrHashCache(cacheFile, t, hasher)

    private fun archivo(nombre: String, contenido: String, mtime: Long = 5_000L): File =
        tmp.newFile(nombre).apply { writeText(contenido); setLastModified(mtime) }

    @Test
    fun aciertoSinLeerTrasGuardar() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        cache(cf).apply { assertTrue(coincide(a, "abc")); guardar() }
        lecturas = 0
        val c = cache(cf)
        assertTrue(c.coincide(a, "abc"))
        assertEquals(0, lecturas)
        assertEquals(1, c.aciertos.get())
    }

    @Test
    fun cambioDeTamanoRehashea() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        cache(cf).apply { coincide(a, "abc"); guardar() }
        a.writeText("abcd"); a.setLastModified(5_000L)
        lecturas = 0
        assertFalse(cache(cf).coincide(a, "abc"))
        assertEquals(1, lecturas)
    }

    @Test
    fun cambioDeFechaRehashea() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        cache(cf).apply { coincide(a, "abc"); guardar() }
        a.setLastModified(9_000L)
        lecturas = 0
        assertTrue(cache(cf).coincide(a, "abc"))
        assertEquals(1, lecturas)
    }

    @Test
    fun sha1EsperadoDistintoRehashea() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        cache(cf).apply { coincide(a, "abc"); guardar() }
        lecturas = 0
        // Actualización de la librería: el manifest pide otro SHA-1 y el disco tiene el viejo.
        assertFalse(cache(cf).coincide(a, "xyz"))
        assertEquals(1, lecturas)
    }

    @Test
    fun fallidoNoQuedaEnCache() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        val c = cache(cf)
        assertFalse(c.coincide(a, "xyz"))
        assertFalse(c.coincide(a, "xyz"))
        assertEquals(2, lecturas)
    }

    @Test
    fun cacheCaducadaRehasheaTodo() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        cache(cf).apply { coincide(a, "abc"); guardar() }
        lecturas = 0
        assertTrue(cache(cf, ahora + DbrHashCache.CADUCA_MS + 1).coincide(a, "abc"))
        assertEquals(1, lecturas)
    }

    @Test
    fun jsonRotoSeIgnora() {
        val cf = File(tmp.root, "cache.json").apply { writeText("{no es json") }
        val a = archivo("a.jar", "abc")
        assertTrue(cache(cf).coincide(a, "abc"))
        assertEquals(1, lecturas)
    }

    @Test
    fun sinSha1EsperadoDelegaSiempre() {
        val cf = File(tmp.root, "cache.json")
        val a = archivo("a.jar", "abc")
        val c = cache(cf)
        c.coincide(a, null)
        c.coincide(a, null)
        assertEquals(2, lecturas)
    }
}
