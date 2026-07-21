import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { sha1File } from './sync/hash'

/** Descarga `url` a `dest` si falta o el sha1 no coincide. Devuelve true si descargó. */
export async function ensureFile(dest: string, url: string, sha1?: string): Promise<boolean> {
  if (existsSync(dest)) {
    if (!sha1) return false
    if ((await sha1File(dest)).toLowerCase() === sha1.toLowerCase()) return false
  }
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Descarga falló (${res.status}): ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (sha1) {
    const got = createHash('sha1').update(buf).digest('hex')
    if (got.toLowerCase() !== sha1.toLowerCase()) throw new Error(`SHA1 no coincide: ${url}`)
  }
  writeFileSync(dest, buf)
  return true
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return (await res.json()) as T
}
