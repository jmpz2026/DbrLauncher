/*
 * DbrLauncherMobile — fuentes del modpack fuera de GitHub (mirror R2) y firma de los manifests.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.game.dbr

import com.movtery.zalithlauncher.utils.logging.Logger
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * El modpack se baja primero de un Worker de Cloudflare sobre R2 (no es de GitHub: un límite o
 * bloqueo de GitHub a la IP del jugador no lo alcanza), luego del release `assets-files` y al
 * final de raw. Las dos copias las sube la Action de la rama assets. Mismo esquema que el
 * launcher de escritorio (src/main/meta.ts y CONFIG.assetBases).
 */
object DbrMirror {
    private const val TAG = "DbrMirror"

    /** Bases por contenido: `<base><sha1>` y `<base><sha1viejo>-<sha1nuevo>.dbrpatch`. */
    val ASSET_BASES = listOf(
        "https://dbr-assets.dbrlauncher.workers.dev/f/",
        "https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/"
    )

    /** Manifests en el mirror, cada uno con su firma en `<nombre>.sig`. */
    private const val META_BASE = "https://dbr-assets.dbrlauncher.workers.dev/m/"

    /** Solo los manifests de esta rama están en el mirror (por nombre). */
    private const val OWN_BASE = "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/"

    /**
     * Clave pública ECDSA P-256 (SPKI DER en base64). La privada es el secret MANIFEST_SIGN_KEY
     * de GitHub. P-256 y no Ed25519 porque Android solo verifica Ed25519 desde la API 33.
     */
    private const val SIGN_KEY =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5vX89swMxkQvjBpfg4r4jgll/+L1KeEGCVs2qXVH/QBcGCYXdlpmiJ1sqqrQ3T+/uVgXvXq0EjHGi/W0F3mr2A=="

    private val publicKey: PublicKey by lazy {
        KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(SIGN_KEY)))
    }

    /** Bases del manifest (solo https y terminadas en `/`) o las de por defecto. */
    fun bases(fromManifest: List<String>?): List<String> =
        fromManifest.orEmpty().filter { it.startsWith("https://") && it.endsWith("/") && !it.contains(' ') }
            .ifEmpty { ASSET_BASES }

    /** true si [sigB64] es la firma ECDSA P-256 / SHA-256 (DER) de [body]. Nunca lanza. */
    fun verify(body: ByteArray, sigB64: String): Boolean = runCatching {
        val sig = Base64.getDecoder().decode(sigB64.trim())
        if (sig.isEmpty() || sig.size > 80) return false
        Signature.getInstance("SHA256withECDSA").run {
            initVerify(publicKey)
            update(body)
            verify(sig)
        }
    }.getOrDefault(false)

    private fun get(url: String): ByteArray? = runCatching {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.instanceFollowRedirects = true
        try {
            if (conn.responseCode !in 200..299) null else conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }.getOrNull()

    /**
     * Texto del manifest [rawUrl] desde el mirror, solo si su firma es válida. null si no es de
     * nuestra rama, el mirror no responde o la firma no casa: entonces se usa raw.
     */
    fun fetchSigned(rawUrl: String): String? {
        if (!rawUrl.startsWith(OWN_BASE)) return null
        val url = META_BASE + rawUrl.substringAfterLast('/')
        val body = get(url) ?: return null
        val sig = get("$url.sig") ?: return null
        if (!verify(body, sig.toString(Charsets.UTF_8))) {
            Logger.warning(TAG, "Firma inválida en $url, se usa raw")
            return null
        }
        return body.toString(Charsets.UTF_8)
    }
}
