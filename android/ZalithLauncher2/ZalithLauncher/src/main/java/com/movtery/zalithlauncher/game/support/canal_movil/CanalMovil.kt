package com.movtery.zalithlauncher.game.support.canal_movil

import com.movtery.layer_controller.data.EstadoDbr
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
            Protocolo.ESTADO to LimiteRitmo.Limite(capacidad = 20, porSegundo = 20.0),
            Protocolo.VIBRAR to LimiteRitmo.Limite(capacidad = 8, porSegundo = 8.0),
            Protocolo.NOTIFICAR to LimiteRitmo.Limite(capacidad = 4, porSegundo = 1.0),
            Protocolo.TEXTO_ESTADO to LimiteRitmo.Limite(capacidad = 25, porSegundo = 25.0),
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

    private val _estado = MutableStateFlow<Set<EstadoDbr>?>(null)
    /**
     * Active game states for the context controls. Null until DbrCore reports them (not connected,
     * old DbrCore): the layout then ignores its conditions.
     */
    val estado: StateFlow<Set<EstadoDbr>?> = _estado.asStateFlow()

    private val _texto = MutableStateFlow<Mensaje.TextoEstado?>(null)
    /**
     * Last chat field state from DbrCore (step 8, synced text). Null until the game reports it
     * (not connected or DbrCore without CAP_TEXTO): the keyboard then works the old way.
     */
    val texto: StateFlow<Mensaje.TextoEstado?> = _texto.asStateFlow()

    /** Capabilities DbrCore announced in HOLA. */
    @Volatile
    private var capacidadesJuego = 0

    /** True when the game's DbrCore takes TEXTO_EDITAR. */
    fun juegoSoportaTexto(): Boolean = _conectado.value && (capacidadesJuego and Protocolo.CAP_TEXTO) != 0

    /** Keyboard edit of the chat field (payload built by TextoSincronizado). */
    fun enviarTexto(datos: ByteArray): Boolean {
        if (!juegoSoportaTexto() || _texto.value?.abierto != true) return false
        return enviar(Protocolo.TEXTO_EDITAR, datos)
    }

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

    /** Reduced mode for DbrCore. False when the game is not connected or its DbrCore is older. */
    fun enviarReducir(activo: Boolean): Boolean {
        if (!_conectado.value || (capacidadesJuego and Protocolo.CAP_REDUCIR) == 0) return false
        return enviar(Protocolo.REDUCIR, Protocolo.reducir(activo))
    }

    /** Last PANTALLA payload; resent when the game (re)connects. */
    @Volatile
    private var pantalla: ByteArray? = null

    /** Screen geometry from VMActivity (every window resize). Sent now if the game is connected. */
    fun actualizarPantalla(datos: ByteArray?) {
        datos ?: return
        if (pantalla?.contentEquals(datos) == true) return
        pantalla = datos
        enviarPantalla()
    }

    private fun enviarPantalla() {
        val datos = pantalla ?: return
        if (!_conectado.value || (capacidadesJuego and Protocolo.CAP_PANTALLA) == 0) return
        enviar(Protocolo.PANTALLA, datos)
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
                capacidadesJuego = mensaje.capacidades
                Logger.info(TAG, "game connected, capabilities 0x${Integer.toHexString(mensaje.capacidades)}")
                enviar(Protocolo.HOLA_ACK, Protocolo.holaAck())
                if (AvisosSistema.reducido.value) enviarReducir(true)
                enviarPantalla()
            }
            is Mensaje.AreaTexto -> if (_conectado.value) _areaTexto.value = mensaje.area
            is Mensaje.AbrirUrl -> if (_conectado.value) ZLNativeInvoker.openLink(mensaje.url)
            is Mensaje.Sugerencias -> if (_conectado.value) _sugerencias.value = mensaje
            is Mensaje.Estado -> if (_conectado.value) _estado.value = EstadoDbr.desdeBits(mensaje.bits)
            is Mensaje.Vibrar -> if (_conectado.value) VibradorDbr.reproducir(mensaje.id, mensaje.fuerza)
            is Mensaje.Notificar -> if (_conectado.value) NotificadorDbr.publicar(mensaje.id, mensaje.nombre)
            is Mensaje.TextoEstado -> if (juegoSoportaTexto()) _texto.value = mensaje
        }
    }

    /** Called when a new game starts; [gameDir] holds the modpack's vibration catalog. */
    fun reiniciar(gameDir: java.io.File? = null) {
        VibradorDbr.cargar(gameDir)
        AvisosSistema.reiniciar()
        NotificadorDbr.reiniciar()
        _conectado.value = false
        capacidadesJuego = 0
        _areaTexto.value = null
        _sugerencias.value = Mensaje.Sugerencias(false, emptyList(), emptyList())
        _estado.value = null
        _texto.value = null
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
