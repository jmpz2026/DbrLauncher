package com.movtery.zalithlauncher.ui.screens.main.control_editor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.movtery.layer_controller.data.EstadoDbr
import com.movtery.zalithlauncher.R

/** What one game state does to a button or layer. */
private enum class ModoCondicion { NADA, MOSTRAR, OCULTAR }

/**
 * DBR: "Game conditions" section of the control editor. One row per game state with three choices:
 * no effect, show only while it is active, hide while it is active. [onCambio] receives the new
 * show-if and hide-if sets; a state is never in both.
 */
@Composable
fun CondicionesDbrEditor(
    mostrarSi: Set<EstadoDbr>,
    ocultarSi: Set<EstadoDbr>,
    onCambio: (mostrarSi: Set<EstadoDbr>, ocultarSi: Set<EstadoDbr>) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.dbr_condiciones_titulo), style = MaterialTheme.typography.titleSmall)
        Text(stringResource(R.string.dbr_condiciones_ayuda), style = MaterialTheme.typography.bodySmall)
        EstadoDbr.entries.forEach { estado ->
            val actual = when (estado) {
                in mostrarSi -> ModoCondicion.MOSTRAR
                in ocultarSi -> ModoCondicion.OCULTAR
                else -> ModoCondicion.NADA
            }
            InfoLayoutSelectItem(
                modifier = Modifier.fillMaxWidth(),
                title = stringResource(estado.textoRes()),
                options = ModoCondicion.entries,
                current = actual,
                onClick = { modo ->
                    val m = mostrarSi - estado
                    val o = ocultarSi - estado
                    when (modo) {
                        ModoCondicion.NADA -> onCambio(m, o)
                        ModoCondicion.MOSTRAR -> onCambio(m + estado, o)
                        ModoCondicion.OCULTAR -> onCambio(m, o + estado)
                    }
                },
                label = { modo ->
                    Text(
                        stringResource(
                            when (modo) {
                                ModoCondicion.NADA -> R.string.dbr_condicion_nada
                                ModoCondicion.MOSTRAR -> R.string.dbr_condicion_mostrar
                                ModoCondicion.OCULTAR -> R.string.dbr_condicion_ocultar
                            }
                        )
                    )
                },
            )
        }
    }
}

private fun EstadoDbr.textoRes(): Int = when (this) {
    EstadoDbr.CARGANDO_KI -> R.string.dbr_estado_cargando_ki
    EstadoDbr.TRANSFORMANDO -> R.string.dbr_estado_transformando
    EstadoDbr.CHAT -> R.string.dbr_estado_chat
    EstadoDbr.CONTENEDOR -> R.string.dbr_estado_contenedor
    EstadoDbr.PANTALLA_DBR -> R.string.dbr_estado_pantalla_dbr
    EstadoDbr.OTRA_PANTALLA -> R.string.dbr_estado_otra_pantalla
}
