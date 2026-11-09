// Archivos "meta" del modpack (manifests y forge json): primero desde el mirror R2, con firma
// ECDSA P-256 verificada; si falta, no verifica o R2 no responde, desde raw.githubusercontent.
//
// La firma importa: el manifest dice qué sha1 tiene cada jar, así que quien pudiera escribir en
// el bucket podría hacer instalar un jar cualquiera. La clave privada solo vive en un secret de
// GitHub y la Action de la rama assets firma cada archivo al subirlo.
import { createPublicKey, verify, type KeyObject } from 'crypto'
import { CONFIG } from '../shared/config'
import { httpRequest, type HttpResponse } from './http'

let publicKey: KeyObject | null = null
function key(): KeyObject {
  publicKey ??= createPublicKey({
    key: Buffer.from(CONFIG.metaSignKey, 'base64'),
    format: 'der',
    type: 'spki'
  })
  return publicKey
}

/** true si `sigB64` es la firma ECDSA P-256 / SHA-256 (DER) válida de `body`. Nunca lanza. */
export function verifySignature(body: Buffer, sigB64: string): boolean {
  try {
    const sig = Buffer.from(sigB64.trim(), 'base64')
    return sig.length > 0 && sig.length <= 80 && verify('sha256', body, key(), sig)
  } catch {
    return false
  }
}

/**
 * Cuerpo firmado de `m/<name>` desde el mirror R2, o null si no está, no verifica o R2 falla.
 * Sin reintentos largos: hay plan B en raw.
 */
export async function fetchSignedMeta(name: string): Promise<Buffer | null> {
  const url = CONFIG.metaBase + encodeURIComponent(name)
  try {
    const [res, sig] = await Promise.all([
      httpRequest(url, { retries: 1, blockedWaitMs: 0 }),
      httpRequest(url + '.sig', { retries: 1, blockedWaitMs: 0 })
    ])
    if (!res.ok || !sig.ok) return null
    if (!verifySignature(res.body, sig.body.toString('utf-8'))) {
      console.warn(`[meta] firma inválida en ${url}, se usa raw`)
      return null
    }
    return res.body
  } catch {
    return null
  }
}

/**
 * Descarga un archivo meta: firmado desde R2 o, si no, `fallbackUrl` (raw). Devuelve la
 * respuesta de raw tal cual para que el llamador reporte su status, y `fromMirror` para saber
 * de dónde salió.
 */
export async function fetchMeta(
  name: string,
  fallbackUrl: string
): Promise<{ res: HttpResponse; fromMirror: boolean }> {
  const body = await fetchSignedMeta(name)
  if (body) return { res: { status: 200, ok: true, headers: {}, body }, fromMirror: true }
  return { res: await httpRequest(fallbackUrl), fromMirror: false }
}
