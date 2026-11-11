/*
 * DbrLauncherMobile — sincronización obligatoria del modpack DBR.
 * Puerto del motor de sync del launcher de escritorio: descarga el manifest,
 * compara SHA-1, baja lo que falta/cambió y borra lo obsoleto, dentro del
 * directorio de juego de la instancia DBR.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.context.GlobalContext
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant
import com.movtery.zalithlauncher.utils.GSON
import com.movtery.zalithlauncher.utils.logging.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

object DbrSync {
    private const val TAG = "DbrSync"

    /** Nombre del índice de archivos gestionados, dentro del gameDir. */
    private const val MANAGED_FILE = ".dbr_managed.json"

    /** Huella del manifest del último sync completo (ver [checkStatus]). */
    private const val SYNCED_FILE = ".dbr_synced"

    /** SHA-1 ya comprobados: ruta → tamaño, mtime y sha1 tras el último sync correcto. */
    private const val HASHES_FILE = ".dbr_hashes.json"

    /** Cada cuántos syncs se ignora [HASHES_FILE] y se rehashea todo. */
    private const val FULL_CHECK_EVERY = 10

    /** Cuánto vale el manifest que bajó [checkStatus] para el siguiente [sync]. */
    private const val MANIFEST_REUSE_MS = 2 * 60_000L

    private class CachedManifest(val url: String, val at: Long, val manifest: RemoteManifest)

    /** Manifest de la última [checkStatus]; [sync] lo usa una vez si es reciente. */
    @Volatile
    private var lastChecked: CachedManifest? = null

    private data class HashEntry(val size: Long = -1, val mtime: Long = -1, val sha1: String = "")

    private data class HashCache(val runs: Int = 0, val files: Map<String, HashEntry> = emptyMap())

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
        val androidFiles: List<ManifestFile>? = null,
        /** Bases de descarga por sha1, en orden. Si falta, [DbrMirror.ASSET_BASES]. */
        val mirrors: List<String>? = null
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
            throw java.io.IOException(GlobalContext.getString(R.string.dbr_error_download, code, url))
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

    /** Bloqueo por IP: 403 (raw, release) o 429 (límite de peticiones anónimas de GitHub). */
    private val BLOCK_STATUS = setOf(403, 429)

    /** Si todas las fuentes dan 403/429 se espera esto y se repite una sola vuelta. */
    private const val BLOCKED_WAIT_MS = 20_000L

    /** Reintentos por URL ante cortes de red, reanudando desde el `.part`. */
    private const val MAX_ATTEMPTS = 5

    /** Jars desde este tamaño se intentan actualizar con parche delta (mismo umbral que make-patches.mjs). */
    private const val PATCH_MIN_SIZE = 5L * 1024 * 1024

    /**
     * Temporal de la descarga de [dest]. Lleva el sha esperado en el nombre: un `.part` de otra
     * versión del mismo archivo nunca se reanuda.
     */
    private fun partFor(dest: File, sha1: String?): File =
        File(dest.path + "." + (sha1?.take(8)?.lowercase() ?: "nosha") + ".part")

    /** Mueve [src] a [dest], pisando lo que hubiera. */
    private fun replace(src: File, dest: File) {
        if (dest.exists()) dest.delete()
        if (!src.renameTo(dest)) throw IOException(GlobalContext.getString(R.string.dbr_error_write, dest.path))
    }

    /**
     * Baja [url] en [part] reintentando los cortes de red con backoff y reanudando desde lo que
     * ya haya. Un 4xx no se reintenta. El `.part` se conserva si falla o se cancela.
     */
    private suspend fun fetchWithRetry(url: String, part: File, onProgress: suspend (Long, Long) -> Unit) {
        var delayMs = 1_000L
        var attempt = 0
        while (true) {
            try {
                DbrHttp.fetchResumable(url, part, onProgress)
                return
            } catch (e: IOException) {
                if (e is DbrHttp.HttpStatusException && !e.retryable) throw e
                attempt++
                if (attempt >= MAX_ATTEMPTS) throw e
                Logger.warning(TAG, "Descarga cortada ($attempt/$MAX_ATTEMPTS): $url", e)
            }
            delay(delayMs)
            delayMs = (delayMs * 2).coerceAtMost(10_000L)
        }
    }

    /**
     * Baja a [dest] desde la primera de [urls] que responda y case con [sha1]. Se escribe en un
     * `.part` que sobrevive a cortes y a cancelar: la próxima sync sigue donde quedó (las URLs
     * sirven el mismo contenido, así que el `.part` vale para todas).
     * Si todas dan 403/429 (GitHub limitó la IP) se avisa con [onBlocked], se espera y se repite
     * una vuelta. Si fallan todas se lanza el error de la primera, con el status de cada fuente.
     */
    private suspend fun downloadFirst(
        urls: List<String>,
        dest: File,
        sha1: String?,
        meter: ByteCounter.Meter,
        onBlocked: (Long) -> Unit
    ) {
        val part = partFor(dest, sha1)
        var first: Exception? = null
        val tried = mutableListOf<Pair<String, String>>()
        for (round in 1..2) {
            first = null
            tried.clear()
            for (u in urls) {
                try {
                    fetchWithRetry(u, part) { received, _ -> meter.progress(received) }
                    if (!sha1.isNullOrEmpty() && !sha1(part).equals(sha1, ignoreCase = true)) {
                        part.delete()
                        meter.progress(0)
                        throw IOException(GlobalContext.getString(R.string.dbr_error_hash, u))
                    }
                    replace(part, dest)
                    return
                } catch (e: IOException) {
                    if (first == null) first = e
                    val host = runCatching { URL(u).host }.getOrDefault(u)
                    val status = (e as? DbrHttp.HttpStatusException)?.code?.toString() ?: e.javaClass.simpleName
                    tried += host to status
                }
            }
            val codes = tried.mapNotNull { it.second.toIntOrNull() }
            val blocked = codes.isNotEmpty() && codes.all { it in BLOCK_STATUS }
            if (!blocked) break
            if (round == 1) {
                val ms = (BLOCKED_WAIT_MS * (0.5 + Math.random())).toLong()
                onBlocked(ms)
                delay(ms)
            } else {
                val detail = tried.joinToString(", ") { "${it.first}: ${it.second}" }
                throw IOException(GlobalContext.getString(R.string.dbr_error_blocked, codes.first(), detail))
            }
        }
        val detail = tried.joinToString(", ") { "${it.first}: ${it.second}" }
        val e = first ?: IllegalStateException("Sin URLs")
        throw IOException("${e.message} [$detail]", e)
    }

    /** Nombre de un jar sin la versión, para emparejar versiones: `mods/DbrServerPack-5.5.0.jar` -> `mods/dbrserverpack`. */
    private val VERSIONED_JAR = Regex("""^(.+?)[-_ ]v?\d[^/]*\.jar$""", RegexOption.IGNORE_CASE)

    private fun modKey(path: String): String {
        val dir = path.substringBeforeLast('/', "")
        val name = path.substringAfterLast('/')
        val base = VERSIONED_JAR.find(name)?.groupValues?.get(1) ?: name
        return "$dir/${base.lowercase()}"
    }

    /**
     * Intenta reconstruir [f] desde una versión vieja del mismo jar que ya esté en el disco y un
     * parche delta del release (ver [DbrPatch]). Devuelve false si no hay parche para ninguna
     * versión vieja o algo falla: entonces se baja el jar completo.
     */
    private suspend fun tryPatch(
        f: ManifestFile,
        dest: File,
        candidates: List<File>,
        bases: List<String>,
        meter: ByteCounter.Meter
    ): Boolean {
        val newSha = f.sha1?.lowercase()?.takeIf { it.isNotEmpty() } ?: return false
        for (old in candidates.distinct()) {
            if (!old.isFile) continue
            val oldSha = runCatching { sha1(old) }.getOrNull() ?: continue
            if (oldSha == newSha) continue
            val patch = File(dest.path + "." + oldSha.take(8) + "-" + newSha.take(8) + ".dbrpatch.part")
            val out = File(dest.path + "." + newSha.take(8) + ".patched")
            try {
                //Mismo orden que los archivos: R2 y luego el release. 404 en una: la siguiente.
                var fetched = false
                for (base in bases) {
                    try {
                        fetchWithRetry(base + DbrPatch.assetName(oldSha, newSha), patch) { received, total ->
                            if (total > 0) meter.expect(total)
                            meter.progress(received)
                        }
                        fetched = true
                        break
                    } catch (e: DbrHttp.HttpStatusException) {
                        patch.delete()
                    }
                }
                if (!fetched) throw DbrHttp.HttpStatusException(404, DbrPatch.assetName(oldSha, newSha))
                DbrPatch.apply(old, patch, out)
                replace(out, dest)
                return true
            } catch (e: DbrHttp.HttpStatusException) {
                //404: no hay parche para esta pareja de versiones.
            } catch (e: IOException) {
                Logger.warning(TAG, "Parche de ${f.path} falló, se baja completo", e)
            } finally {
                patch.delete()
            }
            meter.progress(0)
            meter.expect(f.size ?: 0L)
        }
        return false
    }

    /**
     * Bytes de toda la sync, sumados por los archivos que bajan en paralelo. Cada archivo tiene
     * su [Meter], que solo usa la corrutina de ese archivo.
     */
    private class ByteCounter(total: Long, private val emit: () -> Unit) {
        val done = AtomicLong(0)
        val total = AtomicLong(total)

        inner class Meter(private var expected: Long) {
            private var counted = 0L

            /** [received] = bytes que lleva este archivo (puede bajar si la descarga se reinicia). */
            fun progress(received: Long) {
                done.addAndGet(received - counted)
                counted = received
                emit()
            }

            /** Cambia lo que se espera bajar de este archivo (el parche en vez del jar, o al revés). */
            fun expect(bytes: Long) {
                total.addAndGet(bytes - expected)
                expected = bytes
            }
        }
    }

    /**
     * Progreso reportado por callback. phase: check|download|delete|done.
     * En download, [bytesDone]/[bytesTotal] cuentan lo que baja de verdad (parches incluidos) y
     * [file] es el archivo más grande de los que se están bajando.
     */
    data class Progress(
        val phase: String,
        val done: Int,
        val total: Int,
        val file: String,
        val bytesDone: Long = 0L,
        val bytesTotal: Long = 0L
    )

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

    /** Manifest remoto de la variante actual y cómo fijar sus URLs al mismo commit. */
    private class RemoteManifest(val json: String, val pin: (String) -> String) {
        /** Huella del manifest: cambia con cualquier mod, config o preset de Android. */
        val fingerprint: String
            get() = MessageDigest.getInstance("SHA-1").digest(json.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }

    private fun fetchManifest(): RemoteManifest {
        //Manifest y archivos de la misma rama, fijados al commit actual. Sin la API, por la rama.
        val url = manifestUrl()
        //Primero el mirror R2 con firma verificada: no pasa por GitHub. Sus URLs no se fijan.
        DbrMirror.fetchSigned(url)?.let { return RemoteManifest(it) { u -> u } }
        val raw = RAW.find(url)
        val sha = raw?.let { headSha(it.groupValues[1], it.groupValues[2], it.groupValues[3]) }
        val pin: (String) -> String = if (raw != null && sha != null) {
            val branchBase = raw.value
            val pinnedBase = "https://raw.githubusercontent.com/${raw.groupValues[1]}/${raw.groupValues[2]}/$sha/"
            ({ u -> if (u.startsWith(branchBase)) pinnedBase + u.removePrefix(branchBase) else u })
        } else {
            { u -> u }
        }
        return RemoteManifest(readFirst(listOfNotNull(pin(url), jsDelivr(pin(url)))), pin)
    }

    enum class Status {
        /** El último sync terminó con el manifest que hay ahora en el servidor. */
        UP_TO_DATE,
        /** Hay cambios (o nunca se sincronizó): Jugar los descarga. */
        UPDATE_AVAILABLE,
        /** No se pudo leer el manifest remoto (sin red o GitHub caído). */
        UNKNOWN
    }

    /**
     * Compara la huella del manifest remoto con la del último sync completo. Solo baja el
     * manifest; no mira los archivos del disco (eso lo hace el sync al pulsar Jugar).
     */
    suspend fun checkStatus(gameDir: File): Status = withContext(Dispatchers.IO) {
        val url = manifestUrl()
        val remote = runCatching { fetchManifest() }.getOrNull() ?: return@withContext Status.UNKNOWN
        lastChecked = CachedManifest(url, System.currentTimeMillis(), remote)
        if (neverSynced(gameDir)) return@withContext Status.UPDATE_AVAILABLE
        val synced = runCatching { File(gameDir, SYNCED_FILE).readText().trim() }.getOrNull()
        if (synced == remote.fingerprint) Status.UP_TO_DATE else Status.UPDATE_AVAILABLE
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

        //El manifest que acaba de bajar la home sirve: se ahorra otra petición (una sola vez).
        val cached = lastChecked
        lastChecked = null
        val remote = cached
            ?.takeIf { it.url == manifestUrl() && System.currentTimeMillis() - it.at < MANIFEST_REUSE_MS }
            ?.manifest
            ?: fetchManifest()
        val pin = remote.pin
        val manifest = GSON.fromJson(remote.json, Manifest::class.java)
            ?: error(GlobalContext.getString(R.string.dbr_error_manifest))
        val files = filesForAndroid(manifest).map { it.copy(url = pin(it.url)) }
        if (files.isEmpty()) error(GlobalContext.getString(R.string.dbr_error_manifest_empty))

        // 1) Qué hay que descargar (falta, tamaño distinto, o SHA-1 distinto).
        // El SHA-1 del disco se calcula en paralelo: es I/O + CPU y en serie se nota mucho.
        // Un archivo con el mismo tamaño y mtime que tras el último sync no se rehashea;
        // cada FULL_CHECK_EVERY syncs se rehashea todo por si alguien lo tocó a mano.
        val hashesFile = File(gameDir, HASHES_FILE)
        val hashCache = runCatching { GSON.fromJson(hashesFile.readText(), HashCache::class.java) }
            .getOrNull() ?: HashCache()
        val known = if ((hashCache.runs + 1) % FULL_CHECK_EVERY == 0) emptyMap() else hashCache.files
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
                known[f.path]?.let {
                    it.size == dest.length() && it.mtime == dest.lastModified() &&
                        it.sha1.equals(f.sha1, ignoreCase = true)
                } == true -> false
                else -> !sha1(dest).equals(f.sha1, ignoreCase = true)
            }
            onProgress(Progress("check", checked.incrementAndGet(), files.size, f.path))
        }
        val toDownload = files.filterIndexed { i, _ -> needed[i] }
        //options.txt se re-siembra al cambiar de variante: antes se guarda el idioma del jugador.
        val opciones = toDownload.firstOrNull { it.once && it.path == "options.txt" }
            ?.let { safeJoin(gameDir, it.path) }
        val langPrevio = opciones?.let { DbrIdioma.leerLang(it) }

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

        //Temporales de syncs anteriores que ya no sirven (otra versión del archivo, parches).
        //Los de lo que hay que bajar ahora se quedan: la descarga sigue donde quedó.
        val keepParts = toDownload.map { partFor(safeJoin(gameDir, it.path), it.sha1).path }.toSet()
        files.mapNotNull { safeJoin(gameDir, it.path).parentFile }.toSet().forEach { dir ->
            dir.listFiles()?.filter {
                (it.name.endsWith(".part") || it.name.endsWith(".patched")) && it.path !in keepParts
            }?.forEach { it.delete() }
        }

        // 3) Descargar en paralelo (con verificación de SHA-1), contando bytes.
        val active = ConcurrentHashMap<String, Long>()
        val lastEmit = AtomicLong(0)
        lateinit var bytes: ByteCounter
        fun emitDownload(force: Boolean) {
            val now = System.currentTimeMillis()
            val prev = lastEmit.get()
            if (!force && (now - prev < 250 || !lastEmit.compareAndSet(prev, now))) return
            val file = active.maxByOrNull { it.value }?.key ?: ""
            onProgress(Progress("download", done.get(), total, file, bytes.done.get(), bytes.total.get()))
        }
        bytes = ByteCounter(toDownload.sumOf { it.size ?: 0L }) { emitDownload(false) }
        val bases = DbrMirror.bases(manifest.mirrors)
        //Todas las fuentes dieron 403/429: el texto del progreso cuenta los segundos de espera.
        val onBlocked: (Long) -> Unit = { ms ->
            val secs = ((ms + 999) / 1000).toInt()
            onProgress(
                Progress(
                    "download", done.get(), total,
                    GlobalContext.getString(R.string.dbr_sync_blocked, secs),
                    bytes.done.get(), bytes.total.get()
                )
            )
        }
        pool(toDownload, CONCURRENCY) { f ->
            val dest = safeJoin(gameDir, f.path)
            dest.parentFile?.mkdirs()
            val meter = bytes.Meter(f.size ?: 0L)
            active[f.path] = f.size ?: 0L
            try {
                //Jar grande con versión vieja en el disco: basta un parche de 1-2 MB.
                val key = modKey(f.path)
                val patched = (f.size ?: 0L) >= PATCH_MIN_SIZE && f.path.endsWith(".jar", ignoreCase = true) &&
                    tryPatch(f, dest, listOf(dest) + toDelete.filter { modKey(it) == key }.map { safeJoin(gameDir, it) }, bases, meter)
                if (!patched) {
                    //Por contenido desde R2 y el release; raw al final. R2 no es de GitHub: un
                    //límite de GitHub a la IP del jugador no lo alcanza.
                    val sha = f.sha1?.takeIf { it.isNotEmpty() }?.lowercase()
                    val urls = if (sha != null) bases.map { it + sha } + f.url else listOf(f.url)
                    downloadFirst(urls, dest, f.sha1, meter, onBlocked)
                }
            } finally {
                active.remove(f.path)
            }
            done.incrementAndGet()
            emitDownload(true)
        }

        //El options.txt de DBR-ASSETS dice lang:es_ES para todos.
        opciones?.let { DbrIdioma.aplicarSiembra(it, langPrevio) }

        // 4) Borrar obsoletos.
        for (p in toDelete) {
            runCatching { safeJoin(gameDir, p).delete() }
            onProgress(Progress("delete", done.incrementAndGet(), total, p))
        }

        managedFile.writeText(GSON.toJson(managedPaths))
        //Todo lo gestionado tiene ahora el SHA-1 del manifest (comprobado o recién bajado).
        val hashes = files.filter { !it.once && !it.sha1.isNullOrEmpty() }.mapNotNull { f ->
            val dest = safeJoin(gameDir, f.path)
            if (dest.isFile) f.path to HashEntry(dest.length(), dest.lastModified(), f.sha1!!.lowercase()) else null
        }.toMap()
        runCatching { hashesFile.writeText(GSON.toJson(HashCache(hashCache.runs + 1, hashes))) }
        File(gameDir, SYNCED_FILE).writeText(remote.fingerprint)
        onProgress(Progress("done", total, total, ""))
    }
}
