/*
 * DbrLauncherMobile — secciones DBR de Ajustes (modpack en Rendimiento, soporte en Ayuda).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.ui.screens.content.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.coroutine.Task
import com.movtery.zalithlauncher.coroutine.TaskSystem
import com.movtery.zalithlauncher.game.dbr.DbrExperimental
import com.movtery.zalithlauncher.game.dbr.DbrReport
import com.movtery.zalithlauncher.path.PathManager
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant
import com.movtery.zalithlauncher.ui.androidText
import com.movtery.zalithlauncher.ui.components.SimpleAlertDialog
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.CardPosition
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.EnumSettingsCard
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SettingsCard
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SettingsCardColumn
import com.movtery.zalithlauncher.ui.screens.content.settings.layouts.SwitchSettingsCard
import com.movtery.zalithlauncher.utils.file.shareFile
import com.movtery.zalithlauncher.utils.logging.Logger
import com.movtery.zalithlauncher.viewmodel.EventViewModel
import java.io.File

private const val TAG = "DbrSettingsSections"

/** URL de invitación al Discord de DBR (la misma de la barra inferior). */
const val DBR_DISCORD_URL = "https://discord.gg/HaQh38sFbD"

/**
 * Calidad del modpack (Completo/Ligero/Experimental) y pantalla completa del launcher.
 * Al cambiar de variante se ofrece aplicar su configuración recomendada; la experimental
 * exige confirmar antes que no es para el servidor.
 */
@Composable
fun DbrModpackSection(modifier: Modifier = Modifier) {
    var askSeed by remember { mutableStateOf(false) }
    var askExperimental by remember { mutableStateOf(false) }

    if (askSeed) {
        SimpleAlertDialog(
            title = stringResource(R.string.dbr_modpack_seed_title),
            text = stringResource(R.string.dbr_modpack_seed_text),
            confirmText = stringResource(R.string.dbr_modpack_seed_apply),
            dismissText = stringResource(R.string.dbr_modpack_seed_keep),
            onConfirm = {
                AllSettings.dbrModpackSeedPending.save(true)
                askSeed = false
            },
            onDismiss = { askSeed = false }
        )
    }

    if (askExperimental) {
        DbrExperimentalDialog(
            onConfirm = {
                DbrExperimental.enable()
                askExperimental = false
                askSeed = true
            },
            onDismiss = { askExperimental = false }
        )
    }

    SettingsCardColumn(modifier = modifier) {
        EnumSettingsCard(
            modifier = Modifier.fillMaxWidth(),
            position = CardPosition.Top,
            value = AllSettings.dbrModpackVariant.state,
            entries = DbrModpackVariant.entries,
            title = stringResource(R.string.dbr_modpack_variant_title),
            summary = stringResource(R.string.dbr_modpack_variant_summary),
            getRadioEnable = { true },
            getRadioText = { variant -> stringResource(variant.textRes) },
            onRadioClick = { variant ->
                val current = AllSettings.dbrModpackVariant.state
                if (variant == DbrModpackVariant.EXPERIMENTAL) {
                    if (current != variant) askExperimental = true
                } else if (variant != current) {
                    if (current == DbrModpackVariant.EXPERIMENTAL) DbrExperimental.onLeave()
                    AllSettings.dbrModpackVariant.save(variant)
                    //La variante cambió: hay que re-sincronizar sí o sí.
                    AllSettings.dbrModpackSyncPending.save(true)
                    askSeed = true
                }
            }
        )

        SwitchSettingsCard(
            modifier = Modifier.fillMaxWidth(),
            position = CardPosition.Bottom,
            unit = AllSettings.launcherFullScreen,
            title = stringResource(R.string.settings_launcher_full_screen_title),
            summary = stringResource(R.string.settings_launcher_full_screen_summary)
        )
    }
}

/** "Reportar problema" (zip con todos los logs) y Discord, arriba de la pestaña Ayuda. */
@Composable
fun DbrHelpSection(
    eventViewModel: EventViewModel,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    SettingsCardColumn(modifier = modifier) {
        SettingsCard(
            modifier = Modifier.fillMaxWidth(),
            position = CardPosition.Top,
            title = stringResource(R.string.dbr_report_title),
            summary = stringResource(R.string.dbr_report_summary),
            onClick = {
                TaskSystem.submitTask(
                    Task.runTask(
                        id = "Dbr.Report",
                        task = { task ->
                            task.updateProgress(-1f)
                            task.updateMessage(androidText(R.string.dbr_report_packing))
                            val zip = File(PathManager.DIR_CACHE, "dbr-reporte.zip")
                            DbrReport.build(zip)
                            task.updateProgress(1f)
                            task.updateMessage(null)
                            shareFile(context = context, file = zip)
                        },
                        onError = { e ->
                            Logger.error(TAG, "Failed to build the problem report.", e)
                        }
                    )
                )
            }
        )

        SettingsCard(
            modifier = Modifier.fillMaxWidth(),
            position = CardPosition.Bottom,
            title = stringResource(R.string.dbr_discord_title),
            summary = stringResource(R.string.dbr_discord_summary),
            onClick = {
                eventViewModel.sendEvent(EventViewModel.Event.OpenLink(DBR_DISCORD_URL))
            }
        )
    }
}

/** DBR: aviso del modpack experimental; "Activar" solo se habilita tras marcar la casilla. */
@Composable
private fun DbrExperimentalDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    var understood by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = stringResource(R.string.dbr_modpack_experimental_title),
                style = MaterialTheme.typography.titleLarge
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(text = stringResource(R.string.dbr_modpack_experimental_text))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { understood = !understood },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = understood, onCheckedChange = { understood = it })
                    Text(
                        text = stringResource(R.string.dbr_modpack_experimental_check),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = onConfirm, enabled = understood) {
                Text(text = stringResource(R.string.dbr_modpack_experimental_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(R.string.generic_cancel))
            }
        }
    )
}
