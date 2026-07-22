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
    /** Servidor DBR: dominio primero; si falla, IP directa (mismo puerto 25575). */
    private val addresses = listOf(
        "dragonblock.online:25575",
        "163.227.179.245:25575"
    )

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
            //Intenta el dominio y, si falla, la IP directa.
            state = addresses.firstNotNullOfOrNull { tryPing(it) } ?: State.Offline
        }
    }

    private suspend fun tryPing(address: String): State.Online? = runCatching {
        val resolved = ServerAddress.parse(address).resolve()
        val result = pingServer(resolved, protocolVersion = 5, timeoutMillis = 8000)
        State.Online(result.status.players.online, result.status.players.max)
    }.getOrNull()
}
