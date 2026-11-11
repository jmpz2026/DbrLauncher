package com.movtery.zalithlauncher.game.support.canal_movil

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.utils.logging.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val TAG = "AvisosSistema"

/**
 * Heat and battery warnings while the game runs (plan block H).
 *
 * The launcher shows the warning itself (a touch on an in-game toast would move the camera). The
 * heat warning offers "Reduce": lower resolution here, and [Protocolo.REDUCIR] to DbrCore, which
 * lowers particles, render distance and Dbr VFX. Nothing changes unless the player taps it.
 */
object AvisosSistema {
    sealed interface Aviso {
        /** The phone is hot. */
        data object Calor : Aviso
        /** The phone cooled down while reduced mode is on: offer to restore. */
        data object Fresco : Aviso
        data class Bateria(val porcentaje: Int) : Aviso
    }

    /**
     * Pure threshold logic, one warning per threshold. Heat re-arms when the phone is cool again;
     * battery thresholds re-arm while charging.
     */
    class Umbrales {
        private var calorAvisado = false
        private val bateriaAvisada = HashSet<Int>()

        /** [estado] is a PowerManager.THERMAL_STATUS_* value. */
        fun alCalor(estado: Int, reducido: Boolean): Aviso? {
            if (estado >= CALOR_AVISO) {
                if (calorAvisado) return null
                calorAvisado = true
                return Aviso.Calor
            }
            if (estado <= CALOR_REARME && calorAvisado) {
                calorAvisado = false
                return if (reducido) Aviso.Fresco else null
            }
            return null
        }

        fun alBateria(porcentaje: Int, cargando: Boolean): Aviso? {
            if (porcentaje !in 0..100) return null
            if (cargando) {
                bateriaAvisada.clear()
                return null
            }
            val umbral = UMBRALES_BATERIA.firstOrNull { porcentaje <= it && it !in bateriaAvisada } ?: return null
            // Crossing 5% directly also counts 15% as done.
            UMBRALES_BATERIA.filter { it >= umbral }.forEach { bateriaAvisada.add(it) }
            return Aviso.Bateria(porcentaje)
        }
    }

    /** THERMAL_STATUS_SEVERE: warn. THERMAL_STATUS_LIGHT or lower: cool again. */
    const val CALOR_AVISO = 3
    const val CALOR_REARME = 1
    /** Lowest first, so the deepest crossed threshold wins. */
    val UMBRALES_BATERIA = listOf(5, 15)
    /** Resolution factor while reduced, on top of the player's own ratio. */
    const val FACTOR_REDUCIDO = 0.7f

    private val _aviso = MutableStateFlow<Aviso?>(null)
    /** The warning on screen, null = none. The banner clears it with [descartar]. */
    val aviso: StateFlow<Aviso?> = _aviso.asStateFlow()

    private val _reducido = MutableStateFlow(false)
    val reducido: StateFlow<Boolean> = _reducido.asStateFlow()

    private var umbrales = Umbrales()
    private var receptor: BroadcastReceiver? = null
    private var oyenteCalor: Any? = null

    fun descartar() {
        _aviso.value = null
    }

    /** The banner button: toggles reduced mode and tells DbrCore. */
    fun alternarReducido() {
        _reducido.value = !_reducido.value
        CanalMovil.enviarReducir(_reducido.value)
        _aviso.value = null
    }

    fun iniciar(context: Context) {
        detener(context)
        umbrales = Umbrales()
        val app = context.applicationContext
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                intent ?: return
                val nivel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val escala = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (nivel < 0 || escala <= 0) return
                val estado = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val cargando = estado == BatteryManager.BATTERY_STATUS_CHARGING ||
                    estado == BatteryManager.BATTERY_STATUS_FULL
                umbrales.alBateria(nivel * 100 / escala, cargando)?.let {
                    if (AllSettings.dbrAvisoBateria.getValue()) _aviso.value = it
                }
            }
        }
        app.registerReceiver(r, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        receptor = r
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
                val oyente = PowerManager.OnThermalStatusChangedListener { estado ->
                    umbrales.alCalor(estado, _reducido.value)?.let {
                        // "Restore" is always offered: reduced mode must never get stuck on.
                        if (it == Aviso.Fresco || AllSettings.dbrAvisoCalor.getValue()) _aviso.value = it
                    }
                }
                pm.addThermalStatusListener(app.mainExecutor, oyente)
                oyenteCalor = oyente
            } catch (e: Exception) {
                Logger.warning(TAG, "thermal listener not available: ${e.message}")
            }
        }
    }

    fun detener(context: Context) {
        val app = context.applicationContext
        receptor?.let { runCatching { app.unregisterReceiver(it) } }
        receptor = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            (oyenteCalor as? PowerManager.OnThermalStatusChangedListener)?.let { o ->
                runCatching { (app.getSystemService(Context.POWER_SERVICE) as PowerManager).removeThermalStatusListener(o) }
            }
        }
        oyenteCalor = null
        _aviso.value = null
    }

    /** New game: reduced mode off. */
    fun reiniciar() {
        _reducido.value = false
        _aviso.value = null
    }
}
