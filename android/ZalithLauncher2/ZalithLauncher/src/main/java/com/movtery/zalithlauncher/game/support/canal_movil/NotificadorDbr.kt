package com.movtery.zalithlauncher.game.support.canal_movil

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.context.GlobalContext
import com.movtery.zalithlauncher.notification.NOTIFICATION_ID_DBR_BASE
import com.movtery.zalithlauncher.notification.NotificationChannelData
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.utils.logging.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private const val TAG = "NotificadorDbr"

/**
 * Shows NOTIFICAR messages as Android notifications (plan J). Runs in the :game process, where
 * CanalMovil lives. Nothing is shown while the game is on screen: VMActivity reports onStart/onStop.
 * One notification per category with a counter; on the lock screen only the version without names.
 */
object NotificadorDbr {
    private val politica = PoliticaNotif()

    /** True between VMActivity.onStart and onStop. */
    @Volatile
    private var enPrimerPlano = true

    private val _pedirPermiso = MutableStateFlow(false)
    /** True when the game should explain and ask for the notification permission (Android 13+). */
    val pedirPermiso: StateFlow<Boolean> = _pedirPermiso.asStateFlow()

    /** First notifications of a game go to the log (diagnosis on real phones). */
    @Volatile
    private var registradas = 0

    fun reiniciar() {
        politica.reiniciar()
        registradas = 0
    }

    /** VMActivity.onStart: the player sees the game again, the notifications are no longer needed. */
    fun alVolver(context: Context) {
        enPrimerPlano = true
        politica.vaciar()
        val nm = NotificationManagerCompat.from(context)
        CategoriaNotif.entries.forEach { nm.cancel(idNotificacion(it)) }
    }

    /**
     * VMActivity.onStop. The permission cannot be asked from the background, so the first time the
     * game goes to the background without it, the request waits for the player to come back.
     */
    fun alSalir(context: Context) {
        enPrimerPlano = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            AllSettings.dbrNotif.getValue() &&
            !AllSettings.dbrNotifPermisoPedido.getValue() &&
            !tienePermiso(context)
        ) {
            _pedirPermiso.value = true
        }
    }

    /** The permission dialog was answered or closed: never asked again by itself. */
    fun permisoResuelto() {
        _pedirPermiso.value = false
        AllSettings.dbrNotifPermisoPedido.save(true)
    }

    fun publicar(id: String, nombre: String) {
        if (enPrimerPlano) return
        val evento = Notificaciones.evento(id) ?: return
        if (!AllSettings.dbrNotif.getValue() || !categoriaActiva(evento.categoria)) return
        val context = GlobalContext
        if (!tienePermiso(context)) return
        val decision = politica.registrar(evento.categoria, SystemClock.elapsedRealtime())
        if (registradas < 30) {
            registradas++
            Logger.info(TAG, "notify $id alert=${decision.alertar} count=${decision.cuenta}")
        }
        runCatching {
            crearCanal(context, canal(evento.categoria))
            val n = construir(context, evento, Notificaciones.nombre(evento, nombre), decision)
            @Suppress("MissingPermission")
            NotificationManagerCompat.from(context).notify(idNotificacion(evento.categoria), n)
        }.onFailure { Logger.error(TAG, "notify failed", it) }
    }

    private fun construir(
        context: Context,
        evento: EventoNotif,
        nombre: String,
        decision: PoliticaNotif.Decision,
    ): Notification {
        val canal = canal(evento.categoria)
        val titulo = canal.channelName(context)
        val sinNombre = context.getString(textoSinNombre(evento.id))
        val texto = textoConNombre(evento.id)
            ?.takeIf { nombre.isNotEmpty() }
            ?.let { context.getString(it, nombre) }
            ?: sinNombre
        val publica = NotificationCompat.Builder(context, canal.channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(sinNombre)
            .build()
        return NotificationCompat.Builder(context, canal.channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setNumber(decision.cuenta)
            .setSubText(if (decision.cuenta > 1) context.getString(R.string.dbr_notif_cuenta, decision.cuenta) else null)
            .setCategory(if (evento.categoria == CategoriaNotif.PRIVADO) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publica)
            .setOnlyAlertOnce(!decision.alertar)
            .setSilent(!decision.alertar)
            .setAutoCancel(true)
            .setContentIntent(volverAlJuego(context))
            .build()
    }

    /**
     * Same intent as the launcher icon: brings the existing task (the game on top) to the front. A
     * VMActivity intent would start a second game screen without launch data if the first one died.
     */
    private fun volverAlJuego(context: Context): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun tienePermiso(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Channels are created by MainActivity in the main process; done again here in case it did not run. */
    private fun crearCanal(context: Context, data: NotificationChannelData) {
        val nm = context.getSystemService(android.app.NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(data.channelId) != null) return
        nm.createNotificationChannel(NotificationChannel(data.channelId, data.channelName(context), data.level))
    }

    private fun idNotificacion(c: CategoriaNotif) = NOTIFICATION_ID_DBR_BASE + c.ordinal

    private fun canal(c: CategoriaNotif) = when (c) {
        CategoriaNotif.PRIVADO -> NotificationChannelData.DBR_PRIVADO
        CategoriaNotif.EVENTOS -> NotificationChannelData.DBR_EVENTOS
        CategoriaNotif.PELIGRO -> NotificationChannelData.DBR_PELIGRO
        CategoriaNotif.CONEXION -> NotificationChannelData.DBR_CONEXION
    }

    private fun categoriaActiva(c: CategoriaNotif): Boolean = when (c) {
        CategoriaNotif.PRIVADO -> AllSettings.dbrNotifPrivado.getValue()
        CategoriaNotif.EVENTOS -> AllSettings.dbrNotifEventos.getValue()
        CategoriaNotif.PELIGRO -> AllSettings.dbrNotifPeligro.getValue()
        CategoriaNotif.CONEXION -> AllSettings.dbrNotifConexion.getValue()
    }

    /** Text with the player's name (%1$s), or null when the event never shows one. */
    private fun textoConNombre(id: String): Int? = when (id) {
        "privado.mensaje" -> R.string.dbr_notif_privado_mensaje_de
        "privado.mencion" -> R.string.dbr_notif_privado_mencion_de
        else -> null
    }

    /** Text without names; also the lock screen version. Every catalog id has one. */
    private fun textoSinNombre(id: String): Int = when (id) {
        "privado.mensaje" -> R.string.dbr_notif_privado_mensaje
        "privado.mencion" -> R.string.dbr_notif_privado_mencion
        "eventos.invasion" -> R.string.dbr_notif_eventos_invasion
        "peligro.atacado" -> R.string.dbr_notif_peligro_atacado
        "peligro.vida_baja" -> R.string.dbr_notif_peligro_vida_baja
        "conexion.afk" -> R.string.dbr_notif_conexion_afk
        "conexion.afk_kick" -> R.string.dbr_notif_conexion_afk_kick
        "conexion.desconectado" -> R.string.dbr_notif_conexion_desconectado
        else -> R.string.dbr_notif_eventos_generico
    }
}
