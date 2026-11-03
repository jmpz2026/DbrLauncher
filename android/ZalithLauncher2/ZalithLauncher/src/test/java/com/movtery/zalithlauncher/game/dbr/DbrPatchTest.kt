package com.movtery.zalithlauncher.game.dbr

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest

class DbrPatchTest {
    private fun patchOf(target: ByteArray, ops: DataOutputStream.() -> Unit): ByteArray {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).apply {
            write("DBRP".toByteArray())
            writeByte(1)
            write(MessageDigest.getInstance("SHA-1").digest(target))
            writeLong(target.size.toLong())
            ops()
        }
        return bytes.toByteArray()
    }

    private fun tmp(bytes: ByteArray) = File.createTempFile("dbrpatch", null).apply {
        deleteOnExit()
        writeBytes(bytes)
    }

    @Test
    fun copyAndData() = runBlocking {
        val old = "hola mundo viejo".toByteArray()
        val target = "hola mundo nuevo".toByteArray()
        val patch = patchOf(target) {
            writeByte(1); writeLong(0); writeLong(11) //"hola mundo "
            writeByte(2); writeLong(5); write("nuevo".toByteArray())
        }
        val out = File.createTempFile("dbrpatch", ".out").apply { deleteOnExit() }
        DbrPatch.apply(tmp(old), tmp(patch), out)
        assertArrayEquals(target, out.readBytes())
    }

    @Test
    fun wrongShaDeletesOutput() = runBlocking {
        val old = "abc".toByteArray()
        val patch = patchOf("xyz".toByteArray()) {
            writeByte(1); writeLong(0); writeLong(3) //da "abc", no "xyz"
        }
        val out = File.createTempFile("dbrpatch", ".out").apply { deleteOnExit() }
        try {
            DbrPatch.apply(tmp(old), tmp(patch), out)
            throw AssertionError("Debía fallar")
        } catch (_: IOException) {
        }
        assertFalse(out.exists())
    }

    /**
     * Con un parche real generado por make-patches.mjs (rama assets):
     * DBRPATCH_DIR con viejo.jar, nuevo.jar y parche.dbrpatch. Sin la variable se omite.
     */
    @Test
    fun realJar() = runBlocking {
        val dir = System.getenv("DBRPATCH_DIR")?.let(::File)
        assumeTrue(dir != null && File(dir, "parche.dbrpatch").isFile)
        val out = File.createTempFile("dbrpatch", ".jar").apply { deleteOnExit() }
        DbrPatch.apply(File(dir, "viejo.jar"), File(dir, "parche.dbrpatch"), out)
        assertArrayEquals(File(dir!!, "nuevo.jar").readBytes(), out.readBytes())
    }
}
