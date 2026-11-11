package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.NotificadorDbr
import com.movtery.zalithlauncher.ui.components.NotificationCheck

/**
 * DBR: explains the game notifications and asks for the permission (Android 13+). Shown once,
 * when the player comes back after the first time the game went to the background.
 */
@Composable
fun PermisoNotifDbr() {
    val pedir by NotificadorDbr.pedirPermiso.collectAsStateWithLifecycle()
    if (!pedir) return
    NotificationCheck(
        text = stringResource(R.string.dbr_notif_permiso),
        onGranted = { NotificadorDbr.permisoResuelto() },
        onIgnore = { NotificadorDbr.permisoResuelto() },
        onDismiss = { NotificadorDbr.permisoResuelto() },
    )
}
