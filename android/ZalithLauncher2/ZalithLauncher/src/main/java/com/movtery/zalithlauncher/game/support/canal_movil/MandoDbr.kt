package com.movtery.zalithlauncher.game.support.canal_movil

import android.content.Context
import android.hardware.input.InputManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.Vibrator
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * DBR (PLAN-canal-movil 8b.2): gamepad for games with DbrCore. Instead of ZL2's remapper (keys and
 * mouse), the raw state goes to the game through the mobile channel and DbrCore's `core.mando` does
 * the mapping, profiles and macros, the same as on PC.
 *
 * Only while the game declared [Protocolo.CAP_MANDO]; otherwise everything returns false and the
 * old ZL2 path keeps working (games without DbrCore).
 *
 * Buttons follow DbrCore's `Boton` order (Xbox names). State is sent only on change, at most once
 * every [MIN_ENVIO_MS] (the last change always arrives). [actividad] ticks on every gamepad input so
 * the screen can hide the touch controls.
 */
object MandoDbr {
    private const val MIN_ENVIO_MS = 8L

    // DbrCore Boton.ordinal()
    private const val A = 0; private const val B = 1; private const val X = 2; private const val Y = 3
    private const val LB = 4; private const val RB = 5; private const val BACK = 6; private const val START = 7
    private const val GUIA = 8; private const val LS = 9; private const val RS = 10
    private const val ARRIBA = 11; private const val ABAJO = 12; private const val IZQUIERDA = 13; private const val DERECHA = 14

    private val handler = Handler(Looper.getMainLooper())
    private var botonesTecla = 0
    private var botonesHat = 0
    private val ejes = FloatArray(6)
    private var ultimoEnvio = 0L
    private var pendiente = false
    private var enviado: ByteArray? = null

    private var dispositivo = -1
    private var modelo = ""
    private var avisadoConectado = false
    private var inputManager: InputManager? = null

    private val _actividad = MutableStateFlow(0L)
    /** Changes on every gamepad input handled here. */
    val actividad: StateFlow<Long> = _actividad

