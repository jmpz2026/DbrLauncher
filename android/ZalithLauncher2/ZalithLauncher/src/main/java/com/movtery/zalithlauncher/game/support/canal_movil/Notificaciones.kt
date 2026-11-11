package com.movtery.zalithlauncher.game.support.canal_movil

/**
 * NOTIFICAR rules without Android types (plan J), so they can be unit tested on the JVM.
 *
 * The catalog is closed: an id outside it is dropped. The game only chooses which event happened
 * and, at most, a player name; every text the player sees comes from the launcher's strings.
 */
enum class CategoriaNotif(val prefijo: String) {
    PRIVADO("privado"),
    EVENTOS("eventos"),
    PELIGRO("peligro"),
    CONEXION("conexion"),
}

/** One catalog entry. [usaNombre] false = the name, if any, is ignored. */
data class EventoNotif(val id: String, val categoria: CategoriaNotif, val usaNombre: Boolean)

object Notificaciones {
    /** Shortest gap between two notifications of the same category that make sound. */
    const val ALERTA_MIN_MS = 30_000L

    val CATALOGO: Map<String, EventoNotif> = listOf(
        EventoNotif("privado.mensaje", CategoriaNotif.PRIVADO, usaNombre = true),
        EventoNotif("privado.mencion", CategoriaNotif.PRIVADO, usaNombre = true),
        EventoNotif("eventos.invasion", CategoriaNotif.EVENTOS, usaNombre = false),
        EventoNotif("eventos.generico", CategoriaNotif.EVENTOS, usaNombre = false),
        EventoNotif("peligro.atacado", CategoriaNotif.PELIGRO, usaNombre = false),
        EventoNotif("peligro.vida_baja", CategoriaNotif.PELIGRO, usaNombre = false),
        EventoNotif("conexion.afk", CategoriaNotif.CONEXION, usaNombre = false),
        EventoNotif("conexion.afk_kick", CategoriaNotif.CONEXION, usaNombre = false),
        EventoNotif("conexion.desconectado", CategoriaNotif.CONEXION, usaNombre = false),
    ).associateBy { it.id }

    fun evento(id: String): EventoNotif? = CATALOGO[id]

    /** Name to show: empty when the event does not use one. The parser already checked its characters. */
    fun nombre(evento: EventoNotif, nombre: String): String = if (evento.usaNombre) nombre else ""
}

/**
 * Per category: how many events arrived since the player last saw the game, and whether this one
 * may make sound (at most one alert every [Notificaciones.ALERTA_MIN_MS]; the rest update quietly).
 */
class PoliticaNotif {
    data class Decision(val alertar: Boolean, val cuenta: Int)

    private val cuentas = IntArray(CategoriaNotif.entries.size)
    private val ultimaAlerta = LongArray(CategoriaNotif.entries.size) { Long.MIN_VALUE }

    @Synchronized
    fun registrar(categoria: CategoriaNotif, ahoraMs: Long): Decision {
        val i = categoria.ordinal
        cuentas[i]++
        val previa = ultimaAlerta[i]
        val alertar = previa == Long.MIN_VALUE || ahoraMs - previa >= Notificaciones.ALERTA_MIN_MS
        if (alertar) ultimaAlerta[i] = ahoraMs
        return Decision(alertar, cuentas[i])
    }

    /** The player came back to the game: counters start again, the alert gap stays. */
    @Synchronized
    fun vaciar() {
        cuentas.fill(0)
    }

    @Synchronized
    fun reiniciar() {
        cuentas.fill(0)
        ultimaAlerta.fill(Long.MIN_VALUE)
    }
}
