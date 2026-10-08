/*
 * Zalith Launcher 2
 * Copyright (C) 2025 MovTery <movtery228@qq.com> and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/gpl-3.0.txt>.
 */

package com.movtery.zalithlauncher.ui.screens.content.settings

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.bridge.CursorShape
import com.movtery.zalithlauncher.context.copyLocalFile
import com.movtery.zalithlauncher.contract.MediaPickerContract
import com.movtery.zalithlauncher.coroutine.Task
import com.movtery.zalithlauncher.coroutine.TaskSystem
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.GestureActionType
import com.movtery.zalithlauncher.setting.enums.MouseControlMode
import com.movtery.zalithlauncher.setting.unit.ParcelableSettingUnit
import com.movtery.zalithlauncher.setting.unit.floatRange
import com.movtery.zalithlauncher.ui.androidText
import com.movtery.zalithlauncher.ui.base.BaseScreen
import com.movtery.zalithlauncher.ui.components.AnimatedLazyColumn
import com.movtery.zalithlauncher.ui.components.IconTextButton
import com.movtery.zalithlauncher.ui.components.LittleTextLabel
import com.movtery.zalithlauncher.ui.components.MarqueeText
import com.movtery.zalithlauncher.ui.components.SimpleAlertDialog
import com.movtery.zalithlauncher.ui.components.TitleAndSummary
import com.movtery.zalithlauncher.ui.components.TooltipIconButton
import com.movtery.zalithlauncher.ui.components.infiniteShimmer
import com.movtery.zalithlauncher.ui.components.verticalScrollWithBar
import com.movtery.zalithlauncher.ui.control.gyroscope.isGyroscopeAvailable
import com.movtery.zalithlauncher.ui.control.mouse.CursorHotspot
import com.movtery.zalithlauncher.ui.control.mouse.MouseHotspotEditorDialog
import com.movtery.zalithlauncher.ui.control.mouse.MousePointer
import com.movtery.zalithlauncher.ui.control.mouse.arrowPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.crossHairPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.iBeamPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.linkPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.notAllowedPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.resizeAllPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.resizeEWPointerFile
import com.movtery.zalithlauncher.ui.control.mouse.resizeNSPointerFile
import com.movtery.zalithlauncher.ui.screens.NestedNavKey
import com.movtery.zalithlauncher.ui.screens.NormalNavKey
import com.movtery.zalithlauncher.ui.screens.TitledNavKey
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.CardPosition
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.IntSliderSettingsCard
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.ListSettingsCard
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SettingsCard
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SettingsCardColumn
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SwitchSettingsCard
import com.movtery.zalithlauncher.utils.formatKeyCode
import com.movtery.zalithlauncher.utils.image.isImageFile
import com.movtery.zalithlauncher.utils.string.getMessageOrToString
import com.movtery.zalithlauncher.viewmodel.ErrorViewModel
import com.movtery.zalithlauncher.viewmodel.EventViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.withContext
import org.apache.commons.io.FileUtils
import java.io.File

