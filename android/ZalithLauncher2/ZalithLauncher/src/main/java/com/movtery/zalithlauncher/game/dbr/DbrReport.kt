/*
 * DbrLauncherMobile — paquete de "Reportar problema" (logs del juego y del launcher en un zip).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import android.os.Build
import com.movtery.zalithlauncher.BuildConfig
import com.movtery.zalithlauncher.game.renderer.Renderers
import com.movtery.zalithlauncher.game.version.installed.VersionsManager
import com.movtery.zalithlauncher.path.PathManager
import com.movtery.zalithlauncher.setting.AllSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Junta en un solo zip lo que el staff pide cuando algo falla: el log del último arranque,
 * el crash-report más reciente, los logs del launcher y un info.txt con el dispositivo y
 * la configuración. Así el jugador comparte un archivo y no tiene que saber cuál mandar.
 */
object DbrReport {
    suspend fun build(target: File) = withContext(Dispatchers.IO) {
        target.parentFile?.mkdirs()
        val version = VersionsManager.versions.value.firstOrNull { it.getVersionName() == DbrInstall.VERSION_NAME }
        ZipOutputStream(target.outputStream()).use { zip ->
            fun add(name: String, file: File?) {
                if (file == null || !file.isFile) return
                zip.putNextEntry(ZipEntry(name))
                file.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }

            zip.putNextEntry(ZipEntry("info.txt"))
            zip.write(info().toByteArray(Charsets.UTF_8))
            zip.closeEntry()

            if (version != null) {
                val gameLog = VersionsManager.getLatestLog(version)
                add("juego/${gameLog.name}", gameLog)
                File(version.getGameDir(), "crash-reports")
                    .listFiles { file -> file.isFile && file.name.endsWith(".txt") }
                    ?.maxByOrNull { it.lastModified() }
                    ?.let { add("crash/${it.name}", it) }
            }
            PathManager.DIR_LAUNCHER_LOGS.listFiles()
                ?.filter { it.isFile }
                ?.forEach { add("launcher/${it.name}", it) }
        }
    }

    private fun info(): String {
        val rendererId = AllSettings.renderer.getValue()
        val renderer = Renderers.getRenderers().firstOrNull { it.getUniqueIdentifier() == rendererId }
        return buildString {
            appendLine("DbrLauncher Mobile build ${BuildConfig.DBR_BUILD}")
            appendLine("Dispositivo: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
            appendLine("ABI: ${Build.SUPPORTED_ABIS.joinToString()}")
            appendLine("Modpack: ${AllSettings.dbrModpackVariant.getValue().name}")
            appendLine("Motor: ${renderer?.getRendererName() ?: "por defecto"} ($rendererId)")
            appendLine("RAM asignada: ${AllSettings.ramAllocation.getValue()} MB")
            appendLine("Resolución: ${AllSettings.resolutionRatio.getValue()}%")
            appendLine("JVM args: ${AllSettings.jvmArgs.getValue()}")
        }
    }
}
