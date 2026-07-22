/*
 * DbrLauncherMobile — provisión de la instancia DBR (Minecraft 1.7.10 + Forge).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.game.addons.modloader.forgelike.forge.ForgeVersions
import com.movtery.zalithlauncher.game.download.game.GameDownloadInfo

/**
 * Datos y helpers para instalar la única instancia gestionada por DbrLauncherMobile:
 * Minecraft 1.7.10 + Forge 10.13.4.1614 (el modpack del server DBR).
 */
object DbrInstall {
    /** Nombre de la instancia (también usado para detectar si ya está instalada). */
    const val VERSION_NAME = "DBR"
    const val MINECRAFT = "1.7.10"
    const val FORGE = "10.13.4.1614"

    /**
     * Construye la info de descarga para la instancia DBR, obteniendo el [ForgeVersion]
     * real desde la lista oficial de Forge para 1.7.10.
     * @throws IllegalStateException si no se puede obtener la lista o no existe la versión.
     */
    suspend fun buildInfo(): GameDownloadInfo {
        val list = ForgeVersions.fetchForgeList(MINECRAFT)
            ?: error("No se pudo obtener la lista de Forge para $MINECRAFT")
        val forge = list.firstOrNull { it.versionName == FORGE }
            ?: error("No se encontró Forge $FORGE para Minecraft $MINECRAFT")
        return GameDownloadInfo(
            gameVersion = MINECRAFT,
            customVersionName = VERSION_NAME,
            forge = forge
        )
    }
}
