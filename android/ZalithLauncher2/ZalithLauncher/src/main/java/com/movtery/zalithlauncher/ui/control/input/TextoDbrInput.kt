package com.movtery.zalithlauncher.ui.control.input

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.text.TextUtils
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.CompletionInfo
import android.view.inputmethod.CorrectionInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedText
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.InputMethodManager
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.getSystemService
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.game.input.LWJGLCharSender
import com.movtery.zalithlauncher.game.support.canal_movil.CanalMovil
import com.movtery.zalithlauncher.game.support.canal_movil.EdicionTexto
import com.movtery.zalithlauncher.game.support.canal_movil.EstadoTexto
import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo
import com.movtery.zalithlauncher.game.support.canal_movil.TextoSincronizado

/**
 * Hidden view whose keyboard edits the real chat text of the game (plan step 8, F), instead of
 * [TouchCharInput]'s padded EditText that only sends characters and Backspace. Autocorrect,
 * predictions, voice typing, cursor moves and copy/paste work because the keyboard sees the text.
 *
 * Only used when DbrCore reported CAP_TEXTO and the chat is open. Main thread only.
 */
@SuppressLint("ViewConstructor")
class TextoDbrView(context: Context) : View(context) {
    val sync = TextoSincronizado()
    private val imm: InputMethodManager? = context.getSystemService()
    private val principal = Handler(Looper.getMainLooper())
    private val envio = Runnable { enviar(forzar = false) }
    private val enter = Runnable { LWJGLCharSender.sendEnter() }
    private var conexion: Conexion? = null

    /**
     * Step 8e: the keyboard leaves almost no room for the Dbr text bar, so let the keyboard show
     * its own full-screen editor (extract UI) with the text. Back to normal when the chat closes.
     */
    var pantallaCompleta = false
        private set

    init {
        isFocusable = true
        isFocusableInTouchMode = true
    }

