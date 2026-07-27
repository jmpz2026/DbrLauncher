/*
 * DbrLauncherMobile — variante del modpack DBR.
 * Full y Lite comparten Minecraft/Forge; solo cambia el set de mods (manifest aparte).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.setting.enums

import androidx.annotation.StringRes
import com.movtery.zalithlauncher.R

/** Variante del modpack a sincronizar. Mismo criterio que el launcher de escritorio. */
enum class DbrModpackVariant(@StringRes val textRes: Int, val manifestUrl: String) {
    FULL(
        R.string.dbr_modpack_full,
        "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest.json"
    ),
    LITE(
        R.string.dbr_modpack_lite,
        "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest-lite.json"
    )
}
