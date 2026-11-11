package com.movtery.zalithlauncher.game.support.canal_movil

/**
 * Layout of the Dbr strip over the keyboard (step 8d): the text bar, the chip row, and how far the
 * game is lifted so its chat shows above them. Pure, unit tested on the JVM.
 */
object DistribucionTeclado {
    /** Chip row alone, as before step 8d. */
    const val ALTO_CHIPS_DP = 40f
    /** Text bar alone, or text bar and chips side by side. */
    const val ALTO_UNA_FILA_DP = 44f
    /** Below this much game left over, bar and chips share one row. */
    const val MIN_JUEGO_DP = 96f
    /** Below this much room the bar alone shrinks to fit; below [MIN_COMPACTA_DP] it gives up. */
    const val MIN_COMPACTA_DP = 24f
    /** Smallest bar drawn when the keyboard ignored the full-screen request (step 8e). */
    const val MIN_RESPALDO_DP = 20f
    /** With the full-screen editor up the keyboard covers (almost) everything. */
    const val MAX_LIBRE_PANTALLA_COMPLETA_DP = 8f

    enum class Modo {
        /** Chips on top, text bar right over the keyboard. */
        DOS_FILAS,
        /** Text bar and chips side by side, or one of them alone. */
        UNA_FILA,
        /** Text bar only, as tall as the room left (step 8e). */
        COMPACTA,
        /** The keyboard shows its own full-screen editor: no Dbr strip, game not lifted. */
        PANTALLA_COMPLETA,
        /** Full screen was asked but the keyboard ignored it: smallest bar pinned to the top. */
        RESPALDO,
    }

    data class Franja(val modo: Modo, val altoDp: Float) {
        val dosFilas: Boolean get() = modo == Modo.DOS_FILAS
        val conChips: Boolean get() = modo == Modo.DOS_FILAS || modo == Modo.UNA_FILA
    }

    val NADA = Franja(Modo.UNA_FILA, 0f)

    /**
     * [libreDp] = screen height minus keyboard height. [pantallaCompleta] = the keyboard was already
     * asked for its full-screen editor (it stays so until the chat closes).
     */
    fun franja(libreDp: Float, barra: Boolean, chips: Boolean, pantallaCompleta: Boolean = false): Franja = when {
        !barra && !chips -> NADA
        !barra -> Franja(Modo.UNA_FILA, ALTO_CHIPS_DP)
        pantallaCompleta -> if (libreDp <= MAX_LIBRE_PANTALLA_COMPLETA_DP) {
            Franja(Modo.PANTALLA_COMPLETA, 0f)
        } else {
            Franja(Modo.RESPALDO, libreDp.coerceIn(MIN_RESPALDO_DP, ALTO_UNA_FILA_DP))
        }
        chips && libreDp >= ALTO_UNA_FILA_DP + ALTO_CHIPS_DP + MIN_JUEGO_DP ->
            Franja(Modo.DOS_FILAS, ALTO_UNA_FILA_DP + ALTO_CHIPS_DP)
        libreDp >= ALTO_UNA_FILA_DP -> Franja(Modo.UNA_FILA, ALTO_UNA_FILA_DP)
        libreDp >= MIN_COMPACTA_DP -> Franja(Modo.COMPACTA, libreDp)
        else -> Franja(Modo.PANTALLA_COMPLETA, 0f)
    }

    /**
     * How far up the strip goes, in pixels: right over the keyboard, but never past the top of the
     * screen (a very tall keyboard would push it out, step 8e).
     */
    fun subirFranja(teclado: Int, franja: Int, alto: Int): Int =
        minOf(teclado.coerceAtLeast(0), (alto - franja).coerceAtLeast(0))

    /**
     * Pixels the game is lifted. [campoAbajo] is the bottom edge of the focused field in the game
     * (screen pixels), [campoAlto] its height. With the Dbr text bar the field hides right under
     * the strip ([esconderCampo]): the bar already shows that line, so the chat history and the
     * autocomplete popup get the room.
     */
    fun levantar(
        teclado: Int, franja: Int, alto: Int, campoAbajo: Int, campoAlto: Int, esconderCampo: Boolean,
    ): Int {
        if (teclado <= 0 || alto <= 0) return 0
        val distancia = alto - campoAbajo.coerceIn(0, alto)
        val oculto = if (esconderCampo) campoAlto.coerceAtLeast(0) else 0
        return (teclado + franja - distancia - oculto).coerceIn(0, alto)
    }
}

/**
 * Pixels the game surface is lifted right now (VMActivity). Touches on the lifted game add this to
 * their y so they land where the player sees the game (GameScreen.sendPosition).
 */
object DesplazamientoJuego {
    @Volatile
    var px: Int = 0
}
