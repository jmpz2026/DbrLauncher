package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje

/**
 * Chat field text shared by the Android keyboard and the game (plan step 8, F). Pure Kotlin, no
 * Android types, so the editing rules and the echo logic are unit tested on the JVM.
 *
 * Indices are UTF-16 units. comp* are -1 when there is no composition (the word the keyboard is
 * still predicting, underlined in the game).
 */
data class EstadoTexto(
    val texto: String = "",
    val selInicio: Int = 0,
    val selFin: Int = 0,
    val compInicio: Int = -1,
    val compFin: Int = -1,
) {
    val hayComposicion: Boolean get() = compInicio >= 0 && compFin > compInicio

    val seleccion: String get() = texto.substring(selInicio, selFin)

    fun sinComposicion(): EstadoTexto = if (compInicio == -1 && compFin == -1) this else copy(compInicio = -1, compFin = -1)

    /** Same text and selection; the composition is local to the keyboard. */
    fun mismoContenido(otro: EstadoTexto): Boolean =
        texto == otro.texto && selInicio == otro.selInicio && selFin == otro.selFin
}

/** Editing operations of the keyboard, as pure functions. Every result respects [Protocolo.textoValido]. */
object EdicionTexto {
    /** Drops what the chat cannot hold: line breaks, controls, emoji (surrogates), section sign. */
    fun filtrar(texto: CharSequence): String {
        val sb = StringBuilder(texto.length)
        for (c in texto) if (!Protocolo.caracterProhibido(c)) sb.append(c)
        return sb.toString()
    }

    /**
     * Replaces [inicio, fin) with [nuevo] (filtered and cut to the free room). Cursor rule of
     * InputConnection.commitText: newCursorPosition > 0 counts from the end of the new text,
     * <= 0 from its start. [componer] keeps the new text as the composition.
     */
    fun reemplazar(
        e: EstadoTexto, inicio: Int, fin: Int, nuevo: CharSequence, cursorNuevo: Int, componer: Boolean,
    ): EstadoTexto {
        val a = inicio.coerceIn(0, e.texto.length)
        val b = fin.coerceIn(a, e.texto.length)
        val libre = Protocolo.MAX_TEXTO - (e.texto.length - (b - a))
        val n = filtrar(nuevo).let { if (it.length > libre) it.substring(0, libre.coerceAtLeast(0)) else it }
        val texto = e.texto.substring(0, a) + n + e.texto.substring(b)
        val cursor = (if (cursorNuevo > 0) a + n.length + cursorNuevo - 1 else a + cursorNuevo)
            .coerceIn(0, texto.length)
        val comp = componer && n.isNotEmpty()
        return EstadoTexto(texto, cursor, cursor, if (comp) a else -1, if (comp) a + n.length else -1)
    }

    /** Range the keyboard writes over: the composition if any, else the selection. */
    private fun rango(e: EstadoTexto): Pair<Int, Int> =
        if (e.hayComposicion) e.compInicio to e.compFin else e.selInicio to e.selFin

    fun confirmar(e: EstadoTexto, texto: CharSequence, cursorNuevo: Int): EstadoTexto {
        val (a, b) = rango(e)
        return reemplazar(e, a, b, texto, cursorNuevo, componer = false)
    }

    fun componer(e: EstadoTexto, texto: CharSequence, cursorNuevo: Int): EstadoTexto {
        val (a, b) = rango(e)
        return reemplazar(e, a, b, texto, cursorNuevo, componer = true)
    }

    fun regionComposicion(e: EstadoTexto, inicio: Int, fin: Int): EstadoTexto {
        val a = minOf(inicio, fin).coerceIn(0, e.texto.length)
        val b = maxOf(inicio, fin).coerceIn(0, e.texto.length)
        return if (a == b) e.sinComposicion() else e.copy(compInicio = a, compFin = b)
    }

    fun terminarComposicion(e: EstadoTexto): EstadoTexto = e.sinComposicion()

    /** Android allows start > end (backwards selection); the game keeps start <= end. */
    fun seleccionar(e: EstadoTexto, inicio: Int, fin: Int): EstadoTexto {
        val a = minOf(inicio, fin).coerceIn(0, e.texto.length)
        val b = maxOf(inicio, fin).coerceIn(0, e.texto.length)
        return e.copy(selInicio = a, selFin = b)
    }

    /** Deletes [antes] units before the selection and [despues] after it; the selection stays. */
    fun borrarAlrededor(e: EstadoTexto, antes: Int, despues: Int): EstadoTexto {
        val antesReal = antes.coerceIn(0, e.selInicio)
        val despuesReal = despues.coerceIn(0, e.texto.length - e.selFin)
        var r = borrar(e, e.selFin, e.selFin + despuesReal)
        r = borrar(r, e.selInicio - antesReal, e.selInicio)
        return r.copy(selInicio = e.selInicio - antesReal, selFin = e.selFin - antesReal)
    }

    /** Removes [a, b) and moves every index after it. */
    private fun borrar(e: EstadoTexto, a: Int, b: Int): EstadoTexto {
        if (a >= b) return e
        fun mover(i: Int) = when {
            i < 0 -> i
            i <= a -> i
            i >= b -> i - (b - a)
            else -> a
        }
        val r = EstadoTexto(
            e.texto.substring(0, a) + e.texto.substring(b),
            mover(e.selInicio), mover(e.selFin), mover(e.compInicio), mover(e.compFin),
        )
        return if (r.hayComposicion) r else r.sinComposicion()
    }

