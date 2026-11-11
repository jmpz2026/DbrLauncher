package com.movtery.zalithlauncher.game.support.canal_movil

import java.io.File

/**
 * Quick phrases of the player for the chip row (plan C, "frases"). Stored on this phone only, one
 * phrase per line in a private file. A phrase is chat text the chip writes into the field; the
 * game never sends it on its own.
 *
 * Pure Kotlin so the rules can be tested on the JVM.
 */
object FrasesMovil {
    const val MAX_FRASES = 20
    const val MAX_LARGO = Protocolo.MAX_INSERTAR

    /** Trimmed phrase, or null when it cannot be written into the chat field. */
    fun normalizar(texto: String): String? {
        val t = texto.trim()
        if (t.isEmpty() || t.length > MAX_LARGO) return null
        if (t.any { Character.isISOControl(it) || Character.isSurrogate(it) }) return null
        return t
    }

    /** Valid phrases only, no duplicates, at most [MAX_FRASES], in the given order. */
    fun limpiar(frases: List<String>): List<String> =
        frases.mapNotNull(::normalizar).distinct().take(MAX_FRASES)

    fun cargar(archivo: File): List<String> = try {
        if (archivo.isFile && archivo.length() <= 16 * 1024) limpiar(archivo.readLines(Charsets.UTF_8)) else emptyList()
    } catch (_: Exception) {
        emptyList()
    }

    fun guardar(archivo: File, frases: List<String>): Boolean = try {
        val tmp = File(archivo.parentFile, archivo.name + ".tmp")
        tmp.writeText(limpiar(frases).joinToString("\n"), Charsets.UTF_8)
        tmp.renameTo(archivo) || run { archivo.delete(); tmp.renameTo(archivo) }
    } catch (_: Exception) {
        false
    }

    /** Moves the phrase at [indice] one place up (-1) or down (+1). Out of range = unchanged. */
    fun mover(frases: List<String>, indice: Int, paso: Int): List<String> {
        val destino = indice + paso
        if (indice !in frases.indices || destino !in frases.indices) return frases
        return frases.toMutableList().apply { add(destino, removeAt(indice)) }
    }
}
