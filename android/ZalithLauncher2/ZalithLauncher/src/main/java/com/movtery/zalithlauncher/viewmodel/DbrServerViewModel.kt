/*
 * DbrLauncherMobile — estado del servidor DBR (ping SLP) para el chip de la home.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.movtery.zalithlauncher.game.version.multiplayer.pingServer
import com.movtery.zalithlauncher.game.version.multiplayer.resolve
import com.movtery.zalithlauncher.utils.network.ServerAddress
import kotlinx.coroutines.launch

class DbrServerViewModel : ViewModel() {
    /** Servidor DBR (mismo host/puerto que el launcher de escritorio). */
    private val serverAddress = "dragonblock.online:25625"

    sealed interface State {
        data object Loading : State
        data object Offline : State
        data class Online(val online: Int, val max: Int) : State
    }

    var state by mutableStateOf<State>(State.Loading)
        private set

    init {
        refresh()
    }

    fun refresh() {
        state = State.Loading
        viewModelScope.launch {
            state = runCatching {
                val resolved = ServerAddress.parse(serverAddress).resolve()
                val result = pingServer(resolved, protocolVersion = 5, timeoutMillis = 8000)
                State.Online(result.status.players.online, result.status.players.max)
            }.getOrElse {
                State.Offline
            }
        }
    }
}
