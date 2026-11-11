package com.movtery.zalithlauncher.game.dbr

import com.google.gson.Gson
import com.movtery.zalithlauncher.utils.file.compareSHA1
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Caché de SHA-1 de los archivos de Minecraft, librerías y assets que revisa
 * `MinecraftDownloader` en cada toque de Jugar (A4 del diagnóstico de arranque).
 *
 * Mismo patrón que `.dbr_hashes.json` de [DbrSync] para los mods: si un archivo tiene el mismo
 * tamaño y mtime que cuando se comprobó su SHA-1, y el SHA-1 esperado es el mismo, no se vuelve
 * a leer. Cualquier cambio de tamaño o mtime lo rehashea, y un SHA-1 distinto lo repara como
 * siempre. La caché entera caduca a los [CADUCA_MS] para cubrir un archivo dañado en disco sin
 * cambio de mtime.
 *
 * Los parches de upstream llaman a [comparar]: sin caché abierta es `compareSHA1` tal cual.
 */
class DbrHashCache internal constructor(
    private val archivo: File,
    ahora: Long,
    private val hasher: (File, String?) -> Boolean
) {
    private data class Entrada(val size: Long = -1, val mtime: Long = -1, val sha1: String = "")
    private data class Datos(val creado: Long = 0, val archivos: Map<String, Entrada>? = null)

    private val mapa = ConcurrentHashMap<String, Entrada>()
    private val creado: Long

    /** Archivos que salieron de la caché sin leerlos. */
    val aciertos = AtomicInteger()

    /** Archivos a los que se les calculó el SHA-1. */
    val hasheados = AtomicInteger()

    /** Archivos sin SHA-1 en el JSON (se comprueban abriéndolos como zip) y ms sumados entre hilos. */
    val sinSha1 = AtomicInteger()
    val msSinSha1 = AtomicLong()

    /** ms en leer los JSON y crear las tareas, antes de revisar archivos. */
    @Volatile
    var msProgramar = 0L

    init {
        val datos = runCatching { GSON.fromJson(archivo.readText(), Datos::class.java) }.getOrNull()
        if (datos != null && datos.creado in (ahora - CADUCA_MS)..ahora) {
            datos.archivos?.let { mapa.putAll(it) }
            creado = datos.creado
        } else {
            creado = ahora
        }
    }

    fun coincide(file: File, sha1: String?): Boolean {
        if (sha1.isNullOrBlank()) return hasher(file, sha1)
        val clave = file.absolutePath
        val e = mapa[clave]
        if (e != null && e.sha1.equals(sha1, ignoreCase = true) &&
            file.isFile && file.length() == e.size && file.lastModified() == e.mtime
        ) {
            aciertos.incrementAndGet()
            return true
        }
        hasheados.incrementAndGet()
        val ok = hasher(file, sha1)
        if (ok) mapa[clave] = Entrada(file.length(), file.lastModified(), sha1.lowercase())
        else mapa.remove(clave)
        return ok
    }

    /** Escribe la caché (vía .tmp + rename). Un fallo solo hace que el próximo toque rehashee. */
    fun guardar() {
        runCatching {
            archivo.parentFile?.mkdirs()
            val tmp = File(archivo.path + ".tmp")
            tmp.writeText(GSON.toJson(Datos(creado, HashMap(mapa))))
            if (!tmp.renameTo(archivo)) {
                archivo.delete()
                tmp.renameTo(archivo)
            }
        }
    }

    companion object {
        /** La caché entera se tira a los 30 días y se rehashea todo. */
        const val CADUCA_MS = 30L * 24 * 60 * 60 * 1000

        private val GSON = Gson()

        @Volatile
        private var actual: DbrHashCache? = null

        fun abrir(archivo: File): DbrHashCache =
            DbrHashCache(archivo, System.currentTimeMillis()) { f, s -> compareSHA1(f, s) }
                .also { actual = it }

        fun cerrar() {
            actual = null
        }

        /** Mide la comprobación de un archivo sin SHA-1 en el JSON (solo para el log). */
        fun medirSinSha1(bloque: () -> Boolean): Boolean {
            val c = actual ?: return bloque()
            val t = System.currentTimeMillis()
            try {
                return bloque()
            } finally {
                c.sinSha1.incrementAndGet()
                c.msSinSha1.addAndGet(System.currentTimeMillis() - t)
            }
        }

        /** Con caché abierta la usa; si no, `compareSHA1` como siempre. */
        fun comparar(file: File, sha1: String?): Boolean =
            actual?.coincide(file, sha1) ?: compareSHA1(file, sha1)
    }
}
