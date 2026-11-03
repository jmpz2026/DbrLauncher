/*
 * DbrLauncherMobile — aplica parches delta de jars del modpack (formato DBRP1).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import kotlinx.coroutines.ensureActive
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.EOFException
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.security.MessageDigest
import kotlin.coroutines.coroutineContext

/**
 * Un jar del modpack cambia muy poco entre versiones (~1-2 MB de 47) y cada entrada del zip va
 * comprimida por separado: las que no cambian tienen los mismos bytes. La Action de la rama
 * assets (`.github/scripts/make-patches.mjs`) genera un parche con lo nuevo y referencias al
 * jar viejo para todo lo demás; aplicarlo da el jar nuevo idéntico byte a byte.
 *
 * Formato DBRP1 (enteros big-endian):
 * - `"DBRP"`, versión `1` (1 byte), sha1 del resultado (20 bytes), tamaño del resultado (int64)
 * - ops hasta el final: `1` COPY(offset int64, len int64) del archivo viejo,
 *   `2` DATA(len int64, bytes)
 */
object DbrPatch {
    private val MAGIC = byteArrayOf('D'.code.toByte(), 'B'.code.toByte(), 'R'.code.toByte(), 'P'.code.toByte())
    private const val OP_COPY = 1
    private const val OP_DATA = 2

    /** Nombre del parche en el release `assets-files`. */
    fun assetName(oldSha1: String, newSha1: String) = "${oldSha1.lowercase()}-${newSha1.lowercase()}.dbrpatch"

    /**
     * Escribe en [out] el resultado de aplicar [patch] a [old]. Lanza IOException si el parche
     * está mal formado o el resultado no casa con el sha1/tamaño que declara; en ese caso
     * [out] queda borrado.
     */
    suspend fun apply(old: File, patch: File, out: File) {
        try {
            applyInner(old, patch, out)
        } catch (e: Exception) {
            out.delete()
            throw e
        }
    }

    private suspend fun applyInner(old: File, patch: File, out: File) {
        val md = MessageDigest.getInstance("SHA-1")
        DataInputStream(BufferedInputStream(patch.inputStream(), 1 shl 16)).use { input ->
            val magic = ByteArray(4).also { input.readFully(it) }
            if (!magic.contentEquals(MAGIC) || input.readUnsignedByte() != 1) throw IOException("Parche no válido")
            val expectedSha = ByteArray(20).also { input.readFully(it) }
            val expectedSize = input.readLong()

            var written = 0L
            val buf = ByteArray(1 shl 16)
            RandomAccessFile(old, "r").use { src ->
                BufferedOutputStream(out.outputStream(), 1 shl 16).use { output ->
                    fun emit(n: Int) {
                        output.write(buf, 0, n)
                        md.update(buf, 0, n)
                        written += n
                        if (written > expectedSize) throw IOException("Parche más largo de lo que declara")
                    }
                    while (true) {
                        coroutineContext.ensureActive()
                        val op = input.read()
                        if (op < 0) break
                        when (op) {
                            OP_COPY -> {
                                val offset = input.readLong()
                                var len = input.readLong()
                                if (offset < 0 || len < 0 || offset + len > src.length()) throw IOException("COPY fuera del archivo viejo")
                                src.seek(offset)
                                while (len > 0) {
                                    val n = minOf(len, buf.size.toLong()).toInt()
                                    src.readFully(buf, 0, n)
                                    emit(n)
                                    len -= n
                                }
                            }
                            OP_DATA -> {
                                var len = input.readLong()
                                if (len < 0) throw IOException("DATA con tamaño negativo")
                                while (len > 0) {
                                    val n = input.read(buf, 0, minOf(len, buf.size.toLong()).toInt())
                                    if (n < 0) throw EOFException("Parche cortado")
                                    emit(n)
                                    len -= n
                                }
                            }
                            else -> throw IOException("Op desconocida en el parche: $op")
                        }
                    }
                }
            }
            if (written != expectedSize) throw IOException("Tamaño del resultado: $written, esperado $expectedSize")
            if (!md.digest().contentEquals(expectedSha)) throw IOException("sha1 del resultado no coincide")
        }
    }
}
