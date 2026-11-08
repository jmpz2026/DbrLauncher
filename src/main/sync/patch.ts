import { createHash } from 'crypto'
import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, writeSync } from 'fs'
import { CONFIG } from '../../shared/config'
import { httpRequest, isAbortError } from '../http'
import { rememberSha1, sha1FileCached } from './hash'

// Parches delta de los jars grandes del modpack (formato DBRP1). Un jar cambia muy poco entre
// versiones (~3 MB de 47) y cada entrada del zip va comprimida por separado: las que no cambian
// tienen los mismos bytes. La Action de la rama assets (.github/scripts/make-patches.mjs) sube
// `<sha1viejo>-<sha1nuevo>.dbrpatch` al release assets-files; aplicarlo al jar viejo da el nuevo
// idéntico byte a byte. El mismo formato lo aplica DbrPatch.kt en Android.
//
// Formato (enteros big-endian): "DBRP", versión 1 (1 byte), sha1 del resultado (20 bytes),
// tamaño del resultado (int64); luego ops hasta el final: 1 COPY(offset int64, len int64) del
// archivo viejo | 2 DATA(len int64, bytes).

/** Jars desde este tamaño se intentan actualizar con parche (mismo umbral que make-patches.mjs). */
export const PATCH_MIN_SIZE = 5 * 1024 * 1024

const OP_COPY = 1
const OP_DATA = 2

/** Nombre del jar sin versión, para emparejar versiones: mods/DbrServerPack-5.5.0.jar -> mods/dbrserverpack. */
export function modKey(path: string): string {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash) : ''
  const name = path.slice(slash + 1)
  const m = /^(.+?)[-_ ]v?\d[^/]*\.jar$/i.exec(name)
  return `${dir}/${(m ? m[1] : name).toLowerCase()}`
}

/**
 * Escribe en `outPath` el resultado de aplicar `patch` a `oldPath`. Lanza si el parche está mal
 * formado o el resultado no casa con el sha1/tamaño que declara (y entonces borra `outPath`).
 */
function applyPatch(oldPath: string, patch: Buffer, outPath: string): void {
  if (patch.length < 33 || patch.toString('ascii', 0, 4) !== 'DBRP' || patch.readUInt8(4) !== 1) {
    throw new Error('Parche no válido')
  }
  const expectedSha = patch.subarray(5, 25).toString('hex')
  const size = Number(patch.readBigInt64BE(25))
  const hash = createHash('sha1')
  const oldFd = openSync(oldPath, 'r')
  let outFd: number
  try {
    outFd = openSync(outPath, 'w')
  } catch (e) {
    closeSync(oldFd) // sin esto el jar viejo quedaba abierto y en Windows no se podía borrar
    throw e
  }
  let written = 0
  const emit = (buf: Buffer): void => {
    written += buf.length
    if (written > size) throw new Error('Parche más largo de lo que declara')
    writeSync(outFd, buf)
    hash.update(buf)
  }
  try {
    const chunk = Buffer.alloc(1 << 16)
    let p = 33
    while (p < patch.length) {
      const op = patch.readUInt8(p)
      if (op === OP_COPY) {
        let off = Number(patch.readBigInt64BE(p + 1))
        let len = Number(patch.readBigInt64BE(p + 9))
        p += 17
        while (len > 0) {
          const n = readSync(oldFd, chunk, 0, Math.min(len, chunk.length), off)
          if (n <= 0) throw new Error('COPY fuera del archivo viejo')
          emit(chunk.subarray(0, n))
          off += n
          len -= n
        }
      } else if (op === OP_DATA) {
        const len = Number(patch.readBigInt64BE(p + 1))
        if (p + 9 + len > patch.length) throw new Error('Parche cortado')
        emit(patch.subarray(p + 9, p + 9 + len))
        p += 9 + len
      } else {
        throw new Error(`Op desconocida en el parche: ${op}`)
      }
    }
    if (written !== size) throw new Error(`Tamaño del resultado: ${written}, esperado ${size}`)
    if (hash.digest('hex') !== expectedSha) throw new Error('sha1 del resultado no coincide')
  } catch (e) {
    closeSync(outFd)
    rmSync(outPath, { force: true })
    throw e
  } finally {
    closeSync(oldFd)
  }
  closeSync(outFd)
}

/**
 * Intenta reconstruir `dest` (sha1 `newSha`) desde alguna versión vieja del mismo jar en
 * `candidates` y un parche del release. Devuelve false si no hay parche para ninguna o algo
 * falla: entonces hay que bajar el jar completo. `onProgress` recibe los bytes del parche.
 */
export async function tryPatch(
  dest: string,
  newSha: string,
  candidates: string[],
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal
): Promise<boolean> {
  for (const old of new Set(candidates)) {
    if (!existsSync(old)) continue
    try {
      const oldSha = await sha1FileCached(old)
      if (oldSha === newSha) continue
      const res = await httpRequest(`${CONFIG.assetMirrorBase}${oldSha}-${newSha}.dbrpatch`, { onProgress, signal })
      if (!res.ok) continue // 404: no hay parche para esta pareja de versiones
      const out = `${dest}.${newSha.slice(0, 8)}.patched`
      applyPatch(old, res.body, out)
      rmSync(dest, { force: true })
      renameSync(out, dest)
      rememberSha1(dest, newSha)
      return true
    } catch (e) {
      if (isAbortError(e)) throw e
      console.warn(`[sync] parche de ${dest} falló, se baja completo:`, e)
    }
  }
  return false
}
