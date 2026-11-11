package com.movtery.zalithlauncher.game.support.canal_movil

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonParser

/**
 * Haptic patterns for the VIBRAR message (plan E). Pure Kotlin, no Android types, so it can be
 * unit tested on the JVM. [VibradorDbr] plays the result.
 *
 * The catalog comes from `config/dbrcore/vibracion.json` in the game folder (synced from the
 * modpack, checked by SHA-1 against the signed manifest). Whatever the JSON says, [Topes] bound
 * every pattern: the file cannot make the phone buzz for long.
 */
enum class CategoriaVibracion(val clave: String) {
    COMBATE("combate"),
    KI("ki"),
    MUNDO("mundo"),
    AVISOS("avisos");

    companion object {
        /** Category from the id prefix ("combate.golpear" -> COMBATE). Null when unknown. */
        fun de(id: String): CategoriaVibracion? {
            val prefijo = id.substringBefore('.', "")
            return entries.firstOrNull { it.clave == prefijo }
        }
    }
}

/** Hard limits in code. The JSON can only go below them. */
object Topes {
    /** Longest single segment (pulse or pause). */
    const val MAX_SEGMENTO_MS = 250L
    /** Longest whole pattern. Segments past it are cut. */
    const val MAX_TOTAL_MS = 600L
    /** Most pulses (segments with strength above 0) in one pattern. */
    const val MAX_PULSOS = 6
    /** Two vibrations closer than this: the second is dropped unless it is stronger. */
    const val MIN_SEPARACION_MS = 60L
    /** Most vibrations started in any one-second window. */
    const val MAX_POR_SEGUNDO = 6
}

/** Segments in order: [tiempos] in ms, [fuerzas] in 0..1 (0 = pause). Never empty. */
class Patron(val tiempos: LongArray, val fuerzas: FloatArray) {
    val duracion: Long get() = tiempos.sum()
    val maxFuerza: Float get() = fuerzas.maxOrNull() ?: 0f

    companion object {
        /**
         * Builds a bounded pattern from raw (ms, strength) pairs: clamps each value, cuts at
         * [Topes.MAX_TOTAL_MS] and [Topes.MAX_PULSOS], drops trailing pauses. Null when no pulse is left.
         */
        fun acotado(segmentos: List<Pair<Long, Float>>): Patron? {
            val tiempos = ArrayList<Long>()
            val fuerzas = ArrayList<Float>()
            var total = 0L
            var pulsos = 0
            for ((msCrudo, fuerzaCruda) in segmentos) {
                if (!fuerzaCruda.isFinite()) return null
                val ms = msCrudo.coerceIn(1L, Topes.MAX_SEGMENTO_MS)
                val fuerza = fuerzaCruda.coerceIn(0f, 1f)
                if (fuerza > 0f && pulsos == Topes.MAX_PULSOS) break
                val cabe = (Topes.MAX_TOTAL_MS - total).coerceAtMost(ms)
                if (cabe <= 0L) break
                tiempos.add(cabe)
                fuerzas.add(fuerza)
                total += cabe
                if (fuerza > 0f) pulsos++
            }
            while (fuerzas.isNotEmpty() && fuerzas.last() == 0f) {
                fuerzas.removeAt(fuerzas.lastIndex)
                tiempos.removeAt(tiempos.lastIndex)
            }
            if (pulsos == 0 || fuerzas.isEmpty()) return null
            return Patron(tiempos.toLongArray(), fuerzas.toFloatArray())
        }

        fun de(vararg segmentos: Pair<Long, Float>): Patron = acotado(segmentos.toList())!!
    }
}

class CatalogoVibracion(private val patrones: Map<String, Patron>, val generico: Patron) {
    /** Pattern for [id], or the generic one for an unknown id. */
    fun patron(id: String): Patron = patrones[id] ?: generico

    val tamano: Int get() = patrones.size

