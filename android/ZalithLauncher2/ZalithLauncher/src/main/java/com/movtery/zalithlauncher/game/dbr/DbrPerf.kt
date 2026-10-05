/*
 * DbrLauncherMobile — propuesta de pasar a la variante Lite en móviles justos.
 * Puerto de main/perf del launcher de escritorio. Plan en
 * DbrServerPack/docs/rendimiento/PLAN.md (fase 4).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.movtery.zalithlauncher.setting.AllSettings
import com.movtery.zalithlauncher.setting.enums.DbrModpackVariant
import java.io.File

/**
 * Nunca cambia nada sola: propone y la UI enseña el diálogo. Reglas:
 * - Solo con la variante Completa.
 * - La marca del juego (`recomendarLite=true` en `config/dbrcore/rendimiento.cfg`: el
 *   jugador aceptó el modo ligero dentro del juego) basta por sí sola, aunque antes se
 *   rechazara: es evidencia nueva.
 * - Por hardware una sola vez (se guarda la respuesta) y basta una señal: menos de 4 GB de
 *   RAM, 4 núcleos o menos, o un sistema solo de 32 bits. En un móvil cualquiera de las
 *   tres ya deja al juego justo.
 */
object DbrPerf {
    const val NONE = "none"
    const val ACCEPTED = "accepted"
    const val REJECTED = "rejected"

    private const val RAM_JUSTA = 4L * 1024 * 1024 * 1024
    private const val NUCLEOS_JUSTOS = 4
    private const val CAT = "rendimiento"

    data class Proposal(val reason: String, val fromGame: Boolean)

    /** Lee archivos: llamar fuera del hilo principal. */
    fun check(context: Context, gameDir: File?): Proposal? {
        if (AllSettings.dbrModpackVariant.getValue() != DbrModpackVariant.FULL) return null
        if (gameDir != null && getKey(gameDir, "recomendarLite") == "true") {
            return Proposal("El juego activó su modo ligero en este móvil.", fromGame = true)
        }
        if (AllSettings.dbrLiteProposal.getValue() != NONE) return null

        val senales = mutableListOf<String>()
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val mem = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
        if (mem.totalMem in 1 until RAM_JUSTA) {
            senales += "%.1f GB de RAM".format(mem.totalMem / (1024.0 * 1024 * 1024))
        }
        val nucleos = Runtime.getRuntime().availableProcessors()
        if (nucleos <= NUCLEOS_JUSTOS) senales += "$nucleos núcleos"
        if (Build.SUPPORTED_64_BIT_ABIS.isEmpty()) senales += "sistema de 32 bits"
        if (senales.isEmpty()) return null
        return Proposal("Detectado: ${senales.joinToString(", ")}.", fromGame = false)
    }

    /**
     * Respuesta del jugador. Aceptar es el mismo cambio que el selector de Ajustes con
     * "aplicar la configuración recomendada": variante Lite, sync obligatoria y re-siembra,
     * que trae `preferencia=ligero` al juego. La marca del juego se limpia siempre y se le
     * deja al mod la respuesta en `launcher`, para que no repita la propuesta por hardware.
     */
    fun answer(accept: Boolean, gameDir: File?) {
        AllSettings.dbrLiteProposal.save(if (accept) ACCEPTED else REJECTED)
        if (accept) {
            AllSettings.dbrModpackVariant.save(DbrModpackVariant.LITE)
            AllSettings.dbrModpackSyncPending.save(true)
            AllSettings.dbrModpackSeedPending.save(true)
        }
        if (gameDir != null) {
            runCatching {
                setKey(gameDir, "recomendarLite", "false", 'B')
                setKey(gameDir, "launcher", if (accept) "aceptada" else "rechazada", 'S')
            }
        }
    }

    // ====================================================== rendimiento.cfg (formato Forge)

    private fun cfgFile(gameDir: File) = File(gameDir, "config/dbrcore/rendimiento.cfg")

    private fun keyRegex(key: String) =
        Regex("^(\\s*)([SBID]):${Regex.escape(key)}=(.*)$", RegexOption.MULTILINE)

    private fun getKey(gameDir: File, key: String): String? {
        val text = runCatching { cfgFile(gameDir).readText() }.getOrNull() ?: return null
        return keyRegex(key).find(text)?.groupValues?.get(3)?.trim()
    }

    private fun setKey(gameDir: File, key: String, value: String, type: Char) {
        val file = cfgFile(gameDir)
        var text = runCatching { file.readText() }.getOrDefault("")
        val re = keyRegex(key)
        val linea = re.find(text)
        val cierre = Regex("^$CAT\\s*\\{[\\s\\S]*?(^\\})", RegexOption.MULTILINE).find(text)
        text = when {
            linea != null ->
                text.replaceRange(linea.range, "${linea.groupValues[1]}$type:$key=$value")
            cierre != null -> {
                // Antes de la llave que cierra el bloque `rendimiento`.
                val llave = cierre.groups[1]!!.range.first
                text.substring(0, llave) + "    $type:$key=$value\n" + text.substring(llave)
            }
            else -> {
                val sep = if (text.isNotEmpty() && !text.endsWith("\n")) "\n" else ""
                "$text$sep$CAT {\n    $type:$key=$value\n}\n"
            }
        }
        file.parentFile?.mkdirs()
        file.writeText(text)
    }
}
