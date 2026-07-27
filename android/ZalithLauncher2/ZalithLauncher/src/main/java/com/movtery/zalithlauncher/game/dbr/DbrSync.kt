/*
 * DbrLauncherMobile — sincronización obligatoria del modpack DBR.
 * Puerto del motor de sync del launcher de escritorio: descarga el manifest,
 * compara SHA-1, baja lo que falta/cambió y borra lo obsoleto, dentro del
 * directorio de juego de la instancia DBR.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant
import com.movtery.zalithlauncher.utils.GSON
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger

object DbrSync {
    /** Nombre del índice de archivos gestionados, dentro del gameDir. */
    private const val MANAGED_FILE = ".dbr_managed.json"

    /**
     * Descargas/verificaciones simultáneas. En serie, un modpack de ~100 archivos tarda
     * muchísimo en la primera instalación (mismo criterio que el launcher de escritorio).
     */
    private const val CONCURRENCY = 8

    /** Manifest del modpack según la variante elegida en Ajustes (Full/Lite). */
    fun manifestUrl(): String = AllSettings.dbrModpackVariant.getValue().manifestUrl

    /** true si esta instancia nunca se sincronizó (no hay índice de archivos gestionados). */
    fun neverSynced(gameDir: File): Boolean = !File(gameDir, MANAGED_FILE).exists()

    data class ManifestFile(
        val path: String = "",
        val url: String = "",
        val sha1: String? = null,
        val size: Long? = null,
        /**
         * Archivo de "siembra": se descarga solo si NO existe (config del jugador, p.ej.
         * options.txt). No se re-descarga aunque cambie el sha1 ni se borra al salir del
         * manifest. Se marca con el archivo `.dbr-once` del repo de assets.
         */
        val once: Boolean = false
    )

    data class Manifest(
        val version: String = "",
        val files: List<ManifestFile> = emptyList()
    )

    /** Progreso reportado por callback. phase: check|download|delete|done */
    data class Progress(val phase: String, val done: Int, val total: Int, val file: String)

    /** Une base + ruta relativa impidiendo path traversal. */
    private fun safeJoin(base: File, rel: String): File {
        val root = base.canonicalFile
        val target = File(root, rel).canonicalFile
        if (target.path != root.path && !target.path.startsWith(root.path + File.separator)) {
            throw IllegalStateException("Ruta insegura en manifest: $rel")
        }
        return target
    }

    private fun sha1(file: File): String {
        val md = MessageDigest.getInstance("SHA-1")
        file.inputStream().use { ins ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val n = ins.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Corre [task] sobre [items] con un pool acotado de corrutinas. */
    private suspend fun <T> pool(items: List<T>, limit: Int, task: suspend (T) -> Unit) {
        if (items.isEmpty()) return
        val gate = Semaphore(limit)
        coroutineScope {
            items.map { item ->
                async { gate.withPermit { task(item) } }
            }.awaitAll()
        }
    }

    /**
     * Sincroniza los archivos del modpack en [gameDir]. Lanza excepción si falla
     * (el llamador debe BLOQUEAR el arranque del juego). Corre en IO.
     * Con [reseed] se re-aplican los archivos de siembra aunque ya existan (lo usa el
     * cambio de variante Full/Lite cuando el jugador acepta la config recomendada).
     */
    suspend fun sync(
        gameDir: File,
        reseed: Boolean = false,
        onProgress: (Progress) -> Unit
    ) = withContext(Dispatchers.IO) {
        gameDir.mkdirs()

        val json = URL(manifestUrl()).readText()
        val manifest = GSON.fromJson(json, Manifest::class.java)
            ?: error("No se pudo leer el manifest del modpack")
        val files = manifest.files
        if (files.isEmpty()) error("El manifest no contiene archivos")

        // 1) Qué hay que descargar (falta, tamaño distinto, o SHA-1 distinto).
        // El SHA-1 del disco se calcula en paralelo: es I/O + CPU y en serie se nota mucho.
        val checked = AtomicInteger(0)
        val needed = BooleanArray(files.size)
        pool(files.indices.toList(), CONCURRENCY) { i ->
            val f = files[i]
            val dest = safeJoin(gameDir, f.path)
            needed[i] = when {
                !dest.exists() -> true
                //Siembra: si ya existe es del jugador; solo se pisa si acepta re-aplicarla.
                f.once -> reseed
                f.size != null && dest.length() != f.size -> true
                f.sha1.isNullOrEmpty() -> false
                else -> !sha1(dest).equals(f.sha1, ignoreCase = true)
            }
            onProgress(Progress("check", checked.incrementAndGet(), files.size, f.path))
        }
        val toDownload = files.filterIndexed { i, _ -> needed[i] }

        // 2) Obsoletos: gestionados antes pero ya no en el manifest.
        //Los `once` nunca entran en el índice: así jamás se borran del equipo del jugador,
        //ni siquiera si desaparecen del manifest.
        val managedFile = File(gameDir, MANAGED_FILE)
        val managedPaths = files.filter { !it.once }.map { it.path }
        val wantedSet = files.map { it.path }.toSet()
        val previouslyManaged = runCatching {
            GSON.fromJson(managedFile.readText(), Array<String>::class.java)?.toList() ?: emptyList()
        }.getOrDefault(emptyList())
        val toDelete = previouslyManaged.filter { it !in wantedSet }

        val total = toDownload.size + toDelete.size
        val done = AtomicInteger(0)

        // 3) Descargar en paralelo (con verificación de SHA-1).
        pool(toDownload, CONCURRENCY) { f ->
            val dest = safeJoin(gameDir, f.path)
            dest.parentFile?.mkdirs()
            URL(f.url).openStream().use { input ->
                dest.outputStream().use { output -> input.copyTo(output) }
            }
            if (!f.sha1.isNullOrEmpty() && !sha1(dest).equals(f.sha1, ignoreCase = true)) {
                dest.delete()
                error("El archivo descargado no coincide (hash): ${f.path}")
            }
            onProgress(Progress("download", done.incrementAndGet(), total, f.path))
        }

        // 4) Borrar obsoletos.
        for (p in toDelete) {
            runCatching { safeJoin(gameDir, p).delete() }
            onProgress(Progress("delete", done.incrementAndGet(), total, p))
        }

        managedFile.writeText(GSON.toJson(managedPaths))
        onProgress(Progress("done", total, total, ""))
    }
}
