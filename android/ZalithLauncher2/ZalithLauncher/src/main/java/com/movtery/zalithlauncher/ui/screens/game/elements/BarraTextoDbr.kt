package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.DistribucionTeclado
import com.movtery.zalithlauncher.game.support.canal_movil.EstadoTexto
import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo
import com.movtery.zalithlauncher.ui.control.input.TextoTeclado
import kotlinx.coroutines.delay

private val CAMPO = Color(0xFF0F0C18)
private val SELECCION = Color(0xFF2A6FD0)
private val AYUDA = Color(0xFF8D92AE)
private val AVISO = Color(0xFFFFB454)

/**
 * Strip over the keyboard while the synced chat is open (step 8d): the Dbr text bar and the chip
 * row, in one shared row or two rows depending on the room left by the keyboard. Without synced
 * text ([texto] null) only the chip row, as before.
 */
@Composable
fun FranjaTecladoDbr(
    franja: DistribucionTeclado.Franja,
    texto: EstadoTexto?,
    mostrarChips: Boolean,
    frases: List<String>,
    onEditar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val altoFila = DistribucionTeclado.ALTO_UNA_FILA_DP.dp
    when {
        texto == null -> if (mostrarChips) FilaChipsDbr(frases, onEditar, modifier)
        // Step 8e: the keyboard shows the text in its own full-screen editor.
        franja.modo == DistribucionTeclado.Modo.PANTALLA_COMPLETA -> Unit
        // Step 8e: very tall keyboard, only the bar, as tall as the room left.
        !franja.conChips -> BarraTextoDbr(
            texto,
            modifier.fillMaxWidth().height(franja.altoDp.dp),
            compacta = true,
        )
        franja.dosFilas -> Column(modifier.fillMaxWidth()) {
            FilaChipsDbr(frases, onEditar)
            BarraTextoDbr(texto, Modifier.fillMaxWidth().height(altoFila))
        }
        else -> Row(modifier.fillMaxWidth().height(altoFila).background(FONDO)) {
            BarraTextoDbr(texto, Modifier.weight(if (mostrarChips) 0.5f else 1f).fillMaxHeight())
            if (mostrarChips) FilaChipsDbr(frases, onEditar, Modifier.weight(0.5f), alto = altoFila)
        }
    }
}

/**
 * The chat line the phone keyboard is editing: text, blinking cursor, selection and the word still
 * being composed (underlined, like in the game). A tap moves the cursor there.
 */
@Composable
fun BarraTextoDbr(estado: EstadoTexto, modifier: Modifier = Modifier, compacta: Boolean = false) {
    val letra = if (compacta) 12.sp else 15.sp
    val scroll = rememberScrollState()
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    var ancho by remember { mutableIntStateOf(0) }
    var cursorVisible by remember { mutableStateOf(true) }
    val margen = with(LocalDensity.current) { 12.dp.roundToPx() }

    // Blink, restarting on every change so the cursor shows while typing.
    LaunchedEffect(estado) {
        cursorVisible = true
        while (true) {
            delay(530)
            cursorVisible = !cursorVisible
        }
    }

    // Keep the cursor inside the visible part of the bar.
    LaunchedEffect(estado.selFin, layout, ancho) {
        val l = layout ?: return@LaunchedEffect
        if (ancho <= 0) return@LaunchedEffect
        val x = l.getCursorRect(estado.selFin.coerceIn(0, estado.texto.length)).left.toInt()
        val destino = when {
            x < scroll.value + margen -> x - margen
            x > scroll.value + ancho - margen -> x - ancho + margen
            else -> return@LaunchedEffect
        }
        scroll.scrollTo(destino.coerceIn(0, scroll.maxValue))
    }

    val anotado = remember(estado) {
        buildAnnotatedString {
            append(estado.texto)
            if (estado.selInicio < estado.selFin) {
                addStyle(SpanStyle(background = SELECCION), estado.selInicio, estado.selFin)
            }
            if (estado.hayComposicion) {
                addStyle(SpanStyle(textDecoration = TextDecoration.Underline), estado.compInicio, estado.compFin)
            }
        }
    }

    Box(modifier.background(FONDO).padding(horizontal = 6.dp, vertical = if (compacta) 2.dp else 5.dp)) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(CAMPO, RoundedCornerShape(8.dp))
                .border(1.dp, BORDE, RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .onSizeChanged { ancho = it.width },
                contentAlignment = Alignment.CenterStart,
            ) {
                if (estado.texto.isEmpty()) {
                    Text(stringResource(R.string.dbr_barra_vacia), color = AYUDA, fontSize = letra, maxLines = 1)
                }
                Text(
                    text = anotado,
                    color = Color.White,
                    fontSize = letra,
                    maxLines = 1,
                    softWrap = false,
                    onTextLayout = { layout = it },
                    modifier = Modifier
                        .horizontalScroll(scroll)
                        .pointerInput(Unit) {
                            detectTapGestures { pos ->
                                layout?.let { TextoTeclado.moverCursor(it.getOffsetForPosition(pos)) }
                            }
                        }
                        .drawWithContent {
                            drawContent()
                            val l = layout ?: return@drawWithContent
                            if (!cursorVisible || estado.selInicio != estado.selFin) return@drawWithContent
                            val r = l.getCursorRect(estado.selFin.coerceIn(0, estado.texto.length))
                            drawLine(
                                color = Color.White,
                                start = Offset(r.left + 1f, r.top),
                                end = Offset(r.left + 1f, r.bottom),
                                strokeWidth = 2.dp.toPx(),
                            )
                        },
                )
            }
            if (estado.texto.length >= if (compacta) AVISO_LARGO_COMPACTA else AVISO_LARGO) {
                Text(
                    "${estado.texto.length}/${Protocolo.MAX_TEXTO}",
                    color = AVISO,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}

/** The length counter shows from here on. */
private const val AVISO_LARGO = 90

/** In the compact bar there is less room: the counter shows later. */
private const val AVISO_LARGO_COMPACTA = 95
