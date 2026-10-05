/*
 * DbrLauncherMobile — diálogo de la propuesta de pasar a Lite (ver game/dbr/DbrPerf.kt).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.ui.screens.content

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.dbr.DbrPerf
import com.movtery.zalithlauncher.ui.components.SimpleAlertDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Se comprueba una vez al entrar en la pantalla principal. [gameDir] es el de la instancia
 * DBR, o null si aún no está instalada (entonces solo cuenta el hardware).
 */
@Composable
fun DbrLiteProposalDialog(gameDir: File?) {
    val context = LocalContext.current
    var proposal by remember { mutableStateOf<DbrPerf.Proposal?>(null) }

    LaunchedEffect(gameDir) {
        proposal = withContext(Dispatchers.IO) {
            runCatching { DbrPerf.check(context, gameDir) }.getOrNull()
        }
    }

    val p = proposal ?: return
    SimpleAlertDialog(
        title = stringResource(R.string.dbr_lite_proposal_title),
        text = stringResource(R.string.dbr_lite_proposal_text) + "\n\n" + p.reason,
        confirmText = stringResource(R.string.dbr_lite_proposal_accept),
        dismissText = stringResource(R.string.dbr_lite_proposal_keep),
        dismissByDialog = false,
        onConfirm = {
            proposal = null
            DbrPerf.answer(true, gameDir)
        },
        onDismiss = {
            proposal = null
            DbrPerf.answer(false, gameDir)
        }
    )
}
