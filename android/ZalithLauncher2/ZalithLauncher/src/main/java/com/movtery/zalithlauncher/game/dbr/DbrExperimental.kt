/*
 * DbrLauncherMobile — variante experimental del modpack (mods en pruebas, no para el servidor).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.game.renderer.renderers.LTWRenderer
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant

/**
 * El modpack experimental lleva Angelica, que solo arranca con LTW. Al activarlo se cambia el
 * motor de render a LTW y se recuerda el anterior; al salir se restaura, salvo que el jugador
 * lo haya cambiado a mano mientras tanto (entonces manda su elección).
 */
object DbrExperimental {
    /** Activa la variante experimental (el jugador ya confirmó el aviso). */
    fun enable() {
        AllSettings.dbrModpackVariant.save(DbrModpackVariant.EXPERIMENTAL)
        AllSettings.dbrModpackSyncPending.save(true)

        val ltw = LTWRenderer.getUniqueIdentifier()
        val current = AllSettings.renderer.getValue()
        if (current != ltw) {
            AllSettings.dbrRendererBeforeExperimental.save(current)
            AllSettings.dbrExperimentalSwitchedRenderer.save(true)
            AllSettings.renderer.save(ltw)
        }
    }

    /** Llamar al pasar de la experimental a otra variante. */
    fun onLeave() {
        if (!AllSettings.dbrExperimentalSwitchedRenderer.getValue()) return
        if (AllSettings.renderer.getValue() == LTWRenderer.getUniqueIdentifier()) {
            AllSettings.renderer.save(AllSettings.dbrRendererBeforeExperimental.getValue())
        }
        AllSettings.dbrExperimentalSwitchedRenderer.save(false)
        AllSettings.dbrRendererBeforeExperimental.reset()
    }
}
