/*
 * DbrLauncherMobile — etapas de arranque del juego leídas del log, para la pantalla de carga.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import androidx.annotation.StringRes
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.bridge.LoggerBridge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * El juego escribe su stdout por [LoggerBridge], que admite un solo listener. Este objeto es
 * ese listener: saca la etapa de arranque y reenvía cada línea al visor de logs del juego
 * ([viewer]), que antes se enganchaba directo.
 *
 * Etapas: primero por líneas propias de Minecraft y FML (valen para cualquier pack) y después
 * por las marcas de DbrMod (`[DBR-LAUNCH] stage=...`, ver `LaunchMarker` en DbrServerPack).
 * La marca `menu` es la que quita la pantalla de carga. Si el pack no trae marcas (DbrMod
 * viejo), se da por llegado el menú unos segundos después de que FML termine de cargar.
 */
object DbrLaunchLog {
    enum class Stage(val progress: Float, @StringRes val textRes: Int) {
        JAVA(0.05f, R.string.dbr_launch_stage_java),
        MINECRAFT(0.15f, R.string.dbr_launch_stage_minecraft),
        MODS(0.30f, R.string.dbr_launch_stage_mods),
        MODS_INIT(0.55f, R.string.dbr_launch_stage_mods),
        MODS_POST(0.75f, R.string.dbr_launch_stage_mods),
        PREPARING(0.90f, R.string.dbr_launch_stage_preparing),
        MENU(1f, R.string.dbr_launch_stage_menu)
    }

    private val MARKER = Regex("""\[DBR-LAUNCH] stage=(\w+)""")
    private val MARKER_STAGES = mapOf(
        "preinit" to Stage.MODS,
        "init" to Stage.MODS_INIT,
        "postinit" to Stage.MODS_POST,
        "complete" to Stage.PREPARING,
        "menu" to Stage.MENU
    )

    /** Sin marcas de DbrMod: espera tras "successfully loaded" hasta dar el menú por abierto. */
    private const val NO_MARKER_MENU_DELAY_MS = 8_000L

    /** Con marcas pero sin `menu` (algo raro): no tapar el juego para siempre. */
    private const val MENU_TIMEOUT_MS = 60_000L

    private val _stage = MutableStateFlow(Stage.JAVA)
    val stage: StateFlow<Stage> = _stage.asStateFlow()

    /** Visor de logs del juego (LogBox); recibe todas las líneas tal cual. */
    @Volatile
    var viewer: ((String) -> Unit)? = null
        set(value) {
            field = value
            if (value != null) ensureInstalled()
        }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var fallback: Job? = null
    @Volatile private var sawMarker = false
    @Volatile private var installed = false

    /** Llamar justo antes de lanzar el juego: reinicia la etapa. */
    fun start() {
        fallback?.cancel()
        sawMarker = false
        _stage.value = Stage.JAVA
        ensureInstalled()
    }

    private fun ensureInstalled() {
        if (installed) return
        installed = true
        LoggerBridge.setListener { text ->
            parse(text)
            viewer?.invoke(text)
        }
    }

    private fun advance(to: Stage) {
        val current = _stage.value
        if (to.ordinal <= current.ordinal) return
        _stage.value = to
        if (to == Stage.PREPARING) {
            fallback?.cancel()
            fallback = scope.launch {
                delay(if (sawMarker) MENU_TIMEOUT_MS else NO_MARKER_MENU_DELAY_MS)
                advance(Stage.MENU)
            }
        }
    }

    private fun parse(text: String) {
        if (_stage.value == Stage.MENU) return
        val markers = MARKER.findAll(text).toList()
        if (markers.isNotEmpty()) {
            sawMarker = true
            markers.forEach { m -> MARKER_STAGES[m.groupValues[1]]?.let(::advance) }
            return
        }
        when {
            "Forge Mod Loader has successfully loaded" in text -> advance(Stage.PREPARING)
            "Forge Mod Loader has identified" in text -> advance(Stage.MODS)
            "Setting user:" in text || "LWJGL Version" in text -> advance(Stage.MINECRAFT)
        }
    }
}