    companion object {
        private const val MAX_EVENTOS = 64

        /** Built in, same as the modpack file. Used when the file is missing or invalid. */
        val PORDEFECTO = CatalogoVibracion(
            mapOf(
                "combate.golpear" to Patron.de(20L to 0.45f),
                "combate.dano" to Patron.de(45L to 0.8f),
                "ki.soltar" to Patron.de(35L to 0.7f, 30L to 0f, 60L to 0.5f),
                "ki.transformar" to Patron.de(80L to 0.6f, 40L to 0f, 120L to 0.9f),
                "ki.choque" to Patron.de(90L to 1f),
                "mundo.romper" to Patron.de(15L to 0.35f),
                "mundo.caida" to Patron.de(70L to 0.8f),
                "avisos.privado" to Patron.de(30L to 0.6f, 60L to 0f, 30L to 0.6f),
                "avisos.mencion" to Patron.de(25L to 0.5f, 50L to 0f, 25L to 0.5f),
                "avisos.nivel" to Patron.de(40L to 0.5f, 50L to 0f, 40L to 0.6f, 50L to 0f, 60L to 0.8f),
                "avisos.premio" to Patron.de(50L to 0.6f, 40L to 0f, 50L to 0.8f, 40L to 0f, 100L to 1f),
            ),
            Patron.de(30L to 0.5f),
        )

        /**
         * Parses the modpack catalog:
         * `{"version":1,"generico":[[ms,fuerza],...],"eventos":{"combate.golpear":[[20,0.45]],...}}`.
         * A bad event is skipped; a bad file (or no generic pattern) returns null.
         */
        fun leer(json: String): CatalogoVibracion? = runCatching {
            val raiz = JsonParser.parseString(json).asJsonObject
            if (raiz.get("version")?.asInt != 1) return null
            val generico = leerPatron(raiz.get("generico")) ?: return null
            val eventos = raiz.getAsJsonObject("eventos") ?: return null
            val patrones = LinkedHashMap<String, Patron>()
            for ((id, valor) in eventos.entrySet()) {
                if (patrones.size == MAX_EVENTOS) break
                if (CategoriaVibracion.de(id) == null || id.length > Protocolo.MAX_ID_VIBRAR) continue
                patrones[id] = runCatching { leerPatron(valor) }.getOrNull() ?: continue
            }
            CatalogoVibracion(patrones, generico)
        }.getOrNull()

        private fun leerPatron(e: JsonElement?): Patron? {
            if (e == null || !e.isJsonArray) return null
            val lista = e.asJsonArray
            if (lista.size() == 0 || lista.size() > 32) return null
            val segmentos = lista.map { s ->
                val par = s as? JsonArray ?: return null
                if (par.size() != 2) return null
                par[0].asLong to par[1].asFloat
            }
            return Patron.acotado(segmentos)
        }
    }
}

/**
 * Decides if a vibration may start now ([Topes.MIN_SEPARACION_MS], [Topes.MAX_POR_SEGUNDO]).
 * While one plays, a new one only replaces it when stronger; otherwise it is dropped.
 */
class RitmoVibracion {
    private val inicios = ArrayDeque<Long>()
    private var ultimoInicio = Long.MIN_VALUE / 2
    private var finActual = Long.MIN_VALUE / 2
    private var fuerzaActual = 0f

    @Synchronized
    fun permitir(ahora: Long, duracion: Long, fuerza: Float): Boolean {
        while (inicios.isNotEmpty() && ahora - inicios.first() >= 1000L) inicios.removeFirst()
        if (inicios.size >= Topes.MAX_POR_SEGUNDO) return false
        val sonando = ahora < finActual
        if (ahora - ultimoInicio < Topes.MIN_SEPARACION_MS && !(sonando && fuerza > fuerzaActual)) return false
        if (sonando && fuerza <= fuerzaActual) return false
        inicios.addLast(ahora)
        ultimoInicio = ahora
        finActual = ahora + duracion
        fuerzaActual = fuerza
        return true
    }

    @Synchronized
    fun reiniciar() {
        inicios.clear()
        ultimoInicio = Long.MIN_VALUE / 2
        finActual = Long.MIN_VALUE / 2
        fuerzaActual = 0f
    }
}

/**
 * Final amplitudes 0..255 for one play: pattern strength x message strength x user intensity.
 * Pulses never round down to 0 (a pulse that exists is felt); pauses stay 0.
 */
fun amplitudes(patron: Patron, fuerza: Float, intensidad: Float): IntArray {
    val escala = fuerza.coerceIn(0f, 1f) * intensidad.coerceIn(0f, 1f)
    return IntArray(patron.fuerzas.size) { i ->
        val f = patron.fuerzas[i]
        if (f <= 0f) 0 else (f * escala * 255f).toInt().coerceIn(1, 255)
    }
}