@Composable
fun ControlSettingsScreen(
    key: NestedNavKey.Settings,
    settingsScreenKey: TitledNavKey?,
    mainScreenKey: TitledNavKey?,
    eventViewModel: EventViewModel,
    submitError: (ErrorViewModel.ThrowableMessage) -> Unit,
    navigateTo: (TitledNavKey) -> Unit
) {
    BaseScreen(
        Triple(key, mainScreenKey, false),
        Triple(NormalNavKey.Settings.Control, settingsScreenKey, false)
    ) { isVisible ->
        AnimatedLazyColumn(
            modifier = Modifier.fillMaxSize(),
            isVisible = isVisible,
            contentPadding = PaddingValues(all = 12.dp)
        ) { scope ->
            animatedItem(scope) { yOffset ->
                SettingsCardColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(x = 0, y = yOffset.roundToPx()) }
                ) {
                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Top,
                        unit = AllSettings.physicalMouseMode,
                        title = stringResource(R.string.settings_control_mouse_physical_mouse_mode_title),
                        summary = stringResource(R.string.settings_control_mouse_physical_mouse_mode_summary),
                        trailingIcon = {
                            TooltipIconButton(
                                modifier = Modifier
                                    .align(Alignment.CenterVertically)
                                    .padding(horizontal = 8.dp),
                                tooltipTitle = stringResource(R.string.generic_warning),
                                tooltipMessage = stringResource(R.string.settings_control_mouse_physical_mouse_warning)
                            ) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_warning_filled),
                                    contentDescription = stringResource(R.string.generic_warning),
                                    tint = MaterialTheme.colorScheme.error.copy(alpha = 0.8f)
                                )
                            }
                        }
                    )

                    var operation by remember { mutableStateOf<PhysicalKeyOperation>(PhysicalKeyOperation.None) }
                    SettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Bottom,
                        onClick = { operation = PhysicalKeyOperation.Bind }
                    ) {
                        PhysicalKeyImeTrigger(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(all = 16.dp),
                            operation = operation,
                            changeOperation = { operation = it },
                            eventViewModel = eventViewModel
                        )
                    }
                }
            }

            //DBR: solo lo básico. Sensibilidades, tamaño del cursor, gestos finos y giroscopio fino
            //se ajustan desde el menú del juego; las imágenes de puntero ya no se cambian.
            animatedItem(scope) { yOffset ->
                SettingsCardColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(x = 0, y = yOffset.roundToPx()) }
                ) {
                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Top,
                        unit = AllSettings.hideMouse,
                        title = stringResource(R.string.settings_control_mouse_hide_title),
                        summary = stringResource(R.string.settings_control_mouse_hide_summary),
                        enabled = AllSettings.mouseControlMode.state == MouseControlMode.CLICK
                    )

                    SwitchSettingsCard(
                        unit = AllSettings.enableMouseClick,
                        position = CardPosition.Middle,
                        title = stringResource(R.string.settings_control_mouse_enable_click_title),
                        summary = stringResource(R.string.settings_control_mouse_enable_click_summary),
                        enabled = AllSettings.mouseControlMode.state == MouseControlMode.SLIDE
                    )

                    ListSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Middle,
                        unit = AllSettings.mouseControlMode,
                        items = MouseControlMode.entries,
                        title = stringResource(R.string.settings_control_mouse_control_mode_title),
                        summary = stringResource(R.string.settings_control_mouse_control_mode_summary),
                        getItemText = { stringResource(it.nameRes) }
                    )

                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Bottom,
                        unit = AllSettings.gestureControl,
                        title = stringResource(R.string.settings_control_gesture_control_title),
                        summary = stringResource(R.string.settings_control_gesture_control_summary)
                    )
                }
            }

            animatedItem(scope) { yOffset ->
                SettingsCardColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(x = 0, y = yOffset.roundToPx()) }
                ) {
                    val context = LocalContext.current
                    val isGyroscopeAvailable = remember(context) {
                        isGyroscopeAvailable(context = context)
                    }

                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Top,
                        unit = AllSettings.gyroscopeControl,
                        title = stringResource(R.string.settings_control_gyroscope_title),
                        summary = stringResource(R.string.settings_control_gyroscope_summary),
                        enabled = isGyroscopeAvailable,
                        trailingIcon = if (!isGyroscopeAvailable) {
                            @Composable {
                                TooltipIconButton(
                                    modifier = Modifier
                                        .align(Alignment.CenterVertically)
                                        .padding(horizontal = 8.dp),
                                    tooltipTitle = stringResource(R.string.generic_warning),
                                    tooltipMessage = stringResource(R.string.settings_control_gyroscope_unsupported)
                                ) {
                                    Icon(
                                        painter = painterResource(R.drawable.ic_warning_filled),
                                        contentDescription = stringResource(R.string.generic_warning),
                                        tint = MaterialTheme.colorScheme.error.copy(alpha = 0.8f)
                                    )
                                }
                            }
                        } else null
                    )

                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Middle,
                        unit = AllSettings.gyroscopeInvertX,
                        title = stringResource(R.string.settings_control_gyroscope_invert_x_title),
                        summary = stringResource(R.string.settings_control_gyroscope_invert_x_summary),
                        enabled = isGyroscopeAvailable && AllSettings.gyroscopeControl.state
                    )

                    SwitchSettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Bottom,
                        unit = AllSettings.gyroscopeInvertY,
                        title = stringResource(R.string.settings_control_gyroscope_invert_y_title),
                        summary = stringResource(R.string.settings_control_gyroscope_invert_y_summary),
                        enabled = isGyroscopeAvailable && AllSettings.gyroscopeControl.state
                    )
                }
            }

            //DBR: Gamepad y gestión de layouts ya no son pestañas propias.
            animatedItem(scope) { yOffset ->
                SettingsCardColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .offset { IntOffset(x = 0, y = yOffset.roundToPx()) }
                ) {
                    SettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Top,
                        title = stringResource(R.string.settings_tab_control_manage),
                        summary = stringResource(R.string.dbr_control_manage_summary),
                        onClick = { navigateTo(NormalNavKey.Settings.ControlManager) }
                    )

                    SettingsCard(
                        modifier = Modifier.fillMaxWidth(),
                        position = CardPosition.Bottom,
                        title = stringResource(R.string.settings_tab_gamepad),
                        summary = stringResource(R.string.dbr_gamepad_summary),
                        onClick = { navigateTo(NormalNavKey.Settings.Gamepad) }
                    )
                }
            }
        }
    }
}

