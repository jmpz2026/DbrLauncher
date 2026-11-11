package com.movtery.zalithlauncher.ui.dbr

import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.unit.dp
import com.movtery.zalithlauncher.game.support.canal_movil.MandoDbr

// DBR (PLAN-canal-movil 8f.2): navegar el launcher con mando. Android ya convierte la cruceta y
// el stick en movimiento de foco, A en confirmar y B en Atrás; aquí va lo que falta: ver dónde
// está el foco, empezar en Jugar y LB/RB para cambiar de pestaña. Nada de esto corre en la
// partida (VMActivity / MandoDbr).

/** Borde dorado mientras el elemento tiene el foco (solo pasa con mando o teclado). */
fun Modifier.dbrFoco(): Modifier = composed {
    var enfocado by remember { mutableStateOf(false) }
    this
        .onFocusChanged { enfocado = it.hasFocus }
        .drawWithContent {
            drawContent()
            if (enfocado) {
                val g = 3.dp.toPx()
                drawRect(color = DbrGold, style = Stroke(width = g))
            }
        }
}

private fun hayMando(): Boolean =
    InputDevice.getDeviceIds().any { MandoDbr.esMando(InputDevice.getDevice(it)) }

/** True mientras haya un mando conectado. */
@Composable
fun rememberMandoConectado(): Boolean {
    val context = LocalContext.current
    var conectado by remember { mutableStateOf(hayMando()) }
    DisposableEffect(context) {
        val im = context.getSystemService(Context.INPUT_SERVICE) as? InputManager
        val l = object : InputManager.InputDeviceListener {
            override fun onInputDeviceAdded(deviceId: Int) { conectado = hayMando() }
            override fun onInputDeviceRemoved(deviceId: Int) { conectado = hayMando() }
            override fun onInputDeviceChanged(deviceId: Int) { conectado = hayMando() }
        }
        im?.registerInputDeviceListener(l, Handler(Looper.getMainLooper()))
        onDispose { im?.unregisterInputDeviceListener(l) }
    }
    return conectado
}

/**
 * Pone el foco en el elemento de [requester] cuando hay un mando conectado (al entrar a la
 * pantalla o al conectarlo). Pasa a modo teclado antes, porque en modo táctil los botones no
 * aceptan el foco.
 */
@Composable
fun FocoInicialConMando(requester: FocusRequester) {
    val conectado = rememberMandoConectado()
    val modos = LocalInputModeManager.current
    LaunchedEffect(conectado) {
        if (!conectado) return@LaunchedEffect
        if (modos.inputMode != InputMode.Keyboard) modos.requestInputMode(InputMode.Keyboard)
        runCatching { requester.requestFocus() }
    }
}

/** LB / RB del mando (al bajar). Solo llega si algo de este árbol tiene el foco. */
fun Modifier.dbrPestanasMando(anterior: () -> Unit, siguiente: () -> Unit): Modifier =
    onPreviewKeyEvent { e ->
        when (e.nativeKeyEvent.keyCode) {
            KeyEvent.KEYCODE_BUTTON_L1 -> { if (e.type == KeyEventType.KeyDown && e.nativeKeyEvent.repeatCount == 0) anterior(); true }
            KeyEvent.KEYCODE_BUTTON_R1 -> { if (e.type == KeyEventType.KeyDown && e.nativeKeyEvent.repeatCount == 0) siguiente(); true }
            else -> false
        }
    }
