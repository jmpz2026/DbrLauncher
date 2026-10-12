/*
 * DbrLauncherMobile — idioma del launcher y del juego.
 * Mismo criterio que el launcher de escritorio (src/main/idioma): el idioma del launcher es el
 * del juego (lang: de options.txt). Elegirlo en Ajustes cambia los dos; si el jugador lo cambia
 * dentro de Minecraft, el launcher lo sigue al volver.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatDelegate
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.version.installed.VersionsManager
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.AppLanguage
import com.movtery.zalithlauncher.setting.enums.applyLanguage
import com.movtery.zalithlauncher.utils.logging.Logger
import java.io.File

object DbrIdioma {
    private const val TAG = "DbrIdioma"

    /** Los tres idiomas del servidor: código de Minecraft e idioma de la app. */
    enum class Idioma(val mc: String, val app: AppLanguage, @StringRes val textRes: Int) {
        ES("es_ES", AppLanguage.SPANISH, R.string.dbr_language_es),
        EN("en_US", AppLanguage.ENGLISH, R.string.dbr_language_en),
        PT("pt_BR", AppLanguage.BRAZILIAN_PORTUGUESE, R.string.dbr_language_pt)
    }

    /**
     * Idioma para un código de Minecraft ("pt_PT", "es_MX") o una etiqueta de Android
     * ("pt-BR", "es-419"). Misma cadena que el servidor: es_* castellano, pt_* portugués de
     * Brasil y el resto inglés.
     */
    fun de(codigo: String?): Idioma {
        val c = codigo.orEmpty().lowercase()
        return when {
            c.startsWith("es") -> Idioma.ES
            c.startsWith("pt") -> Idioma.PT
            else -> Idioma.EN
        }
    }

    private val LANG = Regex("^lang:(.+)$", RegexOption.MULTILINE)

    /** lang: de un options.txt, o null si no existe o no lo trae. */
    fun leerLang(opciones: File): String? = runCatching {
        if (!opciones.exists()) null else LANG.find(opciones.readText())?.groupValues?.get(1)?.trim()
    }.getOrNull()

    /** Cambia (o agrega) el lang: de un options.txt que ya existe. */
    fun escribirLang(opciones: File, mc: String): Boolean = runCatching {
        if (!opciones.exists()) return false
        val texto = opciones.readText()
        val nuevo = if (LANG.containsMatchIn(texto)) {
            texto.replace(LANG, "lang:$mc")
        } else {
            texto + (if (texto.isEmpty() || texto.endsWith("\n")) "" else "\n") + "lang:$mc\n"
        }
        if (nuevo != texto) opciones.writeText(nuevo)
        true
    }.onFailure { Logger.warning(TAG, "No se pudo escribir lang en ${opciones.path}", it) }
        .getOrDefault(false)

    /** options.txt de la instancia DBR, o null si no está instalada. */
    private fun opciones(): File? = VersionsManager.versions.value
        .firstOrNull { it.getVersionName() == DbrInstall.VERSION_NAME && it.isValid() }
        ?.getGameDir()?.let { File(it, "options.txt") }

    /** Código de Minecraft para la primera siembra de options.txt: el elegido o el del sistema. */
    fun inicial(): String = AllSettings.dbrGameLanguage.getValue().ifEmpty {
        de(Resources.getSystem().configuration.locales[0]?.toLanguageTag()).mc
    }

    /** Lo que manda: el lang: del juego si ya existe, si no el inicial. */
    fun actual(): Idioma = de(opciones()?.let { leerLang(it) } ?: inicial())

    /** El jugador eligió idioma en Ajustes: launcher, juego y siembra futura. */
    fun elegir(idioma: Idioma) {
        AllSettings.dbrGameLanguage.save(idioma.mc)
        opciones()?.let { escribirLang(it, idioma.mc) }
        if (idiomaApp() != idioma) applyLanguage(idioma.app)
    }

    /**
     * Al abrir la app o volver del juego: si el idioma del juego no es el de la app (lo cambió
     * dentro de Minecraft), la app se pone en ese. Recrea la actividad solo si cambia.
     */
    fun seguirAlJuego() {
        val juego = opciones()?.let { leerLang(it) } ?: return
        val idioma = de(juego)
        if (idiomaApp() != idioma) applyLanguage(idioma.app)
    }

    /** Idioma en el que se muestra la app ahora (el fijado o, si no hay, el del sistema). */
    private fun idiomaApp(): Idioma {
        val fijado = AppCompatDelegate.getApplicationLocales()
        val tag = if (!fijado.isEmpty) fijado[0]?.toLanguageTag()
        else Resources.getSystem().configuration.locales[0]?.toLanguageTag()
        return de(tag)
    }

    /**
     * Después de sembrar options.txt: si el jugador ya tenía uno se respeta su idioma (una
     * re-siembra por cambio de variante no lo devuelve al castellano); si no, el inicial.
     */
    fun aplicarSiembra(opciones: File, previo: String?) {
        escribirLang(opciones, previo ?: inicial())
    }
}
