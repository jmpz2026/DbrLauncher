package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.AvisosSistema
import com.movtery.zalithlauncher.game.support.canal_movil.VibradorDbr
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.unit.BooleanSettingUnit
import com.movtery.zalithlauncher.ui.components.MenuSliderLayout
import com.movtery.zalithlauncher.ui.components.MenuSwitchButton
import com.movtery.zalithlauncher.ui.components.lazyScrollWithBar
import com.movtery.zalithlauncher.ui.theme.cardColor
import com.movtery.zalithlauncher.ui.theme.onCardColor

/**
 * DBR tab of the in-game menu (plan block K): vibration, heat and battery warnings, reduced
 * mode, chips and wider touch zones, without leaving the game.
 */
@Composable
fun ControlDbr(
    modifier: Modifier = Modifier,
    onRefreshWindowSize: () -> Unit,
    color: Color = cardColor(false),
    contentColor: Color = onCardColor(),
) {
    val reducido by AvisosSistema.reducido.collectAsStateWithLifecycle()
    val vibra = AllSettings.dbrVibracion.state
    val notif = AllSettings.dbrNotif.state
    val listState = rememberLazyListState()

    @Composable
    fun interruptor(unidad: BooleanSettingUnit, texto: Int, enabled: Boolean = true, alCambiar: () -> Unit = {}) {
        MenuSwitchButton(
            modifier = Modifier.fillMaxWidth(),
            text = stringResource(texto),
            switch = unidad.state,
            onSwitch = {
                unidad.save(it)
                alCambiar()
            },
            enabled = enabled,
            color = color,
            contentColor = contentColor,
        )
    }

    LazyColumn(
        modifier = modifier.lazyScrollWithBar(listState),
        state = listState,
        contentPadding = PaddingValues(all = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item { interruptor(AllSettings.dbrVibracion, R.string.dbr_vibracion_title) }
        item {
            val unidad = AllSettings.dbrVibracionIntensidad
            MenuSliderLayout(
                modifier = Modifier.fillMaxWidth(),
                title = stringResource(R.string.dbr_vibracion_intensidad),
                value = unidad.state,
                valueRange = 0f..100f,
                onValueChange = { unidad.updateState(it) },
                onValueChangeFinished = {
                    unidad.save(it)
                    VibradorDbr.probar("combate.dano")
                },
                suffix = "%",
                enabled = vibra,
                color = color,
                contentColor = contentColor,
            )
        }
        item { interruptor(AllSettings.dbrVibracionCombate, R.string.dbr_vibracion_combate, vibra) }
        item { interruptor(AllSettings.dbrVibracionKi, R.string.dbr_vibracion_ki, vibra) }
        item { interruptor(AllSettings.dbrVibracionMundo, R.string.dbr_vibracion_mundo, vibra) }
        item { interruptor(AllSettings.dbrVibracionAvisos, R.string.dbr_vibracion_avisos, vibra) }
        item { interruptor(AllSettings.dbrAvisoCalor, R.string.dbr_menu_aviso_calor) }
        item { interruptor(AllSettings.dbrAvisoBateria, R.string.dbr_menu_aviso_bateria) }
        item {
            MenuSwitchButton(
                modifier = Modifier.fillMaxWidth(),
                text = stringResource(R.string.dbr_menu_reducido),
                switch = reducido,
                onSwitch = { if (it != reducido) AvisosSistema.alternarReducido() },
                color = color,
                contentColor = contentColor,
            )
        }
        item { interruptor(AllSettings.dbrChips, R.string.dbr_menu_chips) }
        item { interruptor(AllSettings.dbrTextoSync, R.string.dbr_menu_texto_sync) }
        // PANTALLA carries the flag: refreshing the window size measures and sends it again.
        item { interruptor(AllSettings.dbrToqueAmpliado, R.string.dbr_menu_toque, alCambiar = onRefreshWindowSize) }
        item { interruptor(AllSettings.dbrNotif, R.string.dbr_menu_notif) }
        item { interruptor(AllSettings.dbrNotifPrivado, R.string.dbr_notif_canal_privado, notif) }
        item { interruptor(AllSettings.dbrNotifEventos, R.string.dbr_notif_canal_eventos, notif) }
        item { interruptor(AllSettings.dbrNotifPeligro, R.string.dbr_notif_canal_peligro, notif) }
        item { interruptor(AllSettings.dbrNotifConexion, R.string.dbr_notif_canal_conexion, notif) }
    }
}
