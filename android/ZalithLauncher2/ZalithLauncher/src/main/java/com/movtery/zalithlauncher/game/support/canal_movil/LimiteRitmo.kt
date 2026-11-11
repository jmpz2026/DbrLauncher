package com.movtery.zalithlauncher.game.support.canal_movil

/**
 * Token bucket per message type. A type without a configured limit is always rejected, so a new
 * type has to be added here on purpose.
 */
class LimiteRitmo(
    private val limites: Map<Int, Limite>,
    private val reloj: () -> Long = System::nanoTime,
) {
    /** capacidad = burst size, porSegundo = refill rate. */
    data class Limite(val capacidad: Int, val porSegundo: Double)

    private class Cubo(var fichas: Double, var ultimo: Long)

    private val cubos = HashMap<Int, Cubo>()

    @Synchronized
    fun permitir(tipo: Int): Boolean {
        val limite = limites[tipo] ?: return false
        val ahora = reloj()
        val cubo = cubos.getOrPut(tipo) { Cubo(limite.capacidad.toDouble(), ahora) }
        val segundos = (ahora - cubo.ultimo).coerceAtLeast(0L) / 1_000_000_000.0
        cubo.fichas = (cubo.fichas + segundos * limite.porSegundo).coerceAtMost(limite.capacidad.toDouble())
        cubo.ultimo = ahora
        if (cubo.fichas < 1.0) return false
        cubo.fichas -= 1.0
        return true
    }

    @Synchronized
    fun reiniciar() = cubos.clear()
}
