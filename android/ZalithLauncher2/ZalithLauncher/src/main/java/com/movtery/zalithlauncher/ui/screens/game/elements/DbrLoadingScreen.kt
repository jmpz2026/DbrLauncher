/*
 * DbrLauncherMobile — pantalla de carga entre Jugar y el menú principal de DbrMod.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.account.Account
import com.movtery.zalithlauncher.game.dbr.DbrLaunchLog
import com.movtery.zalithlauncher.ui.components.PlayerSkin
import com.movtery.zalithlauncher.ui.components.ModelAnimation
import com.movtery.zalithlauncher.ui.dbr.DbrCream
import com.movtery.zalithlauncher.ui.dbr.DbrGold
import com.movtery.zalithlauncher.ui.dbr.DbrGoldDeep
import com.movtery.zalithlauncher.ui.dbr.DbrStone
import com.movtery.zalithlauncher.ui.dbr.pixelBevel
import com.movtery.zalithlauncher.ui.dbr.stonePanel
import kotlinx.coroutines.delay

/** Cada cuánto cambia el consejo. */
private const val TIP_INTERVAL_MS = 7_000L

/**
 * Tapa el juego desde que se lanza hasta que DbrMod abre el menú principal: la carga de 1.7.10
 * con el modpack tarda y, sin esto, el jugador ve una pantalla negra o la barra de Forge sin
 * saber si va bien. La etapa sale de [DbrLaunchLog]. Bloquea los toques a los controles de
 * debajo. "Cancelar inicio" cierra el juego (como forzar cierre).
 */
@Composable
fun DbrLoadingScreen(
    account: Account?,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    val stage by DbrLaunchLog.stage.collectAsStateWithLifecycle()
    AnimatedVisibility(
        visible = stage != DbrLaunchLog.Stage.MENU,
        exit = fadeOut(tween(400)),
        modifier = modifier
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF191614))
                //Se come los toques: los controles del juego siguen debajo.
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {}
                )
                .padding(horizontal = 32.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "RESURRECTION",
                    color = DbrGold,
                    style = MaterialTheme.typography.headlineMedium
                )
                Text(
                    text = stringResource(R.string.dbr_launch_subtitle),
                    color = DbrCream.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelLarge
                )
                SkinPreview(
                    account = account,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .widthIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = stringResource(R.string.dbr_launch_title),
                    color = DbrCream,
                    style = MaterialTheme.typography.headlineSmall
                )
                Text(
                    text = stringResource(R.string.dbr_launch_wait),
                    color = DbrCream.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.bodyMedium
                )

                Text(
                    text = stringResource(stage.textRes),
                    color = DbrGold,
                    style = MaterialTheme.typography.labelLarge
                )
                StageBar(progress = stage.progress)

                TipText()

                Text(
                    text = stringResource(R.string.dbr_launch_device_note),
                    color = DbrCream.copy(alpha = 0.5f),
                    style = MaterialTheme.typography.labelSmall
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .stonePanel()
                        .clickable(onClick = onCancel)
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.dbr_launch_cancel),
                        color = DbrCream,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}

/** Barra de progreso pixelada; avanza suave entre etapas. */
@Composable
private fun StageBar(progress: Float) {
    val animated by animateFloatAsState(targetValue = progress, animationSpec = tween(800), label = "stage")
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(14.dp)
            .pixelBevel(background = DbrStone)
            .padding(3.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(animated.coerceIn(0f, 1f))
                .background(DbrGoldDeep)
        )
    }
}

@Composable
private fun TipText() {
    val tips = stringArrayResource(R.array.dbr_launch_tips)
    if (tips.isEmpty()) return
    var index by remember { mutableIntStateOf(tips.indices.random()) }
    LaunchedEffect(tips) {
        while (true) {
            delay(TIP_INTERVAL_MS)
            index = (index + 1) % tips.size
        }
    }
    Crossfade(targetState = index, label = "tip") { i ->
        Text(
            text = tips[i],
            color = DbrCream.copy(alpha = 0.85f),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Start
        )
    }
}

/** Skin 3D del jugador (skinview3d). El WebView se destruye al quitar la pantalla. */
@Composable
private fun SkinPreview(account: Account?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val playerSkin = remember { PlayerSkin(context) }
    var pageFinished by remember { mutableStateOf(false) }
    val skinFile = remember(account) { account?.getSkinFile()?.takeIf { it.exists() } }

    DisposableEffect(Unit) {
        onDispose { playerSkin.destroy() }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            playerSkin.loadWebView(
                context = ctx,
                onPageFinished = {
                    pageFinished = true
                    playerSkin.startAnim(ModelAnimation.NewIdle)
                    playerSkin.setAzimuthAndPitch(-25, 8)
                }
            )
        },
        update = {
            if (pageFinished) {
                runCatching {
                    skinFile?.inputStream().use { input ->
                        playerSkin.loadSkin(input, account?.skinModelType)
                    }
                }
            }
        }
    )
}