    private val listener = object : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(deviceId: Int) {}
        override fun onInputDeviceChanged(deviceId: Int) {}
        override fun onInputDeviceRemoved(deviceId: Int) {
            if (deviceId == dispositivo) desconectar()
        }
    }

    /** From VMActivity.onCreate: watches gamepad disconnection. */
    fun iniciar(context: Context) {
        if (inputManager != null) return
        inputManager = (context.getSystemService(Context.INPUT_SERVICE) as? InputManager)?.also {
            it.registerInputDeviceListener(listener, handler)
        }
    }

    fun activo(): Boolean = CanalMovil.juegoSoportaMando()

    /** Gamepad key from dispatchKeyEvent. True if it was taken (do not pass it to ZL2). */
    fun tecla(event: KeyEvent): Boolean {
        if (!activo() || !esMando(event.device)) return false
        val bit = when (event.keyCode) {
            KeyEvent.KEYCODE_BUTTON_A -> A
            KeyEvent.KEYCODE_BUTTON_B -> B
            KeyEvent.KEYCODE_BUTTON_X -> X
            KeyEvent.KEYCODE_BUTTON_Y -> Y
            KeyEvent.KEYCODE_BUTTON_L1 -> LB
            KeyEvent.KEYCODE_BUTTON_R1 -> RB
            KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BACK -> BACK
            KeyEvent.KEYCODE_BUTTON_START -> START
            KeyEvent.KEYCODE_BUTTON_MODE -> GUIA
            KeyEvent.KEYCODE_BUTTON_THUMBL -> LS
            KeyEvent.KEYCODE_BUTTON_THUMBR -> RS
            KeyEvent.KEYCODE_DPAD_UP -> ARRIBA
            KeyEvent.KEYCODE_DPAD_DOWN -> ABAJO
            KeyEvent.KEYCODE_DPAD_LEFT -> IZQUIERDA
            KeyEvent.KEYCODE_DPAD_RIGHT -> DERECHA
            // digital triggers (some gamepads have no analog axis)
            KeyEvent.KEYCODE_BUTTON_L2 -> { gatillo(4, event); return true }
            KeyEvent.KEYCODE_BUTTON_R2 -> { gatillo(5, event); return true }
            else -> return false
        }
        if (event.repeatCount > 0) return true
        when (event.action) {
            KeyEvent.ACTION_DOWN -> botonesTecla = botonesTecla or (1 shl bit)
            KeyEvent.ACTION_UP -> botonesTecla = botonesTecla and (1 shl bit).inv()
            else -> return true
        }
        conectar(event.device)
        cambio()
        return true
    }

    private fun gatillo(eje: Int, event: KeyEvent) {
        if (event.repeatCount > 0) return
        ejes[eje] = if (event.action == KeyEvent.ACTION_DOWN) 1f else 0f
        conectar(event.device)
        cambio()
    }

    /** Sticks, triggers and hat from dispatchGenericMotionEvent. True if it was taken. */
    fun movimiento(event: MotionEvent): Boolean {
        if (!activo() || event.action != MotionEvent.ACTION_MOVE) return false
        if ((event.source and InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK || !esMando(event.device)) return false
        val d = event.device
        ejes[0] = eje(event, d, MotionEvent.AXIS_X)
        ejes[1] = eje(event, d, MotionEvent.AXIS_Y)
        ejes[2] = eje(event, d, MotionEvent.AXIS_Z)
        ejes[3] = eje(event, d, MotionEvent.AXIS_RZ)
        ejes[4] = maxOf(eje(event, d, MotionEvent.AXIS_LTRIGGER), eje(event, d, MotionEvent.AXIS_BRAKE))
        ejes[5] = maxOf(eje(event, d, MotionEvent.AXIS_RTRIGGER), eje(event, d, MotionEvent.AXIS_GAS))
        val hx = event.getAxisValue(MotionEvent.AXIS_HAT_X)
        val hy = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
        var hat = 0
        if (hx < -0.5f) hat = hat or (1 shl IZQUIERDA)
        if (hx > 0.5f) hat = hat or (1 shl DERECHA)
        if (hy < -0.5f) hat = hat or (1 shl ARRIBA)
        if (hy > 0.5f) hat = hat or (1 shl ABAJO)
        botonesHat = hat
        conectar(d)
        cambio()
        return true
    }

    /** Axis value with the device's own flat zone ignored (the game applies the profile's). */
    private fun eje(event: MotionEvent, d: InputDevice?, eje: Int): Float {
        val rango = d?.getMotionRange(eje, event.source) ?: return 0f
        val v = event.getAxisValue(eje)
        return if (abs(v) < rango.flat) 0f else v
    }

    private fun esMando(d: InputDevice?): Boolean {
        if (d == null || d.isVirtual) return false
        val s = d.sources
        return (s and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
            (s and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
    }

    private fun conectar(d: InputDevice?) {
        _actividad.value = SystemClock.uptimeMillis()
        if (d == null) return
        if (d.id != dispositivo || !avisadoConectado) {
            dispositivo = d.id
            modelo = d.name ?: ""
            avisadoConectado = CanalMovil.enviarMandoInfo(true, modelo)
        }
    }

    private fun desconectar() {
        botonesTecla = 0
        botonesHat = 0
        ejes.fill(0f)
        enviado = null
        if (avisadoConectado) CanalMovil.enviarMandoInfo(false, modelo)
        avisadoConectado = false
        dispositivo = -1
    }

    /** The game reconnected (new HOLA): announce the gamepad again on the next input. */
    fun reiniciar() {
        avisadoConectado = false
        enviado = null
    }

    private fun cambio() {
        val ahora = SystemClock.uptimeMillis()
        if (ahora - ultimoEnvio >= MIN_ENVIO_MS) {
            enviar()
        } else if (!pendiente) {
            pendiente = true
            handler.postDelayed({ pendiente = false; enviar() }, MIN_ENVIO_MS - (ahora - ultimoEnvio))
        }
    }

    private fun enviar() {
        val datos = codificar(botonesTecla or botonesHat, ejes)
        if (datos.contentEquals(enviado)) return
        if (CanalMovil.enviarMandoEstado(datos)) {
            enviado = datos
            ultimoEnvio = SystemClock.uptimeMillis()
        }
    }

    /** Same layout as DbrCore BackendCanal: short buttons, 4 signed stick bytes, 2 unsigned trigger bytes. */
    fun codificar(botones: Int, ejes: FloatArray): ByteArray {
        val d = ByteArray(8)
        d[0] = (botones ushr 8).toByte()
        d[1] = botones.toByte()
        for (i in 0 until 4) d[2 + i] = (ejes[i].coerceIn(-1f, 1f) * 127).roundToInt().toByte()
        d[6] = (ejes[4].coerceIn(0f, 1f) * 255).roundToInt().toByte()
        d[7] = (ejes[5].coerceIn(0f, 1f) * 255).roundToInt().toByte()
        return d
    }

    /** Vibrator of the gamepad in use, if it has one (Android 12+), for [VibradorDbr]. */
    fun vibrador(): Vibrator? {
        if (!activo() || dispositivo < 0 || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        if (SystemClock.uptimeMillis() - _actividad.value > 120_000L) return null
        val d = InputDevice.getDevice(dispositivo) ?: return null
        val v = d.vibratorManager.defaultVibrator
        return if (v.hasVibrator()) v else null
    }
}
