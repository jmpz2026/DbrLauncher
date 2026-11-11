package com.movtery.zalithlauncher.game.support.canal_movil

import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import com.movtery.zalithlauncher.context.GlobalContext
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.utils.logging.Logger
import java.io.File

private const val TAG = "VibradorDbr"

/**
 * Plays VIBRAR messages on the phone (plan E). Only the phone, never a gamepad. Same system
 * Vibrator the TouchController proxy uses (VibrationHandler), but with waveforms: a pattern can
 * have several pulses and its own strength.
 */
object VibradorDbr {
    /** Catalog path inside the game folder (config/dbrcore in the modpack, a normal synced file so updates reach it). */
    const val ARCHIVO = "config/dbrcore/vibracion.json"
    /** Bigger than this is not a catalog. */
    private const val MAX_BYTES = 32 * 1024L

    @Volatile
    private var catalogo: CatalogoVibracion = CatalogoVibracion.PORDEFECTO
    private val ritmo = RitmoVibracion()

    private val vibrador: Vibrator? by lazy {
        runCatching { GlobalContext.getSystemService(Vibrator::class.java) }.getOrNull()
            ?.takeIf { it.hasVibrator() }
    }

    /** Loads the modpack catalog for a new game. Falls back to the built-in one. */
    fun cargar(gameDir: File?) {
        ritmo.reiniciar()
        val archivo = gameDir?.let { File(it, ARCHIVO) }
        val leido = runCatching {
            archivo?.takeIf { it.isFile && it.length() in 1..MAX_BYTES }?.readText()
        }.getOrNull()?.let { CatalogoVibracion.leer(it) }
        if (leido == null && archivo?.exists() == true) Logger.warning(TAG, "invalid $ARCHIVO, using the built-in catalog")
        catalogo = leido ?: CatalogoVibracion.PORDEFECTO
        Logger.info(TAG, "vibration catalog: ${catalogo.tamano} events (${if (leido != null) "modpack" else "built-in"})")
    }

    fun reproducir(id: String, fuerza: Float) {
        val categoria = CategoriaVibracion.de(id) ?: return
        if (!AllSettings.dbrVibracion.getValue() || !categoriaActiva(categoria)) return
        val intensidad = AllSettings.dbrVibracionIntensidad.getValue() / 100f
        if (intensidad <= 0f || fuerza <= 0f) return
        val v = vibrador ?: return
        val patron = catalogo.patron(id)
        if (!ritmo.permitir(SystemClock.uptimeMillis(), patron.duracion, patron.maxFuerza * fuerza)) return
        runCatching {
            val efecto = if (v.hasAmplitudeControl()) {
                VibrationEffect.createWaveform(patron.tiempos, amplitudes(patron, fuerza, intensidad), -1)
            } else {
                // No amplitude control: on/off only, pauses stay pauses.
                val amps = IntArray(patron.fuerzas.size) { i ->
                    if (patron.fuerzas[i] > 0f) VibrationEffect.DEFAULT_AMPLITUDE else 0
                }
                VibrationEffect.createWaveform(patron.tiempos, amps, -1)
            }
            v.vibrate(efecto)
        }.onFailure { Logger.error(TAG, "vibrate failed", it) }
    }

    /** Settings preview: plays [id] with the current intensity, ignoring the category switch. */
    fun probar(id: String) {
        ritmo.reiniciar()
        val v = vibrador ?: return
        val patron = catalogo.patron(id)
        val intensidad = AllSettings.dbrVibracionIntensidad.getValue() / 100f
        if (intensidad <= 0f) return
        runCatching {
            v.vibrate(VibrationEffect.createWaveform(patron.tiempos, amplitudes(patron, 1f, intensidad), -1))
        }
    }

    private fun categoriaActiva(c: CategoriaVibracion): Boolean = when (c) {
        CategoriaVibracion.COMBATE -> AllSettings.dbrVibracionCombate.getValue()
        CategoriaVibracion.KI -> AllSettings.dbrVibracionKi.getValue()
        CategoriaVibracion.MUNDO -> AllSettings.dbrVibracionMundo.getValue()
        CategoriaVibracion.AVISOS -> AllSettings.dbrVibracionAvisos.getValue()
    }
}