    override fun onCheckIsTextEditor(): Boolean = true

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
        outAttrs.imeOptions = if (pantallaCompleta) {
            EditorInfo.IME_ACTION_SEND
        } else {
            EditorInfo.IME_FLAG_NO_FULLSCREEN or EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_ACTION_SEND
        }
        val e = sync.estado
        outAttrs.initialSelStart = e.selInicio
        outAttrs.initialSelEnd = e.selFin
        EditorInfoCompat.setInitialSurroundingText(outAttrs, e.texto)
        return Conexion().also { conexion = it }
    }

    /** A chat state from the game. */
    fun aplicarJuego(m: Protocolo.Mensaje.TextoEstado) {
        when (sync.aplicarJuego(m, SystemClock.uptimeMillis())) {
            TextoSincronizado.Resultado.ABIERTO, TextoSincronizado.Resultado.TEXTO -> imm?.restartInput(this)
            TextoSincronizado.Resultado.SELECCION -> conexion?.avisarIme()
            TextoSincronizado.Resultado.CERRADO -> {
                principal.removeCallbacks(envio)
                ponerPantallaCompleta(false)
            }
            TextoSincronizado.Resultado.IGNORAR -> Unit
        }
        publicar()
    }

    /** Switches the keyboard between its normal and its full-screen editor (step 8e). */
    fun ponerPantallaCompleta(activa: Boolean) {
        if (pantallaCompleta == activa) return
        pantallaCompleta = activa
        TextoTeclado.marcarPantallaCompleta(activa)
        if (sync.abierto) imm?.restartInput(this)
    }

    fun cerrar() {
        pantallaCompleta = false
        TextoTeclado.marcarPantallaCompleta(false)
        principal.removeCallbacks(envio)
        conexion = null
        TextoTeclado.soltar(this)
    }

    /** A tap on the Dbr text bar: cursor there, composition finished. */
    fun moverCursor(indice: Int) {
        if (!sync.abierto) return
        val e = sync.estado.sinComposicion()
        editar(EdicionTexto.seleccionar(e, indice, indice))
        conexion?.avisarIme()
    }

    private fun publicar() {
        TextoTeclado.publicar(this, if (sync.abierto) sync.estado else null)
    }

    private fun editar(nuevo: EstadoTexto) {
        if (!sync.editar(nuevo)) return
        publicar()
        programarEnvio()
    }

    private fun programarEnvio() {
        if (conexion?.enLote == true) return
        principal.removeCallbacks(envio)
        val espera = sync.esperaMs(SystemClock.uptimeMillis())
        if (espera == 0L) enviar(forzar = false) else if (espera > 0) principal.postDelayed(envio, espera)
    }

    private fun enviar(forzar: Boolean) {
        val datos = sync.paraEnviar(SystemClock.uptimeMillis(), forzar) ?: return
        CanalMovil.enviarTexto(datos)
    }

    /**
     * Enter goes as a key, like before; the keyboard never sends the chat by itself. The last edit
     * leaves first, and the key waits two game ticks so DbrCore applies the text before the Enter.
     */
    private fun pulsarEnter() {
        principal.removeCallbacks(envio)
        principal.removeCallbacks(enter)
        enviar(forzar = true)
        if (sync.enviadoHaceMenosDe(SystemClock.uptimeMillis(), ESPERA_ENTER_MS)) {
            principal.postDelayed(enter, ESPERA_ENTER_MS)
        } else {
            LWJGLCharSender.sendEnter()
        }
    }

    private inner class Conexion : InputConnection {
        private var lote = 0
        private var tokenExtraido = -1
        private val portapapeles: ClipboardManager? by lazy { context.getSystemService() }

        val enLote: Boolean get() = lote > 0

        private val estado: EstadoTexto get() = sync.estado

        private fun cambiar(nuevo: EstadoTexto): Boolean {
            editar(nuevo)
            if (lote == 0) avisarIme()
            return true
        }

        /** Tells the keyboard where the selection and composition are now. */
        fun avisarIme() {
            val e = estado
            imm?.updateSelection(
                this@TextoDbrView, e.selInicio, e.selFin,
                if (e.hayComposicion) e.compInicio else -1, if (e.hayComposicion) e.compFin else -1,
            )
            if (tokenExtraido >= 0) imm?.updateExtractedText(this@TextoDbrView, tokenExtraido, extraido())
        }

        private fun extraido() = ExtractedText().apply {
            val e = estado
            text = e.texto
            selectionStart = e.selInicio
            selectionEnd = e.selFin
            startOffset = 0
            partialStartOffset = -1
            partialEndOffset = -1
        }

        override fun beginBatchEdit(): Boolean {
            lote++
            return true
        }

        override fun endBatchEdit(): Boolean {
            if (lote > 0) lote--
            if (lote == 0) {
                avisarIme()
                programarEnvio()
            }
            return lote > 0
        }

        override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
            val saltos = text.count { it == '\n' }
            val limpio = text.filter { it != '\n' }
            if (limpio.isNotEmpty() || estado.hayComposicion) {
                cambiar(EdicionTexto.confirmar(estado, limpio, newCursorPosition))
            }
            if (saltos > 0) pulsarEnter()
            return true
        }

        override fun setComposingText(text: CharSequence, newCursorPosition: Int): Boolean =
            cambiar(EdicionTexto.componer(estado, text, newCursorPosition))

        override fun setComposingRegion(start: Int, end: Int): Boolean =
            cambiar(EdicionTexto.regionComposicion(estado, start, end))

        override fun finishComposingText(): Boolean = cambiar(EdicionTexto.terminarComposicion(estado))

        override fun setSelection(start: Int, end: Int): Boolean =
            cambiar(EdicionTexto.seleccionar(estado, start, end))

        override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean =
            cambiar(EdicionTexto.borrarAlrededor(estado, beforeLength, afterLength))

        override fun deleteSurroundingTextInCodePoints(beforeLength: Int, afterLength: Int): Boolean =
            deleteSurroundingText(beforeLength, afterLength) // the chat holds no surrogate pairs

        override fun getTextBeforeCursor(n: Int, flags: Int): CharSequence {
            val e = estado
            return e.texto.substring((e.selInicio - n.coerceAtLeast(0)).coerceAtLeast(0), e.selInicio)
        }

        override fun getTextAfterCursor(n: Int, flags: Int): CharSequence {
            val e = estado
            return e.texto.substring(e.selFin, (e.selFin + n.coerceAtLeast(0)).coerceAtMost(e.texto.length))
        }

        override fun getSelectedText(flags: Int): CharSequence? = estado.seleccion.ifEmpty { null }

        override fun getCursorCapsMode(reqModes: Int): Int = TextUtils.getCapsMode(estado.texto, estado.selInicio, reqModes)

        override fun getExtractedText(request: ExtractedTextRequest?, flags: Int): ExtractedText {
            if (request != null && (flags and InputConnection.GET_EXTRACTED_TEXT_MONITOR) != 0) {
                tokenExtraido = request.token
            }
            return extraido()
        }

        override fun performContextMenuAction(id: Int): Boolean {
            val e = estado
            when (id) {
                android.R.id.selectAll -> cambiar(EdicionTexto.seleccionarTodo(e))
                android.R.id.copy -> if (e.selInicio != e.selFin) copiar(e.seleccion)
                android.R.id.cut -> if (e.selInicio != e.selFin) {
                    copiar(e.seleccion)
                    cambiar(EdicionTexto.borrarSeleccion(e))
                }
                android.R.id.paste, android.R.id.pasteAsPlainText -> {
                    val texto = portapapeles?.primaryClip?.takeIf { it.itemCount > 0 }
                        ?.getItemAt(0)?.coerceToText(context)?.toString()
                    if (!texto.isNullOrEmpty()) cambiar(EdicionTexto.confirmar(e, texto.replace('\n', ' '), 1))
                }
                else -> return false
            }
            return true
        }

        private fun copiar(texto: String) {
            portapapeles?.setPrimaryClip(ClipData.newPlainText(null, texto))
        }

        override fun performEditorAction(editorAction: Int): Boolean {
            pulsarEnter()
            return true
        }

        override fun sendKeyEvent(event: KeyEvent): Boolean {
            val abajo = event.action == KeyEvent.ACTION_DOWN
            when (event.keyCode) {
                KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> if (abajo) pulsarEnter()
                KeyEvent.KEYCODE_DEL -> if (abajo) cambiar(EdicionTexto.retroceso(estado))
                KeyEvent.KEYCODE_FORWARD_DEL -> if (abajo) cambiar(EdicionTexto.suprimir(estado))
                KeyEvent.KEYCODE_DPAD_LEFT -> if (abajo) cambiar(EdicionTexto.mover(estado, -1, event.isShiftPressed))
                KeyEvent.KEYCODE_DPAD_RIGHT -> if (abajo) cambiar(EdicionTexto.mover(estado, 1, event.isShiftPressed))
                KeyEvent.KEYCODE_MOVE_HOME -> if (abajo) cambiar(EdicionTexto.seleccionar(estado, 0, 0))
                KeyEvent.KEYCODE_MOVE_END -> if (abajo) estado.texto.length.let { cambiar(EdicionTexto.seleccionar(estado, it, it)) }
                // Tab, history arrows, Esc: the game handles them and sends its new text back.
                KeyEvent.KEYCODE_TAB, KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_ESCAPE -> LWJGLCharSender.sendOther(event)
                else -> {
                    val c = event.unicodeChar
                    if (c != 0 && !Character.isISOControl(c)) {
                        if (abajo) cambiar(EdicionTexto.confirmar(estado, String(Character.toChars(c)), 1))
                    } else {
                        LWJGLCharSender.sendOther(event)
                    }
                }
            }
            return true
        }

        override fun clearMetaKeyStates(states: Int): Boolean = true
        override fun closeConnection() {
            lote = 0
        }
        override fun commitCompletion(text: CompletionInfo?): Boolean = false
        override fun commitCorrection(correctionInfo: CorrectionInfo?): Boolean = true
        override fun commitContent(inputContentInfo: InputContentInfo, flags: Int, opts: Bundle?): Boolean = false
        override fun performPrivateCommand(action: String?, data: Bundle?): Boolean = false
        override fun reportFullscreenMode(enabled: Boolean): Boolean = true
        override fun requestCursorUpdates(cursorUpdateMode: Int): Boolean = false
        override fun getHandler(): Handler? = null
    }

    companion object {
        /** Two game ticks plus margin: DbrCore reads the channel at the end of each tick. */
        private const val ESPERA_ENTER_MS = 120L
    }
}