    fun retroceso(e: EstadoTexto): EstadoTexto = when {
        e.selInicio != e.selFin -> borrarSeleccion(e)
        e.selInicio == 0 -> e.sinComposicion()
        else -> borrarAlrededor(e.sinComposicion(), 1, 0)
    }

    fun suprimir(e: EstadoTexto): EstadoTexto = when {
        e.selInicio != e.selFin -> borrarSeleccion(e)
        else -> borrarAlrededor(e.sinComposicion(), 0, 1)
    }

    fun borrarSeleccion(e: EstadoTexto): EstadoTexto =
        borrar(e.sinComposicion(), e.selInicio, e.selFin).let { it.copy(selFin = it.selInicio) }

    /** Arrow keys. [extender] = Shift held: the end of the selection moves. */
    fun mover(e: EstadoTexto, delta: Int, extender: Boolean): EstadoTexto {
        val base = e.sinComposicion()
        if (extender) return seleccionar(base, base.selInicio, (base.selFin + delta).coerceIn(0, base.texto.length))
        val destino = when {
            base.selInicio != base.selFin -> if (delta < 0) base.selInicio else base.selFin
            else -> (base.selInicio + delta).coerceIn(0, base.texto.length)
        }
        return base.copy(selInicio = destino, selFin = destino)
    }

    fun seleccionarTodo(e: EstadoTexto): EstadoTexto = e.sinComposicion().copy(selInicio = 0, selFin = e.texto.length)
}

/**
 * State of the synced chat field on the launcher side, plus the sequence numbers that tell an
 * echo of our own edit from a real change made by the game (Tab, history, chips, send).
 *
 * Main thread only. Rules:
 * - every keyboard edit is marked pending and leaves at most every [RITMO_MS] (only the last state);
 * - a game state is ignored while an edit is pending, and while it answers an older seq (the game
 *   has not seen our last edit yet) unless that edit is older than [ESPERA_ECO_MS] (lost message);
 * - a game state that answers our last seq and has the same text and selection is the echo;
 * - anything else is adopted: the keyboard must restart when the text changed.
 */
class TextoSincronizado {
    var estado: EstadoTexto = EstadoTexto()
        private set

    /** Chat open with the synced field, as the game last said. */
    var abierto: Boolean = false
        private set

    private var seq = 0
    private var pendiente = false
    private var ultimoEnvio = Long.MIN_VALUE / 2

    enum class Resultado { IGNORAR, SELECCION, TEXTO, ABIERTO, CERRADO }

    /** A keyboard edit. False when nothing changed. */
    fun editar(nuevo: EstadoTexto): Boolean {
        if (nuevo == estado) return false
        estado = nuevo
        pendiente = true
        return true
    }

    /** Milliseconds until the pending edit may leave; -1 when nothing is pending. */
    fun esperaMs(ahora: Long): Long {
        if (!pendiente) return -1
        return (ultimoEnvio + RITMO_MS - ahora).coerceAtLeast(0)
    }

    /**
     * The TEXTO_EDITAR payload to send now, or null (nothing pending, too soon, chat closed).
     * [forzar] skips the rate (Enter must carry the last letter).
     */
    fun paraEnviar(ahora: Long, forzar: Boolean = false): ByteArray? {
        if (!pendiente || !abierto || (!forzar && ahora - ultimoEnvio < RITMO_MS)) return null
        val e = estado
        val siguiente = (seq + 1) and 0xFFFF
        val datos = Protocolo.textoEditar(siguiente, e.selInicio, e.selFin, e.compInicio, e.compFin, e.texto)
        pendiente = false
        if (datos == null) return null
        seq = siguiente
        ultimoEnvio = ahora
        return datos
    }

    /** True when an edit left less than [ms] ago (the game may not have applied it yet). */
    fun enviadoHaceMenosDe(ahora: Long, ms: Long): Boolean = ahora - ultimoEnvio < ms

    fun aplicarJuego(m: Mensaje.TextoEstado, ahora: Long): Resultado {
        if (!m.abierto) {
            val estaba = abierto
            reiniciar()
            return if (estaba) Resultado.CERRADO else Resultado.IGNORAR
        }
        val juego = EstadoTexto(m.texto, m.selInicio, m.selFin, m.compInicio, m.compFin)
        if (!abierto) {
            abierto = true
            estado = juego.sinComposicion()
            seq = m.seq
            pendiente = false
            return Resultado.ABIERTO
        }
        if (pendiente) return Resultado.IGNORAR
        if (m.seq != seq && ahora - ultimoEnvio < ESPERA_ECO_MS) return Resultado.IGNORAR
        seq = m.seq
        if (juego.mismoContenido(estado)) return Resultado.IGNORAR
        val cambioTexto = juego.texto != estado.texto
        estado = juego.sinComposicion()
        return if (cambioTexto) Resultado.TEXTO else Resultado.SELECCION
    }

    fun reiniciar() {
        estado = EstadoTexto()
        abierto = false
        pendiente = false
    }

    companion object {
        /** At most one TEXTO_EDITAR every 33 ms (about 30 per second). */
        const val RITMO_MS = 33L
        /** An edit without an answer for this long is considered lost. */
        const val ESPERA_ECO_MS = 500L
    }
}
