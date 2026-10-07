import { createHash } from 'crypto'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** SHA1 en hex de un archivo, leyendo en streaming (no carga todo en memoria). */
export function sha1File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

// Caché de hashes por (tamaño, mtime). Antes cada launch releía y hasheaba los ~300 MB de
// mods/config y las librerías: en HDD, o con el antivirus escaneando cada lectura, eso solo
// ya eran decenas de segundos. Si el archivo no cambió de tamaño ni de fecha, su sha1 tampoco.
interface Entry {
  size: number
  mtimeMs: number
  sha1: string
}

let cache: Map<string, Entry> | null = null
let dirty = false

const cacheFile = (): string => join(app.getPath('userData'), 'hash-cache.json')

function load(): Map<string, Entry> {
  if (cache) return cache
  cache = new Map()
  try {
    if (existsSync(cacheFile())) {
      const raw = JSON.parse(readFileSync(cacheFile(), 'utf-8')) as Record<string, Entry>
      for (const [k, v] of Object.entries(raw)) cache.set(k, v)
    }
  } catch {
    /* caché corrupta: se rehace desde cero */
  }
  return cache
}

/** sha1File con caché: solo lee el archivo si cambió su tamaño o su mtime. */
export async function sha1FileCached(filePath: string): Promise<string> {
  const st = statSync(filePath)
  const map = load()
  const hit = map.get(filePath)
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.sha1
  const sha1 = (await sha1File(filePath)).toLowerCase()
  map.set(filePath, { size: st.size, mtimeMs: st.mtimeMs, sha1 })
  dirty = true
  return sha1
}

/** Registra el sha1 de un archivo recién escrito (ya verificado), sin volver a leerlo. */
export function rememberSha1(filePath: string, sha1: string): void {
  const st = statSync(filePath)
  load().set(filePath, { size: st.size, mtimeMs: st.mtimeMs, sha1: sha1.toLowerCase() })
  dirty = true
}

/** Persiste la caché si hubo cambios. Llamar al terminar la sync y la preparación del launch. */
export function flushHashCache(): void {
  if (!dirty || !cache) return
  try {
    const out: Record<string, Entry> = {}
    for (const [k, v] of cache) if (existsSync(k)) out[k] = v
    writeFileSync(cacheFile(), JSON.stringify(out))
    dirty = false
  } catch {
    /* sin caché el próximo launch solo vuelve a hashear */
  }
}
