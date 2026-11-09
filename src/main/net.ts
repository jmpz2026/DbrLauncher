import { createHash } from 'crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { httpRequest, readJson, type HttpInit, type HttpResponse } from './http'
import { rememberSha1, sha1File, sha1FileCached } from './sync/hash'
import { tr } from './idioma'

/** Desde este tamaño se baja a un `.part` en disco, reanudable, en vez de a memoria. */
const RESUMABLE_MIN_SIZE = 1024 * 1024

/**
 * Temporal reanudable de `dest`. Lleva el sha esperado en el nombre: un `.part` de otra versión
 * del mismo archivo nunca se reanuda. Lo limpia la sync cuando ya no sirve.
 */
export const partFor = (dest: string, sha1: string): string => `${dest}.${sha1.slice(0, 8).toLowerCase()}.part`

export interface EnsureOptions {
  /** Tamaño esperado (el `size` del manifest): decide si se baja a disco reanudable. */
  size?: number
  signal?: AbortSignal
  /** No apuntar el sha1 en el hash-cache (archivos cuyo nombre ya es su sha1). */
  noCache?: boolean
  /** Todas las fuentes dieron 403/429: se espera `waitMs` antes de la última vuelta. */
  onBlocked?: (waitMs: number) => void
}

/** Error de una descarga fallida: mensaje de bloqueo si toda fuente dio 403/429, más el detalle. */
export function downloadError(res: HttpResponse, url: string): Error {
  const detalle = (res.attempts ?? []).map((a) => `${a.host}: ${a.status}`).join(', ')
  if (res.blocked) return new Error(tr('err.bloqueado', { status: res.status, detalle }))
  const base = tr('err.descarga', { status: res.status, url })
  return new Error(detalle ? `${base} [${detalle}]` : base)
}

/** Descarga `url` a `dest` si falta o el sha1 no coincide. Devuelve true si descargó. */
export async function ensureFile(
  dest: string,
  url: string,
  sha1?: string,
  onProgress?: (received: number, total: number) => void,
  mirrors?: string[],
  opts: EnsureOptions = {}
): Promise<boolean> {
  if (existsSync(dest)) {
    if (!sha1) return false
    if ((await sha1FileCached(dest)) === sha1.toLowerCase()) return false
  }
  mkdirSync(dirname(dest), { recursive: true })

  // Archivo grande con sha1: a un .part en disco. Un corte o una sync cancelada siguen desde
  // ahí la próxima vez, y no se tienen 47 MB en memoria por jar.
  if (sha1 && (opts.size ?? 0) >= RESUMABLE_MIN_SIZE) {
    const part = partFor(dest, sha1)
    const res = await httpRequest(url, { onProgress, mirrors, toFile: part, signal: opts.signal, onBlocked: opts.onBlocked })
    if (!res.ok) throw downloadError(res, url)
    if ((await sha1File(part)) !== sha1.toLowerCase()) {
      rmSync(part, { force: true })
      throw new Error(`SHA1 no coincide: ${url}`)
    }
    rmSync(dest, { force: true })
    renameSync(part, dest)
    if (!opts.noCache) rememberSha1(dest, sha1)
    return true
  }

  const res = await httpRequest(url, { onProgress, mirrors, signal: opts.signal, onBlocked: opts.onBlocked })
  if (!res.ok) throw downloadError(res, url)
  const buf = res.body
  if (sha1) {
    const got = createHash('sha1').update(buf).digest('hex')
    if (got.toLowerCase() !== sha1.toLowerCase()) throw new Error(`SHA1 no coincide: ${url}`)
  }
  writeFileSync(dest, buf)
  if (sha1 && !opts.noCache) rememberSha1(dest, sha1)
  return true
}

export async function fetchJson<T>(url: string, init: Pick<HttpInit, 'retries'> = {}): Promise<T> {
  const res = await httpRequest(url, init)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return readJson<T>(res, url)
}