/**
 * Keyboard layer for the synced chat text. Same lifecycle as [HidableInputLayout]: shown while
 * textInputMode is ENABLE, closes when the keyboard goes away.
 */
@Composable
fun DbrTextInputLayout(
    onClose: () -> Unit,
    keyboardController: SoftwareKeyboardController? = LocalSoftwareKeyboardController.current,
    inputFocus: FocusRequester = remember { FocusRequester() },
) {
    var view by remember { mutableStateOf<TextoDbrView?>(null) }

    AndroidView(
        modifier = Modifier
            .alpha(0f)
            .size(1.dp)
            .focusRequester(inputFocus),
        factory = { context -> TextoDbrView(context).also { view = it } },
    )

    val texto by CanalMovil.texto.collectAsStateWithLifecycle()
    LaunchedEffect(view, texto) {
        val v = view ?: return@LaunchedEffect
        texto?.let { v.aplicarJuego(it) }
    }

    LaunchedEffect(view) {
        val v = view ?: return@LaunchedEffect
        inputFocus.requestFocus()
        v.requestFocus()
        keyboardController?.show()
        v.context.getSystemService<InputMethodManager>()?.showSoftInput(v, 0)
    }

    DisposableEffect(Unit) {
        onDispose {
            keyboardController?.hide()
            view?.cerrar()
            view = null
        }
    }

    OnKeyboardClosed {
        keyboardController?.hide()
        onClose()
    }
}