private sealed interface PhysicalKeyOperation {
    data object None: PhysicalKeyOperation
    data object Bind: PhysicalKeyOperation
}

@Composable
private fun PhysicalKeyImeTrigger(
    modifier: Modifier = Modifier,
    operation: PhysicalKeyOperation,
    changeOperation: (PhysicalKeyOperation) -> Unit,
    eventViewModel: EventViewModel
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .animateContentSize()
        ) {
            TitleAndSummary(
                title = stringResource(R.string.settings_control_physical_key_bind_ime_title),
                summary = stringResource(R.string.settings_control_physical_key_bind_ime_summary)
            )
            when (operation) {
                PhysicalKeyOperation.None -> {}
                PhysicalKeyOperation.Bind -> {
                    LaunchedEffect(Unit) {
                        eventViewModel.sendEvent(EventViewModel.Event.Key.StartKeyCapture)
                        //接收Activity发送的按键事件
                        eventViewModel.events
                            .filterIsInstance<EventViewModel.Event.Key.OnKeyDown>()
                            .collect { event ->
                                changeOperation(PhysicalKeyOperation.None)
                                AllSettings.physicalKeyImeCode.save(event.key.keyCode)
                            }
                    }

                    DisposableEffect(Unit) {
                        onDispose {
                            eventViewModel.sendEvent(EventViewModel.Event.Key.StopKeyCapture)
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        LittleTextLabel(text = stringResource(R.string.control_keyboard_bind_title))
                        MarqueeText(
                            modifier = Modifier
                                .weight(1f)
                                .infiniteShimmer(
                                    initialValue = 0.5f,
                                    targetValue = 1f
                                ),
                            text = stringResource(R.string.control_keyboard_bind_summary),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier.padding(start = 8.dp)
        ) {
            val code = AllSettings.physicalKeyImeCode.state
            when {
                code == null -> {
                    Text(
                        modifier = Modifier.padding(end = 12.dp),
                        text = stringResource(R.string.settings_control_physical_key_bind_ime_un_bind),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                else -> {
                    IconTextButton(
                        onClick = { AllSettings.physicalKeyImeCode.save(null) },
                        painter = painterResource(R.drawable.ic_restart_alt),
                        contentDescription = stringResource(R.string.generic_reset),
                        text = stringResource(
                            R.string.settings_control_physical_key_bind_ime_bound,
                            formatKeyCode(code)
                        )
                    )
                }
            }
        }
    }
}
