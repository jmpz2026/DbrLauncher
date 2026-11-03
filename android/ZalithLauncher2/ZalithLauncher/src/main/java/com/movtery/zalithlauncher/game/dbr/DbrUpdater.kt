/*
 * DbrLauncherMobile — auto-actualización del launcher (sideload APK).
 * Lee un version.json en DBR-ASSETS y, si hay build más nuevo, descarga el APK
 * y lanza el instalador del sistema (PackageInstaller vía intent + FileProvider).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.movtery.zalithlauncher.BuildConfig
import com.movtery.zalithlauncher.utils.GSON
import com.movtery.zalithlauncher.utils.logging.Logger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.URL
import java.security.MessageDigest

object DbrUpdater {
    private const val TAG = "DbrUpdater"
    private const val MAX_ATTEMPTS = 6

    /** Info de versión del launcher Android (rama android del repo, NO la rama assets). */
    const val VERSION_URL =
        "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/android-zalith/android/version.json"

    data class UpdateInfo(
        /** Número de build DBR; debe ser > BuildConfig.DBR_BUILD para actualizar. */
        val build: Int = 0,
        val versionName: String = "",
        /** URL directa al APK (ej. asset de GitHub Releases). */
        val apkUrl: String = "",
        /** Si true, la actualización es obligatoria (bloquea el uso hasta actualizar). */
        val mandatory: Boolean = false,
        val changelog: String = "",
        /** SHA-256 del APK (lo escribe el CI). Vacío = solo se verifica que la descarga esté completa. */
        val sha256: String = ""
    )

    /** Devuelve la info si hay una versión más nueva; null si está al día o falla. */
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val conn = URL(VERSION_URL).openConnection()
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            val json = conn.getInputStream().use { it.readBytes().toString(Charsets.UTF_8) }
            val info = GSON.fromJson(json, UpdateInfo::class.java)
            info?.takeIf { it.build > BuildConfig.DBR_BUILD && it.apkUrl.isNotEmpty() }
        }.getOrNull()
    }

    /**
     * Descarga el APK a caché (con progreso 0..100) y lanza el instalador del sistema.
     * Resiste cortes de red: timeouts para no colgarse, reintentos con backoff y reanudación
     * con Range desde el .part. Verifica tamaño (y sha256 si version.json lo trae).
     * @throws IOException si no se pudo descargar tras los reintentos.
     */
    suspend fun downloadAndInstall(
        context: Context,
        info: UpdateInfo,
        onProgress: (Int) -> Unit
    ) {
        val apk = withContext(Dispatchers.IO) { download(context, info, onProgress) }
        installApk(context, apk)
    }

    private suspend fun download(context: Context, info: UpdateInfo, onProgress: (Int) -> Unit): File {
        val dir = context.cacheDir
        val apk = File(dir, "dbr_update_${info.build}.apk")
        val part = File(dir, "dbr_update_${info.build}.apk.part")
        //APKs y partes de builds viejos (o el nombre fijo de versiones anteriores).
        dir.listFiles()?.filter {
            it.name.startsWith("dbr_update") && it != apk && it != part
        }?.forEach { it.delete() }

        //El jugador canceló el instalador y vuelve a tocar Actualizar: no bajar de nuevo.
        if (apk.isFile && verify(apk, info)) return apk
        apk.delete()

        var delayMs = 1_000L
        var attempt = 0
        while (true) {
            try {
                fetch(info.apkUrl, part, onProgress)
                break
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                attempt++
                Logger.warning(TAG, "Descarga del APK falló (intento $attempt/$MAX_ATTEMPTS)", e)
                if (attempt >= MAX_ATTEMPTS) throw e
                delay(delayMs)
                delayMs = (delayMs * 2).coerceAtMost(10_000L)
            }
        }
        if (!verify(part, info)) {
            part.delete()
            throw IOException("APK descargada corrupta (sha256 no coincide)")
        }
        if (!part.renameTo(apk)) throw IOException("No se pudo guardar el APK")
        return apk
    }

    /** Baja (o reanuda) [url] en [part], con el progreso en % entregado en Main. */
    private suspend fun fetch(url: String, part: File, onProgress: (Int) -> Unit) {
        var lastPercent = -1
        DbrHttp.fetchResumable(url, part) { received, total ->
            if (total > 0) {
                val p = ((received * 100) / total).toInt()
                if (p != lastPercent) {
                    lastPercent = p
                    withContext(Dispatchers.Main) { onProgress(p) }
                }
            }
        }
    }

    private fun verify(file: File, info: UpdateInfo): Boolean {
        if (file.length() == 0L) return false
        val expected = info.sha256.trim().lowercase()
        if (expected.isEmpty()) return true
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) } == expected
    }

    private fun installApk(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", apk)
        // ACTION_INSTALL_PACKAGE solo lo atiende el instalador del sistema; con
        // ACTION_VIEW el chooser podía ofrecer otras apps para la APK.
        @Suppress("DEPRECATION")
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
