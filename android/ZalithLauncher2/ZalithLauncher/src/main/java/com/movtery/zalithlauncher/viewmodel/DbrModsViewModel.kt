/*
 * DbrLauncherMobile — estado de los mods del modpack para el chip de la home.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.movtery.zalithlauncher.game.dbr.DbrSync
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.File

class DbrModsViewModel : ViewModel() {
    sealed interface State {
        data object Checking : State
        /** No hay instancia DBR instalada. */
        data object NotInstalled : State
        data class Checked(val status: DbrSync.Status) : State
    }

    var state by mutableStateOf<State>(State.Checking)
        private set

    private var job: Job? = null

    /** [gameDir] de la instancia DBR, o null si no está instalada. */
    fun refresh(gameDir: File?) {
        job?.cancel()
        if (gameDir == null) {
            state = State.NotInstalled
            return
        }
        state = State.Checking
        job = viewModelScope.launch {
            state = State.Checked(DbrSync.checkStatus(gameDir))
        }
    }

    /** Un sync acaba de terminar bien: no hace falta volver a preguntar al servidor. */
    fun markUpToDate() {
        job?.cancel()
        state = State.Checked(DbrSync.Status.UP_TO_DATE)
    }
}
