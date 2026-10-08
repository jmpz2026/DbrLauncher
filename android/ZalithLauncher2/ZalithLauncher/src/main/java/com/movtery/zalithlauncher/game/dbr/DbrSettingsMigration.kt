/*
 * DbrLauncherMobile — migración única de ajustes entre versiones del launcher.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.game.renderer.renderers.GL4ESRenderer
import com.movtery.zalithlauncher.path.PathManager
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.launcherMMKV

/**
 * Cuando se quita una opción de la UI hay que dejarla en un valor seguro: si no, un jugador
 * que la tenía tocada se queda con ese valor sin poder verlo ni cambiarlo.
 *
 * Cada paso corre una sola vez por instalación ([AllSettings.dbrSettingsRevision] guarda el
 * último aplicado). Una instalación nueva no corre los pasos (ya nace con los defaults
 * nuevos): solo [applyNewInstallDefaults].
 *
 * Para añadir un paso: añadirlo al final de [steps] con la revisión siguiente.
 */
object DbrSettingsMigration {
    /** Pasos en orden; el índice + 1 es la revisión. */
    private val steps: List<() -> Unit> = listOf(
        ::removedFromSettingsUi
    )

    private val currentRevision get() = steps.size

    /**
     * Instalación nueva = MMKV todavía no tiene `ramAllocation`, que `loadAllSettings`
     * guarda siempre en el primer arranque. Llamar antes de que se guarde.
     */
    fun isNewInstall(): Boolean = !launcherMMKV().containsKey(AllSettings.ramAllocation.key)

    fun run(newInstall: Boolean) {
        val unit = AllSettings.dbrSettingsRevision
        if (newInstall) {
            applyNewInstallDefaults()
            unit.save(currentRevision)
            return
        }
        val from = unit.getValue()
        if (from >= currentRevision) return
        for (revision in (from + 1)..currentRevision) {
            steps[revision - 1]()
            unit.save(revision)
        }
    }

    /**
     * Revisión 1: opciones que salieron de Ajustes al simplificarlos (efectos visuales, página
     * de inicio, mirrors, retención de logs, imágenes de puntero, fuente y vaciado del log).
     * Las que siguen en el menú del juego (sensibilidades, giroscopio...) no se tocan.
     */
    private fun removedFromSettingsUi() {
        listOf(
            AllSettings.launcherFestivalEffects,
            AllSettings.launcherBackgroundOpacity,
            AllSettings.videoBackgroundVolume,
            AllSettings.backgroundBlur,
            AllSettings.backgroundBlurType,
            AllSettings.homePageType,
            AllSettings.homePageURL,
            AllSettings.launcherAnimateSpeed,
            AllSettings.launcherAnimateExtent,
            AllSettings.launcherSwapAnimateType,
            AllSettings.fetchModLoaderSource,
            AllSettings.fileDownloadSource,
            AllSettings.assetSearchSource,
            AllSettings.assetDownloadSource,
            AllSettings.launcherLogRetentionDays,
            AllSettings.logTextSize,
            AllSettings.logBufferFlushInterval,
            AllSettings.arrowMouseHotspot,
            AllSettings.linkMouseHotspot,
            AllSettings.iBeamMouseHotspot,
            AllSettings.crossHairMouseHotspot,
            AllSettings.resizeNSMouseHotspot,
            AllSettings.resizeEWMouseHotspot,
            AllSettings.resizeAllMouseHotspot,
            AllSettings.notAllowedMouseHotspot
        ).forEach { it.reset() }
        //Fondo e imágenes de puntero personalizados: archivos, no ajustes.
        runCatching { PathManager.FILE_LAUNCHER_BACKGROUND.delete() }
        runCatching { PathManager.DIR_MOUSE_POINTER.listFiles()?.forEach { it.delete() } }
    }

    /** Valores que solo reciben los jugadores nuevos (los actuales conservan los suyos). */
    private fun applyNewInstallDefaults() {
        //Completo y Ligero van con GL4ES (el Experimental pone LTW al activarse).
        AllSettings.renderer.save(GL4ESRenderer.getUniqueIdentifier())
    }
}
