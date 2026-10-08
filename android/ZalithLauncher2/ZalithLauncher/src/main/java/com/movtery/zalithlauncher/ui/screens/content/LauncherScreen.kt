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

package com.movtery.zalithlauncher.ui.screens.content

import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.constraintlayout.compose.ConstraintLayout
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.movtery.zalithlauncher.BuildConfig
import com.movtery.zalithlauncher.BuildKeys
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.account.AccountsManager
import com.movtery.zalithlauncher.game.version.installed.Version
import com.movtery.zalithlauncher.game.version.installed.VersionsManager
import com.movtery.zalithlauncher.ui.base.BaseScreen
import com.movtery.zalithlauncher.ui.components.BackgroundCard
import com.movtery.zalithlauncher.ui.components.MarqueeText
import com.movtery.zalithlauncher.ui.components.ScalingActionButton
import com.movtery.zalithlauncher.ui.components.defaultRichTextStyle
import com.movtery.zalithlauncher.ui.screens.NestedNavKey
import com.movtery.zalithlauncher.ui.screens.NormalNavKey
import com.movtery.zalithlauncher.ui.screens.content.elements.AccountAvatar
import com.movtery.zalithlauncher.ui.screens.content.elements.CommonVersionInfoLayout
import com.movtery.zalithlauncher.ui.screens.content.elements.VersionIconImage
import com.movtery.zalithlauncher.ui.screens.main.custom_home.MarkdownBlock
import com.movtery.zalithlauncher.ui.screens.main.custom_home.customHomePage
import com.movtery.zalithlauncher.utils.animation.swapAnimateDpAsState
import com.movtery.zalithlauncher.viewmodel.HomePageState
import com.movtery.zalithlauncher.viewmodel.LocalHomePageViewModel
import com.movtery.zalithlauncher.viewmodel.ScreenBackStackViewModel
import com.movtery.zalithlauncher.viewmodel.DbrModsViewModel
import com.movtery.zalithlauncher.viewmodel.DbrServerViewModel
import android.content.Context
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.movtery.zalithlauncher.game.dbr.DbrInstall
import com.movtery.zalithlauncher.game.dbr.DbrSync
import com.movtery.zalithlauncher.game.renderer.Renderers
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.text.style.TextAlign
import com.movtery.zalithlauncher.ui.dbr.BlockBackground
import com.movtery.zalithlauncher.ui.dbr.GoldButton
import com.movtery.zalithlauncher.ui.dbr.stonePanel
import com.movtery.zalithlauncher.ui.dbr.DbrGold
import com.movtery.zalithlauncher.ui.dbr.DbrCream
import com.movtery.zalithlauncher.ui.dbr.StoneNavButton
import com.movtery.zalithlauncher.game.account.getAccountTypeName
import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Color
import com.movtery.zalithlauncher.game.download.game.GameInstaller
import kotlinx.coroutines.launch

@Composable
fun LauncherScreen(
    backStackViewModel: ScreenBackStackViewModel,
    navigateToVersions: (Version) -> Unit,
    onLaunchGame: (Version?) -> Unit,
    onOpenLink: (String) -> Unit,
    onHomePageEvent: (MarkdownBlock.Button.Event) -> Unit,
) {
    val context = LocalContext.current
    BaseScreen(
        screenKey = NormalNavKey.LauncherMain,
        currentKey = backStackViewModel.mainScreen.currentKey
    ) { _ ->
        DbrHome(
            onLaunchGame = onLaunchGame,
            toAccountManageScreen = {
                backStackViewModel.mainScreen.navigateTo(
                    screenKey = NormalNavKey.AccountManager(FirstLoginMenu.NONE)
                )
            },
            toRendererSettings = {
                backStackViewModel.settingsScreen.navigateOnce(NormalNavKey.Settings.Renderer)
                backStackViewModel.mainScreen.removeAndNavigateTo(
                    removes = backStackViewModel.clearBeforeNavKeys,
                    screenKey = backStackViewModel.settingsScreen
                )
            },
            onExit = { (context as? Activity)?.finish() }
        )
    }
}

