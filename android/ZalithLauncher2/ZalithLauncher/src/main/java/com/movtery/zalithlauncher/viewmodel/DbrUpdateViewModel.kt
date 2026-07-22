/*
 * DbrLauncherMobile — ViewModel + diálogo del auto-updater del launcher.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.viewmodel

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.dbr.DbrUpdater
import kotlinx.coroutines.launch

class DbrUpdateViewModel : ViewModel() {
    var info by mutableStateOf<DbrUpdater.UpdateInfo?>(null)
        private set
    var downloadPercent by mutableStateOf<Int?>(null)
        private set

    fun checkOnStart() {
        viewModelScope.launch {
            info = DbrUpdater.check()
        }
    }

    fun install(context: Context) {
        val i = info ?: return
        if (downloadPercent != null) return
        downloadPercent = 0
        viewModelScope.launch {
            runCatching {
                DbrUpdater.downloadAndInstall(context, i) { p -> downloadPercent = p }
            }
            downloadPercent = null
        }
    }

    fun dismiss() {
        if (info?.mandatory != true) info = null
    }
}

@Composable
fun DbrUpdateDialog(viewModel: DbrUpdateViewModel) {
    val context = LocalContext.current
    val info = viewModel.info ?: return
    val percent = viewModel.downloadPercent

    Dialog(
        onDismissRequest = { if (!info.mandatory && percent == null) viewModel.dismiss() }
    ) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(all = 24.dp)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.dbr_update_title),
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = info.versionName,
                    style = MaterialTheme.typography.labelLarge
                )
                if (info.changelog.isNotEmpty()) {
                    Text(
                        text = info.changelog,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                if (percent != null) {
                    Text(
                        text = "${stringResource(R.string.dbr_update_downloading)} $percent%",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    LinearProgressIndicator(
                        progress = { percent / 100f },
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        if (!info.mandatory) {
                            TextButton(onClick = { viewModel.dismiss() }) {
                                Text(stringResource(R.string.dbr_update_later))
                            }
                        }
                        Button(onClick = { viewModel.install(context) }) {
                            Text(stringResource(R.string.dbr_update_update))
                        }
                    }
                }
            }
        }
    }
}
