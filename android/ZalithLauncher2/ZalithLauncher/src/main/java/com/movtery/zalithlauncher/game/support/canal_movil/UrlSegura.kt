package com.movtery.zalithlauncher.game.support.canal_movil

import java.net.IDN
import java.net.URI

/**
 * The only gate for links coming from the game (chat links, AWT Desktop.browse, clipboard "open").
 * Pure Kotlin so it can be unit tested.
 *
 * Accepts only http/https with a real host and no user info. Everything else (file:, intent:,
 * javascript:, content:, data:...) is rejected. The confirmation dialog shows [hostAscii] so a
 * look-alike Unicode domain is visible as punycode.
 */
object UrlSegura {
    const val MAX_LARGO = 2048

    /** scheme://authority + rest. Only http/https reach the URI parser. */
    private val PATRON = Regex("^(?i)(https?)://([^/?#]*)(.*)$")

    /**
     * Domains shown as verified in the dialog (the user still confirms). Add the Dbr web and store
     * domains here once they are fixed; subdomains match too.
     */
    private val DOMINIOS_CONFIANZA = listOf(
        "discord.gg",
        "discord.com",
    )

    data class Url(val url: String, val hostAscii: String, val confiable: Boolean)

    fun validar(entrada: String?): Url? {
        val texto = entrada?.trim() ?: return null
        if (texto.isEmpty() || texto.length > MAX_LARGO) return null
        if (texto.any { Character.isISOControl(it) || Character.isWhitespace(it) }) return null
        // java.net.URI drops non-ASCII hosts, so convert the host to punycode first.
        val partes = PATRON.matchEntire(texto) ?: return null
        val (esquemaTexto, autoridad, resto) = partes.destructured
        if (autoridad.contains('@')) return null
        val separador = autoridad.lastIndexOf(':').takeIf { it > autoridad.lastIndexOf(']') } ?: -1
        val hostTexto = if (separador >= 0) autoridad.substring(0, separador) else autoridad
        val puerto = if (separador >= 0) autoridad.substring(separador) else ""
        val hostConvertido = try {
            IDN.toASCII(hostTexto, IDN.USE_STD3_ASCII_RULES)
        } catch (_: Exception) {
            return null
        }
        val uri = try {
            URI("$esquemaTexto://$hostConvertido$puerto$resto")
        } catch (_: Exception) {
            return null
        }
        val esquema = uri.scheme?.lowercase() ?: return null
        if (esquema != "http" && esquema != "https") return null
        if (uri.rawUserInfo != null) return null
        val host = uri.host ?: return null
        val hostAscii = try {
            IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES).lowercase().trimEnd('.')
        } catch (_: Exception) {
            return null
        }
        if (hostAscii.isEmpty()) return null
        val confiable = DOMINIOS_CONFIANZA.any { hostAscii == it || hostAscii.endsWith(".$it") }
        return Url(uri.toASCIIString(), hostAscii, confiable)
    }
}
