package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.game.support.canal_movil.DistribucionTeclado.Franja
import com.movtery.zalithlauncher.game.support.canal_movil.DistribucionTeclado.Modo
import org.junit.Assert.assertEquals
import org.junit.Test

class DistribucionTecladoTest {
    @Test
    fun franjaSegunEspacio() {
        assertEquals(DistribucionTeclado.NADA, DistribucionTeclado.franja(300f, barra = false, chips = false))
        assertEquals(Franja(Modo.UNA_FILA, 40f), DistribucionTeclado.franja(300f, barra = false, chips = true))
        assertEquals(Franja(Modo.UNA_FILA, 44f), DistribucionTeclado.franja(300f, barra = true, chips = false))
        // SwiftKey landscape on the test phone: 103 dp free -> one shared row.
        assertEquals(Franja(Modo.UNA_FILA, 44f), DistribucionTeclado.franja(103f, barra = true, chips = true))
        assertEquals(Franja(Modo.DOS_FILAS, 84f), DistribucionTeclado.franja(180f, barra = true, chips = true))
    }

    @Test
    fun tecladoMuyAlto() {
        // SwiftKey with its toolbar and number row: ~21 dp free -> keyboard full-screen editor.
        assertEquals(Franja(Modo.PANTALLA_COMPLETA, 0f), DistribucionTeclado.franja(21f, barra = true, chips = true))
        assertEquals(Franja(Modo.COMPACTA, 30f), DistribucionTeclado.franja(30f, barra = true, chips = true))
        assertEquals(Franja(Modo.UNA_FILA, 44f), DistribucionTeclado.franja(44f, barra = true, chips = true))
        // Full screen asked: it worked (nothing free) or the keyboard ignored it (smallest bar).
        assertEquals(Franja(Modo.PANTALLA_COMPLETA, 0f),
            DistribucionTeclado.franja(0f, barra = true, chips = true, pantallaCompleta = true))
        assertEquals(Franja(Modo.RESPALDO, 21f),
            DistribucionTeclado.franja(21f, barra = true, chips = true, pantallaCompleta = true))
        assertEquals(Franja(Modo.RESPALDO, 20f),
            DistribucionTeclado.franja(12f, barra = true, chips = true, pantallaCompleta = true))
        // Chips alone are never affected by the full-screen flag.
        assertEquals(Franja(Modo.UNA_FILA, 40f), DistribucionTeclado.franja(10f, barra = false, chips = true))
    }

    @Test
    fun franjaNuncaSaleDeLaPantalla() {
        assertEquals(771, DistribucionTeclado.subirFranja(771, 132, 1080))
        // Keyboard leaves 61 px, strip is 132 px: pinned to the top.
        assertEquals(948, DistribucionTeclado.subirFranja(1019, 132, 1080))
        assertEquals(0, DistribucionTeclado.subirFranja(0, 132, 1080))
        assertEquals(0, DistribucionTeclado.subirFranja(500, 2000, 1080))
    }

    @Test
    fun levantarJuego() {
        // Chat field at the very bottom, 36 px tall; keyboard 771 px, strip 132 px, screen 1080 px.
        assertEquals(903, DistribucionTeclado.levantar(771, 132, 1080, 1080, 36, esconderCampo = false))
        assertEquals(867, DistribucionTeclado.levantar(771, 132, 1080, 1080, 36, esconderCampo = true))
        assertEquals(0, DistribucionTeclado.levantar(0, 132, 1080, 1080, 36, esconderCampo = true))
        // Field already high up: no lift.
        assertEquals(0, DistribucionTeclado.levantar(300, 0, 1080, 200, 36, esconderCampo = false))
        assertEquals(1080, DistribucionTeclado.levantar(2000, 0, 1080, 1080, 0, esconderCampo = false))
    }
}