/** Home estilo desktop DBR: RESURRECTION, cuenta+salir, centro Jugar, versión abajo. */
@Composable
private fun DbrHome(
    onLaunchGame: (Version?) -> Unit,
    toAccountManageScreen: () -> Unit,
    toRendererSettings: () -> Unit,
    onExit: () -> Unit
) {
    val account by AccountsManager.currentAccountFlow.collectAsStateWithLifecycle()
    val allVersions by VersionsManager.versions.collectAsStateWithLifecycle()
    val hasDbr = allVersions.any { it.getVersionName() == DbrInstall.VERSION_NAME && it.isValid() }
    val dbrVm = rememberDbrInstallViewModel()
    val serverVm: DbrServerViewModel = viewModel()
    val modsVm: DbrModsViewModel = viewModel()
    val dbrGameDir = allVersions.firstOrNull { it.getVersionName() == DbrInstall.VERSION_NAME && it.isValid() }
        ?.getGameDir()
    //Se vuelve a comprobar al instalar DBR o al cambiar de variante.
    LaunchedEffect(dbrGameDir?.path, AllSettings.dbrModpackVariant.state) {
        modsVm.refresh(dbrGameDir)
    }
    val context = LocalContext.current

    val nick = account?.username ?: "—"
    val typeName = account?.let { getAccountTypeName(it) } ?: ""

    DbrInstallDialog(dbrVm)
    //DBR: propuesta de pasar a Lite en móviles justos (game/dbr/DbrPerf.kt).
    DbrLiteProposalDialog(dbrGameDir)

    Box(modifier = Modifier.fillMaxSize()) {
        BlockBackground(modifier = Modifier.fillMaxSize())

        // (RESURRECTION va en el título superior del launcher)

        // Arriba-derecha: cuenta + Salir
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .clip(RectangleShape)
                    .stonePanel()
                    .clickable(onClick = toAccountManageScreen)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(text = nick, color = DbrCream, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                if (typeName.isNotEmpty()) {
                    Text(text = typeName.uppercase(), color = DbrGold, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
            StoneNavButton(text = stringResource(R.string.dbr_exit), selected = false, onClick = onExit)
        }

        // Centro: bienvenida + nick + JUGAR + chips
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.dbr_welcome_back),
                color = DbrGold,
                style = MaterialTheme.typography.titleSmall
            )
            Text(
                text = nick.uppercase(),
                color = DbrGold,
                style = MaterialTheme.typography.displaySmall,
                maxLines = 1
            )
            GoldButton(
                onClick = {
                    if (hasDbr) {
                        val v = allVersions.firstOrNull { it.getVersionName() == DbrInstall.VERSION_NAME }
                        if (v != null) {
                            dbrVm.syncThenLaunch(v, onSynced = { modsVm.markUpToDate() }) { onLaunchGame(null) }
                        } else onLaunchGame(null)
                    } else {
                        dbrVm.install(context)
                    }
                },
                modifier = Modifier.width(280.dp),
                contentPadding = PaddingValues(vertical = 18.dp)
            ) {
                Text(
                    text = if (hasDbr) stringResource(R.string.dbr_play) else stringResource(R.string.dbr_install_button),
                    style = MaterialTheme.typography.titleMedium
                )
            }
            //DBR: recordatorio permanente mientras el modpack experimental esté activo.
            if (AllSettings.dbrModpackVariant.state == DbrModpackVariant.EXPERIMENTAL) {
                Text(
                    modifier = Modifier
                        .widthIn(max = 420.dp)
                        .border(width = 2.dp, color = Color(0xFFE0603A))
                        .background(Color(0xCC191614))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    text = stringResource(R.string.dbr_modpack_experimental_banner),
                    color = Color(0xFFFFB4A0),
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModsChip(state = modsVm.state, onClick = { modsVm.refresh(dbrGameDir) })
                RendererChip(onClick = toRendererSettings)
                val serverState = serverVm.state
                val serverDot = when (serverState) {
                    is DbrServerViewModel.State.Online -> Color(0xFF5FA838)
                    is DbrServerViewModel.State.Offline -> Color(0xFFE0603A)
                    else -> null
                }
                val serverText = when (val s = serverState) {
                    is DbrServerViewModel.State.Online -> "${stringResource(R.string.dbr_server_label)} ${s.online}/${s.max}"
                    is DbrServerViewModel.State.Offline -> stringResource(R.string.dbr_server_offline)
                    else -> stringResource(R.string.dbr_server)
                }
                InfoChip(text = serverText, dot = serverDot, onClick = { serverVm.refresh() })
            }
        }

        // Abajo-derecha: versión
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            horizontalAlignment = Alignment.End
        ) {
            Text(
                text = "Build ${BuildConfig.DBR_BUILD}",
                color = DbrCream.copy(alpha = 0.6f),
                style = MaterialTheme.typography.labelSmall
            )
            Text(
                text = "Forge ${DbrInstall.MINECRAFT} · Java 8",
                color = DbrCream.copy(alpha = 0.6f),
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}

/** Chip de piedra con texto (y punto opcional de estado). */
@Composable
private fun InfoChip(
    text: String,
    dot: Color? = null,
    onClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .clip(RectangleShape)
            .stonePanel()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (dot != null) {
            Box(modifier = Modifier.size(8.dp).background(dot))
        }
        Text(text = text, color = DbrCream, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

/** Chip con el estado de los mods frente al manifest del servidor. Tocarlo vuelve a comprobar. */
@Composable
private fun ModsChip(state: DbrModsViewModel.State, onClick: () -> Unit) {
    val (text, dot) = when (state) {
        is DbrModsViewModel.State.Checking -> stringResource(R.string.dbr_mods_checking) to null
        is DbrModsViewModel.State.NotInstalled -> stringResource(R.string.dbr_mods_not_installed) to Color(0xFF8A8580)
        is DbrModsViewModel.State.Checked -> when (state.status) {
            DbrSync.Status.UP_TO_DATE -> stringResource(R.string.dbr_mods_ok) to Color(0xFF5FA838)
            DbrSync.Status.UPDATE_AVAILABLE -> stringResource(R.string.dbr_mods_update) to Color(0xFFE0B23A)
            DbrSync.Status.UNKNOWN -> stringResource(R.string.dbr_mods_unknown) to Color(0xFF8A8580)
        }
    }
    InfoChip(text = text, dot = dot, onClick = onClick)
}

/** Chip con el motor de render actual; el motor se cambia en Ajustes > Renderizador. */
@Composable
private fun RendererChip(onClick: () -> Unit) {
    val renderers = remember { Renderers.getRenderers() }
    if (renderers.isEmpty()) return
    val selectedId = AllSettings.renderer.state
    val name = renderers.firstOrNull { it.getUniqueIdentifier() == selectedId }?.getRendererName()
        ?: renderers.first().getRendererName()
    InfoChip(text = "Motor: $name", onClick = onClick)
}

/** Estado de la provisión de la instancia DBR (Minecraft 1.7.10 + Forge). */
private sealed interface DbrInstallState {
    data object Idle : DbrInstallState
    data object Preparing : DbrInstallState
    data object Installing : DbrInstallState
    data class Syncing(val done: Int, val total: Int) : DbrInstallState
    data object Success : DbrInstallState
    data class Error(val th: Throwable) : DbrInstallState
    /** El sync falló pero hay mods de un sync anterior: se puede jugar con ellos. */
    data class SyncFailedCanPlay(val onLaunch: () -> Unit) : DbrInstallState
}

private class DbrInstallViewModel : ViewModel() {
    var state by mutableStateOf<DbrInstallState>(DbrInstallState.Idle)
        private set
    var installer by mutableStateOf<GameInstaller?>(null)
        private set

    fun install(context: Context) {
        if (state is DbrInstallState.Preparing || state is DbrInstallState.Installing) return
        state = DbrInstallState.Preparing
        viewModelScope.launch {
            val info = runCatching { DbrInstall.buildInfo() }.getOrElse { th ->
                state = DbrInstallState.Error(th)
                return@launch
            }
            state = DbrInstallState.Installing
            installer = GameInstaller(context, info, viewModelScope).also { gi ->
                gi.installGame(
                    onInstalled = { version ->
                        installer = null
                        VersionsManager.refresh("[DBR] provision", version)
                        state = DbrInstallState.Success
                    },
                    onError = { th ->
                        installer = null
                        state = DbrInstallState.Error(th)
                    },
                    onGameAlreadyInstalled = {
                        installer = null
                        VersionsManager.refresh("[DBR] already", DbrInstall.VERSION_NAME)
                        state = DbrInstallState.Success
                    }
                )
            }
        }
    }

    /**
     * Sincroniza el modpack y, si tiene éxito, lanza el juego. El sync es obligatorio: si falla
     * (sin red, GitHub caído) y ya hay mods de un sync anterior de la misma variante, se ofrece
     * jugar con ellos; si no, se muestra el error y no se lanza.
     */
    fun syncThenLaunch(version: Version, onSynced: () -> Unit, onLaunch: () -> Unit) {
        when (state) {
            is DbrInstallState.Preparing, is DbrInstallState.Installing, is DbrInstallState.Syncing -> return
            else -> {}
        }
        val gameDir = version.getGameDir()
        state = DbrInstallState.Syncing(0, 0)
        //Si el jugador aceptó la config recomendada al cambiar de variante, esta sync la
        //re-aplica y consume el flag.
        val reseed = AllSettings.dbrModpackSeedPending.getValue()
        viewModelScope.launch {
            runCatching {
                DbrSync.sync(gameDir, reseed) { p ->
                    state = DbrInstallState.Syncing(p.done, p.total)
                }
            }.onSuccess {
                if (reseed) AllSettings.dbrModpackSeedPending.save(false)
                if (AllSettings.dbrModpackSyncPending.getValue()) {
                    AllSettings.dbrModpackSyncPending.save(false)
                }
                onSynced()
                state = DbrInstallState.Idle
                onLaunch()
            }.onFailure { th ->
                //Con un cambio de variante pendiente los mods del disco son de la otra variante.
                val canPlay = !DbrSync.neverSynced(gameDir) && !AllSettings.dbrModpackSyncPending.getValue()
                state = if (canPlay) DbrInstallState.SyncFailedCanPlay(onLaunch) else DbrInstallState.Error(th)
            }
        }
    }

    fun playAnyway() {
        val current = state as? DbrInstallState.SyncFailedCanPlay ?: return
        state = DbrInstallState.Idle
        current.onLaunch()
    }

    fun dismissError() {
        if (state is DbrInstallState.Error || state is DbrInstallState.SyncFailedCanPlay) state = DbrInstallState.Idle
    }

    override fun onCleared() {
        installer?.cancelInstall()
    }
}

@Composable
private fun rememberDbrInstallViewModel(): DbrInstallViewModel = viewModel { DbrInstallViewModel() }

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun DbrInstallDialog(
    viewModel: DbrInstallViewModel
) {
    when (val state = viewModel.state) {
        is DbrInstallState.Preparing, is DbrInstallState.Installing -> {
            Dialog(onDismissRequest = {}) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp
                ) {
                    Column(
                        modifier = Modifier.padding(all = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        LoadingIndicator()
                        Text(
                            text = stringResource(R.string.dbr_installing_message),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        is DbrInstallState.Syncing -> {
            Dialog(onDismissRequest = {}) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp
                ) {
                    Column(
                        modifier = Modifier.padding(all = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        LoadingIndicator()
                        Text(
                            text = stringResource(R.string.dbr_syncing_message),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        if (state.total > 0) {
                            Text(
                                text = "${state.done} / ${state.total}",
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                }
            }
        }
        is DbrInstallState.Error -> {
            Dialog(onDismissRequest = { viewModel.dismissError() }) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp
                ) {
                    Column(
                        modifier = Modifier.padding(all = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.dbr_install_error_title),
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = state.th.localizedMessage ?: state.th.toString(),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Button(
                            modifier = Modifier.align(Alignment.End),
                            onClick = { viewModel.dismissError() }
                        ) {
                            Text(stringResource(R.string.generic_close))
                        }
                    }
                }
            }
        }
        is DbrInstallState.SyncFailedCanPlay -> {
            Dialog(onDismissRequest = { viewModel.dismissError() }) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp
                ) {
                    Column(
                        modifier = Modifier.padding(all = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.dbr_sync_offline_title),
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = stringResource(R.string.dbr_sync_offline_message),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Row(
                            modifier = Modifier.align(Alignment.End),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            TextButton(onClick = { viewModel.dismissError() }) {
                                Text(stringResource(R.string.generic_cancel))
                            }
                            Button(onClick = { viewModel.playAnyway() }) {
                                Text(stringResource(R.string.dbr_sync_offline_play))
                            }
                        }
                    }
                }
            }
        }
        else -> {}
    }
}
