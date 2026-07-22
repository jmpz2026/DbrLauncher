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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

object DbrUpdater {
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
        val changelog: String = ""
    )

    /** Devuelve la info si hay una versión más nueva; null si está al día o falla. */
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val json = URL(VERSION_URL).readText()
            val info = GSON.fromJson(json, UpdateInfo::class.java)
            info?.takeIf { it.build > BuildConfig.DBR_BUILD && it.apkUrl.isNotEmpty() }
        }.getOrNull()
    }

    /** Descarga el APK a caché (con progreso 0..100) y lanza el instalador del sistema. */
    suspend fun downloadAndInstall(
        context: Context,
        info: UpdateInfo,
        onProgress: (Int) -> Unit
    ) {
        val apk = withContext(Dispatchers.IO) {
            val file = File(context.cacheDir, "dbr_update.apk")
            val conn = URL(info.apkUrl).openConnection()
            conn.connect()
            val total = conn.contentLengthLong
            conn.getInputStream().use { input ->
                file.outputStream().use { output ->
                    val buf = ByteArray(1 shl 16)
                    var received = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        received += n
                        if (total > 0) onProgress(((received * 100) / total).toInt())
                    }
                }
            }
            file
        }
        installApk(context, apk)
    }

    private fun installApk(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
