package com.movtery.zalithlauncher.game.support.canal_movil

import android.media.AudioAttributes
import android.os.Build
import android.os.SystemClock
import android.os.VibrationAttributes
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
    /** First vibrations of a game go to the log (diagnosis on real phones). */
    @Volatile
    private var registrados = 0

    private val vibrador: Vibrator? by lazy {
        runCatching { GlobalContext.getSystemService(Vibrator::class.java) }.getOrNull()
            ?.takeIf { it.hasVibrator() }
    }

    /** Loads the modpack catalog for a new game. Falls back to the built-in one. */
    fun cargar(gameDir: File?) {
        ritmo.reiniciar()
        registrados = 0
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
        // Playing with a gamepad that has a motor: it vibrates instead of the phone. The game already
        // applied the gamepad profile's switches and intensity (DbrCore Vibrar), so the phone ones do not count.
        MandoDbr.vibrador()?.let { m ->
            val patron = catalogo.patron(id)
            if (ritmo.permitir(SystemClock.uptimeMillis(), patron.duracion, patron.maxFuerza * fuerza)) tocar(m, patron, fuerza, 1f)
            return
        }
        if (!AllSettings.dbrVibracion.getValue() || !categoriaActiva(categoria)) return
        val intensidad = AllSettings.dbrVibracionIntensidad.getValue() / 100f
        if (intensidad <= 0f || fuerza <= 0f) return
        val v = vibrador ?: return
        val patron = catalogo.patron(id)
        if (!ritmo.permitir(SystemClock.uptimeMillis(), patron.duracion, patron.maxFuerza * fuerza)) return
        if (registrados < 30) {
            registrados++
            Logger.info(TAG, "vibrate $id fuerza=$fuerza amplitud=${v.hasAmplitudeControl()}")
        }
        tocar(v, patron, fuerza, intensidad)
    }

    /** Settings preview: plays [id] with the current intensity, ignoring the category switch. */
    fun probar(id: String) {
        ritmo.reiniciar()
        val v = vibrador ?: return
        val intensidad = AllSettings.dbrVibracionIntensidad.getValue() / 100f
        if (intensidad <= 0f) return
        tocar(v, catalogo.patron(id), 1f, intensidad)
    }

    /**
     * Plays as a game vibration (media usage), not as touch feedback: some ROMs (Honor) mute or
     * shorten touch vibrations.
     */
    private fun tocar(v: Vibrator, patron: Patron, fuerza: Float, intensidad: Float) {
        val (tiempos, amps) = ondaFinal(patron, fuerza, intensidad, v.hasAmplitudeControl()) ?: return
        runCatching {
            val efecto = VibrationEffect.createWaveform(tiempos, amps, -1)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                v.vibrate(efecto, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_MEDIA))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(efecto, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).build())
            }
        }.onFailure { Logger.error(TAG, "vibrate failed", it) }
    }

    private fun categoriaActiva(c: CategoriaVibracion): Boolean = when (c) {
        CategoriaVibracion.COMBATE -> AllSettings.dbrVibracionCombate.getValue()
        CategoriaVibracion.KI -> AllSettings.dbrVibracionKi.getValue()
        CategoriaVibracion.MUNDO -> AllSettings.dbrVibracionMundo.getValue()
        CategoriaVibracion.AVISOS -> AllSettings.dbrVibracionAvisos.getValue()
    }
}
