import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { httpRequest, readJson } from './http'
import { rememberSha1, sha1FileCached } from './sync/hash'

/** Descarga `url` a `dest` si falta o el sha1 no coincide. Devuelve true si descargó. */
export async function ensureFile(
  dest: string,
  url: string,
  sha1?: string,
  onProgress?: (received: number, total: number) => void
): Promise<boolean> {
  if (existsSync(dest)) {
    if (!sha1) return false
    if ((await sha1FileCached(dest)) === sha1.toLowerCase()) return false
  }
  mkdirSync(dirname(dest), { recursive: true })
  const res = await httpRequest(url, { onProgress })
  if (!res.ok) throw new Error(`Descarga falló (${res.status}): ${url}`)
  const buf = res.body
  if (sha1) {
    const got = createHash('sha1').update(buf).digest('hex')
    if (got.toLowerCase() !== sha1.toLowerCase()) throw new Error(`SHA1 no coincide: ${url}`)
  }
  writeFileSync(dest, buf)
  if (sha1) rememberSha1(dest, sha1)
  return true
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await httpRequest(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return readJson<T>(res, url)
}
