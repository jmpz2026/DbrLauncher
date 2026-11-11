package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.AvisosSistema
import com.movtery.zalithlauncher.game.support.canal_movil.AvisosSistema.Aviso
import kotlinx.coroutines.delay

/** Shown time of a warning, in ms. Heat warnings stay longer: they carry a button. */
private const val DURACION_MS = 6_000L
private const val DURACION_BOTON_MS = 10_000L

/**
 * Heat and battery banner over the game (plan block H). Only the "Reduce"/"Restore" button
 * changes anything; if the player ignores it, it fades out.
 */
@Composable
fun AvisoSistemaDbr(modifier: Modifier = Modifier) {
    val aviso by AvisosSistema.aviso.collectAsStateWithLifecycle()
    val reducido by AvisosSistema.reducido.collectAsStateWithLifecycle()
    // Keep the last warning while fading out.
    var ultimo by remember { mutableStateOf<Aviso?>(null) }
    if (aviso != null && aviso != ultimo) ultimo = aviso

    LaunchedEffect(aviso) {
        val actual = aviso ?: return@LaunchedEffect
        delay(if (actual is Aviso.Bateria) DURACION_MS else DURACION_BOTON_MS)
        AvisosSistema.descartar()
    }

    AnimatedVisibility(
        visible = aviso != null,
        modifier = modifier,
        enter = fadeIn(),
        exit = fadeOut()
    ) {
        val texto = when (val a = ultimo) {
            Aviso.Calor -> stringResource(R.string.dbr_aviso_calor)
            Aviso.Fresco -> stringResource(R.string.dbr_aviso_fresco)
            is Aviso.Bateria -> stringResource(R.string.dbr_aviso_bateria, a.porcentaje)
            null -> ""
        }
        Row(
            modifier = Modifier
                .padding(top = 8.dp)
                .widthIn(max = 480.dp)
                .background(Color(0xE0101018), RoundedCornerShape(8.dp))
                .padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = texto,
                color = Color.White,
                fontSize = 14.sp,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .padding(vertical = 8.dp)
            )
            if (ultimo == Aviso.Calor || ultimo == Aviso.Fresco) {
                TextButton(onClick = { AvisosSistema.alternarReducido() }) {
                    Text(
                        text = stringResource(if (reducido) R.string.dbr_aviso_restaurar else R.string.dbr_aviso_reducir),
                        color = Color(0xFFB79CFF),
                        fontSize = 14.sp
                    )
                }
            }
            TextButton(onClick = { AvisosSistema.descartar() }) {
                Text(text = "✕", color = Color(0xFFBBBBBB), fontSize = 14.sp)
            }
        }
    }
}
