package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.zalithlauncher.bridge.ZLNativeInvoker
import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo.Mensaje
import com.movtery.zalithlauncher.utils.logging.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.lwjgl.glfw.CallbackBridge
import java.util.Collections

private const val TAG = "CanalMovil"

/**
 * Launcher side of the DBR mobile channel (docs/canal-movil.md).
 *
 * Messages arrive on the game thread from CallbackBridge.onDbrMessage. Each one goes through the
 * rate limit and the strict parser in [Protocolo]; anything unknown, malformed or too frequent is
 * dropped and logged once per type. A payload is never treated as a path, intent, command or code:
 * the only URL path goes through [ZLNativeInvoker.openLink], which validates and asks the user.
 */
object CanalMovil {
    private val limite = LimiteRitmo(
        mapOf(
            Protocolo.HOLA to LimiteRitmo.Limite(capacidad = 2, porSegundo = 0.5),
            Protocolo.AREA_TEXTO to LimiteRitmo.Limite(capacidad = 20, porSegundo = 20.0),
            Protocolo.SUGERENCIAS to LimiteRitmo.Limite(capacidad = 10, porSegundo = 10.0),
            Protocolo.ABRIR_URL to LimiteRitmo.Limite(capacidad = 1, porSegundo = 0.5),
        )
    )

    private val avisados: MutableSet<String> = Collections.synchronizedSet(HashSet())

    private val _conectado = MutableStateFlow(false)
    /** True once the game said HOLA with our protocol version. */
    val conectado: StateFlow<Boolean> = _conectado.asStateFlow()

    private val _areaTexto = MutableStateFlow<Protocolo.AreaNormalizada?>(null)
    /** Focused text field reported by DbrCore, in 0..1 of the game window. Null = none. */
    val areaTexto: StateFlow<Protocolo.AreaNormalizada?> = _areaTexto.asStateFlow()

    private val _sugerencias = MutableStateFlow(Mensaje.Sugerencias(false, emptyList(), emptyList()))
    /** Chat state for the chip row: open or not, server chips and popup suggestions. */
    val sugerencias: StateFlow<Mensaje.Sugerencias> = _sugerencias.asStateFlow()

    private val ritmoInsertar = LimiteRitmo(
        mapOf(Protocolo.INSERTAR to LimiteRitmo.Limite(capacidad = 5, porSegundo = 5.0))
    )

    /**
     * Writes [texto] into the game's chat field (a chip or phrase tap). The game never sends it.
     * False when the game is not connected, the text is invalid or taps come too fast.
     */
    fun insertar(modo: Int, texto: String): Boolean {
        if (!_conectado.value || !_sugerencias.value.abierto) return false
        val datos = Protocolo.insertar(modo, texto) ?: return false
        if (!ritmoInsertar.permitir(Protocolo.INSERTAR)) return false
        return enviar(Protocolo.INSERTAR, datos)
    }

    fun recibir(tipo: Int, datos: ByteArray?) {
        if (!limite.permitir(tipo)) {
            avisarUnaVez("ritmo-$tipo", "message type $tipo dropped (unknown type or rate limit)")
            return
        }
        val mensaje = Protocolo.leer(tipo, datos)
        if (mensaje == null) {
            avisarUnaVez("formato-$tipo", "malformed message of type $tipo dropped (${datos?.size ?: 0} bytes)")
            return
        }
        when (mensaje) {
            is Mensaje.Hola -> {
                _conectado.value = true
                Logger.info(TAG, "game connected, capabilities 0x${Integer.toHexString(mensaje.capacidades)}")
                enviar(Protocolo.HOLA_ACK, Protocolo.holaAck())
            }
            is Mensaje.AreaTexto -> if (_conectado.value) _areaTexto.value = mensaje.area
            is Mensaje.AbrirUrl -> if (_conectado.value) ZLNativeInvoker.openLink(mensaje.url)
            is Mensaje.Sugerencias -> if (_conectado.value) _sugerencias.value = mensaje
        }
    }

    /** Called when the game process ends or a new game starts. */
    fun reiniciar() {
        _conectado.value = false
        _areaTexto.value = null
        _sugerencias.value = Mensaje.Sugerencias(false, emptyList(), emptyList())
        limite.reiniciar()
        ritmoInsertar.reiniciar()
        avisados.clear()
    }

    private fun enviar(tipo: Int, datos: ByteArray): Boolean {
        if (datos.size > Protocolo.MAX_PAYLOAD) return false
        return try {
            CallbackBridge.nativeDbrPush(tipo, datos)
            true
        } catch (e: UnsatisfiedLinkError) {
            avisarUnaVez("push", "native push not available: ${e.message}")
            false
        }
    }

    private fun avisarUnaVez(clave: String, texto: String) {
        if (avisados.add(clave)) Logger.warning(TAG, texto)
    }
}
