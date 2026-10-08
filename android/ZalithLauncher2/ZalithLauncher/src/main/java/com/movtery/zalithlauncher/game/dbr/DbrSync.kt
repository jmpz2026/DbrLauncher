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
        val files: List<ManifestFile> = emptyList(),
        /**
         * Preset de Android: sustituye a la entrada de [files] con la misma ruta, o se añade.
         * Siempre de siembra. Sale de la carpeta `android/` de cada variante en el repo de
         * assets; los launchers de PC no lo conocen y lo ignoran.
         */
        val androidFiles: List<ManifestFile>? = null
    )

    /** [Manifest.files] con el preset de Android aplicado encima. */
    private fun filesForAndroid(manifest: Manifest): List<ManifestFile> {
        val overrides = manifest.androidFiles.orEmpty().associateBy { it.path }
        if (overrides.isEmpty()) return manifest.files
        val base = manifest.files.filter { it.path !in overrides }
        return base + overrides.values.map { it.copy(once = true) }
    }

    /**
     * raw.githubusercontent.com cachea cada URL unos 5 minutos y la query no cuenta para la
     * caché: quien daba Jugar justo después de un despliegue recibía el manifest viejo, o un
     * archivo viejo que no casaba con el sha1 del nuevo. Con el sha del commit en vez del
     * nombre de la rama la URL es inmutable y nunca sale vieja.
     */
    private val RAW = Regex("""^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/""")

    /** Sha del último commit de la rama, o null si la API no responde (límite de 60/h sin token). */
    private fun headSha(owner: String, repo: String, branch: String): String? = runCatching {
        val conn = URL("https://api.github.com/repos/$owner/$repo/commits/$branch").openConnection()
        conn.setRequestProperty("Accept", "application/vnd.github.sha")
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.getInputStream().use { it.readBytes().toString(Charsets.UTF_8).trim() }
    }.getOrNull()?.takeIf { Regex("^[0-9a-f]{40}$").matches(it) }

    /**
     * Copia de cada archivo del modpack como asset de un release, con su sha1 por nombre (la
     * sube la Action de la rama assets). Se sirve desde objects.githubusercontent.com, otra red
     * distinta de raw: cuando raw bloquea la IP del jugador (403) la sync baja de aquí.
     */
    private const val ASSET_MIRROR_BASE =
        "https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/"

    /** La misma URL de raw servida por jsDelivr. Sirve los manifests, no los jars. */
    private fun jsDelivr(url: String): String? =
        Regex("""^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.+)$""").find(url)?.let {
            val (owner, repo, ref, path) = it.destructured
            "https://cdn.jsdelivr.net/gh/$owner/$repo@$ref/$path"
        }

    /** Abre [url] y devuelve el stream si responde 2xx; si no, lanza con el status. */
    private fun openOk(url: String): java.io.InputStream {
        val conn = URL(url).openConnection() as java.net.HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            throw java.io.IOException("Descarga falló ($code): $url")
        }
        return conn.inputStream
    }

    /** Texto de la primera URL que responda. Lanza el error de la primera si fallan todas. */
    private fun readFirst(urls: List<String>): String {
        var first: Exception? = null
        for (u in urls) {
            try {
                return openOk(u).use { it.readBytes().toString(Charsets.UTF_8) }
            } catch (e: Exception) {
                if (first == null) first = e
            }
        }
        throw first ?: IllegalStateException("Sin URLs")
    }

    /**
     * Baja a [dest] desde la primera de [urls] que responda y case con [sha1]. Se escribe en un
     * temporal: una descarga cortada o de un mirror malo no deja el archivo a medias.
     * Si fallan todas se lanza el error del origen, que es el que explica el problema.
     */
    private fun downloadFirst(urls: List<String>, dest: File, sha1: String?) {
        val tmp = File(dest.path + ".part")
        var first: Exception? = null
        for (u in urls) {
            try {
                openOk(u).use { input -> tmp.outputStream().use { output -> input.copyTo(output) } }
                if (!sha1.isNullOrEmpty() && !sha1(tmp).equals(sha1, ignoreCase = true)) {
                    throw java.io.IOException("El archivo descargado no coincide (hash): $u")
                }
                if (dest.exists()) dest.delete()
                if (!tmp.renameTo(dest)) throw java.io.IOException("No se pudo escribir ${dest.path}")
                return
            } catch (e: Exception) {
                tmp.delete()
                if (first == null) first = e
            }
        }
        throw first ?: IllegalStateException("Sin URLs")
    }

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

        //Manifest y archivos de la misma rama, fijados al commit actual. Sin la API, por la rama.
        val url = manifestUrl()
        val raw = RAW.find(url)
        val sha = raw?.let { headSha(it.groupValues[1], it.groupValues[2], it.groupValues[3]) }
        val pin: (String) -> String = if (raw != null && sha != null) {
            val branchBase = raw.value
            val pinnedBase = "https://raw.githubusercontent.com/${raw.groupValues[1]}/${raw.groupValues[2]}/$sha/"
            ({ u -> if (u.startsWith(branchBase)) pinnedBase + u.removePrefix(branchBase) else u })
        } else {
            { u -> u }
        }

        val json = readFirst(listOfNotNull(pin(url), jsDelivr(pin(url))))
        val manifest = GSON.fromJson(json, Manifest::class.java)
            ?: error("No se pudo leer el manifest del modpack")
        val files = filesForAndroid(manifest).map { it.copy(url = pin(it.url)) }
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
            //Origen y, si falla (p. ej. 403 de raw a la IP del jugador), la copia del release.
            val mirror = f.sha1?.takeIf { it.isNotEmpty() }?.let { ASSET_MIRROR_BASE + it.lowercase() }
            downloadFirst(listOfNotNull(f.url, mirror), dest, f.sha1)
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