/**
 * What the synced keyboard is editing, for the Dbr text bar over the keyboard (step 8d). Null when
 * there is no synced chat (old DbrCore, setting off, chat closed). Main thread only.
 */
object TextoTeclado {
    private val _estado = kotlinx.coroutines.flow.MutableStateFlow<EstadoTexto?>(null)
    val estado: kotlinx.coroutines.flow.StateFlow<EstadoTexto?> = _estado

    private var vista: java.lang.ref.WeakReference<TextoDbrView>? = null

    internal fun publicar(v: TextoDbrView, e: EstadoTexto?) {
        vista = java.lang.ref.WeakReference(v)
        _estado.value = e
    }

    internal fun soltar(v: TextoDbrView) {
        if (vista?.get() === v) {
            vista = null
            _estado.value = null
        }
    }

    fun moverCursor(indice: Int) {
        vista?.get()?.moverCursor(indice)
    }

    private val _pantallaCompleta = kotlinx.coroutines.flow.MutableStateFlow(false)
    /** True while the keyboard was asked to show its own full-screen editor (step 8e). */
    val pantallaCompleta: kotlinx.coroutines.flow.StateFlow<Boolean> = _pantallaCompleta

    internal fun marcarPantallaCompleta(activa: Boolean) {
        _pantallaCompleta.value = activa
    }

    /** Asks the active synced view to switch the keyboard to (or from) its full-screen editor. */
    fun pedirPantallaCompleta(activa: Boolean) {
        vista?.get()?.ponerPantallaCompleta(activa)
    }
}
