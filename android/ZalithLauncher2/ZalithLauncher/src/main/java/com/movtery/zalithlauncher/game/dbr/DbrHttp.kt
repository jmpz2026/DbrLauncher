/*
 * DbrLauncherMobile — descarga HTTP reanudable compartida por el updater y el sync del modpack.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.context.GlobalContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.coroutineContext

object DbrHttp {
    /** El servidor respondió con un status que no es 2xx. 4xx no vale la pena reintentarlo. */
    class HttpStatusException(val code: Int, url: String) :
        IOException(GlobalContext.getString(R.string.dbr_error_download, code, url)) {
        val retryable: Boolean get() = code >= 500 || code == 429
    }

    /**
     * Conexiones simultáneas por host de GitHub. La sync baja 8 archivos a la vez; contra raw eso
     * dispara el límite de peticiones anónimas (403/429) y bloquea la IP unos minutos. El mirror
     * R2 (Cloudflare) no tiene este límite y va sin tope extra.
     */
    private val HOST_LIMIT = mapOf(
        "raw.githubusercontent.com" to 3,
        "github.com" to 4,
        "api.github.com" to 2,
        "cdn.jsdelivr.net" to 3
    )
    private val gates = ConcurrentHashMap<String, Semaphore>()

    private suspend fun <T> withHostSlot(url: String, block: suspend () -> T): T {
        val host = runCatching { URL(url).host }.getOrNull()
        val limit = host?.let { HOST_LIMIT[it] } ?: return block()
        return gates.getOrPut(host) { Semaphore(limit) }.withPermit { block() }
    }

    /**
     * Baja (o reanuda) [url] en [part]. Si [part] ya tiene bytes se pide `Range` desde ahí; si el
     * servidor lo ignora (200) se empieza de 0. Timeouts de conexión y lectura: una conexión
     * colgada lanza IOException en vez de bloquear para siempre. Se puede cancelar entre bloques.
     *
     * [onProgress] recibe los bytes que lleva [part] y el total del archivo (-1 si no se sabe).
     * Puede bajar si el servidor obliga a reiniciar desde 0.
     */
    suspend fun fetchResumable(
        url: String,
        part: File,
        onProgress: suspend (received: Long, total: Long) -> Unit = { _, _ -> }
    ): Unit = withHostSlot(url) { fetchOnce(url, part, onProgress) }

    private suspend fun fetchOnce(
        url: String,
        part: File,
        onProgress: suspend (received: Long, total: Long) -> Unit
    ) {
        var offset = if (part.isFile) part.length() else 0L
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.instanceFollowRedirects = true
        if (offset > 0) conn.setRequestProperty("Range", "bytes=$offset-")
        try {
            when (val code = conn.responseCode) {
                HttpURLConnection.HTTP_PARTIAL -> {}
                HttpURLConnection.HTTP_OK -> offset = 0L //el server ignoró el Range: desde 0
                416 -> { //Range fuera de rango: el .part ya estaba completo o es basura
                    part.delete()
                    throw IOException("HTTP 416, reiniciando descarga")
                }
                else -> throw HttpStatusException(code, url)
            }
            val length = conn.contentLengthLong
            val total = if (length >= 0) offset + length else -1L
            var received = offset
            onProgress(received, total)
            part.parentFile?.mkdirs()
            conn.inputStream.use { input ->
                FileOutputStream(part, offset > 0).use { output ->
                    val buf = ByteArray(1 shl 16)
                    while (true) {
                        coroutineContext.ensureActive()
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        received += n
                        onProgress(received, total)
                    }
                }
            }
            if (total >= 0 && received != total) {
                throw IOException("Descarga incompleta ($received de $total bytes)")
            }
        } finally {
            conn.disconnect()
        }
    }
}
