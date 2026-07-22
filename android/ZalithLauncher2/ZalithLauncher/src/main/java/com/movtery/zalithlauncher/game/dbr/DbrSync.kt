/*
 * DbrLauncherMobile — sincronización obligatoria del modpack DBR.
 * Puerto del motor de sync del launcher de escritorio: descarga el manifest,
 * compara SHA-1, baja lo que falta/cambió y borra lo obsoleto, dentro del
 * directorio de juego de la instancia DBR.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.utils.GSON
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL
import java.security.MessageDigest

object DbrSync {
    /** Manifest del modpack DBR (repo DBR-ASSETS servido por raw.githubusercontent). */
    const val MANIFEST_URL =
        "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest.json"

    /** Nombre del índice de archivos gestionados, dentro del gameDir. */
    private const val MANAGED_FILE = ".dbr_managed.json"

    data class ManifestFile(
        val path: String = "",
        val url: String = "",
        val sha1: String? = null,
        val size: Long? = null
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

    /**
     * Sincroniza los archivos del modpack en [gameDir]. Lanza excepción si falla
     * (el llamador debe BLOQUEAR el arranque del juego). Corre en IO.
     */
    suspend fun sync(gameDir: File, onProgress: (Progress) -> Unit) = withContext(Dispatchers.IO) {
        gameDir.mkdirs()

        val json = URL(MANIFEST_URL).readText()
        val manifest = GSON.fromJson(json, Manifest::class.java)
            ?: error("No se pudo leer el manifest del modpack")
        val files = manifest.files
        if (files.isEmpty()) error("El manifest no contiene archivos")

        // 1) Qué hay que descargar (falta, tamaño distinto, o SHA-1 distinto).
        val toDownload = ArrayList<ManifestFile>()
        files.forEachIndexed { i, f ->
            onProgress(Progress("check", i, files.size, f.path))
            val dest = safeJoin(gameDir, f.path)
            val needs = when {
                !dest.exists() -> true
                f.size != null && dest.length() != f.size -> true
                f.sha1.isNullOrEmpty() -> false
                else -> !sha1(dest).equals(f.sha1, ignoreCase = true)
            }
            if (needs) toDownload.add(f)
        }

        // 2) Obsoletos: gestionados antes pero ya no en el manifest.
        val managedFile = File(gameDir, MANAGED_FILE)
        val wanted = files.map { it.path }
        val wantedSet = wanted.toSet()
        val previouslyManaged = runCatching {
            GSON.fromJson(managedFile.readText(), Array<String>::class.java)?.toList() ?: emptyList()
        }.getOrDefault(emptyList())
        val toDelete = previouslyManaged.filter { it !in wantedSet }

        val total = toDownload.size + toDelete.size
        var done = 0

        // 3) Descargar (con verificación de SHA-1).
        for (f in toDownload) {
            onProgress(Progress("download", done, total, f.path))
            val dest = safeJoin(gameDir, f.path)
            dest.parentFile?.mkdirs()
            URL(f.url).openStream().use { input ->
                dest.outputStream().use { output -> input.copyTo(output) }
            }
            if (!f.sha1.isNullOrEmpty() && !sha1(dest).equals(f.sha1, ignoreCase = true)) {
                dest.delete()
                error("El archivo descargado no coincide (hash): ${f.path}")
            }
            done++
        }

        // 4) Borrar obsoletos.
        for (p in toDelete) {
            onProgress(Progress("delete", done, total, p))
            runCatching { safeJoin(gameDir, p).delete() }
            done++
        }

        managedFile.writeText(GSON.toJson(wanted))
        onProgress(Progress("done", total, total, ""))
    }
}
