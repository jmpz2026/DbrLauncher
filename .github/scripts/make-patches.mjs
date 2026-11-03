// Parches delta de los jars grandes del modpack (formato DBRP1). Entre versiones de
// DbrServerPack cambian ~1-2 MB de 47: cada entrada del zip va comprimida por separado, así que
// las que no cambian tienen los mismos bytes en el jar viejo y en el nuevo. El parche guarda lo
// nuevo y referencias al jar viejo para el resto; el launcher lo aplica y obtiene el jar nuevo
// idéntico byte a byte (lo comprueba con el sha1 del manifest).
//
// Formato (enteros big-endian), lo aplica DbrPatch.kt en Android:
//   "DBRP", versión 1 (1 byte), sha1 del resultado (20 bytes), tamaño del resultado (int64)
//   ops hasta el final: 1 COPY(offset int64, len int64) del jar viejo | 2 DATA(len int64, bytes)
//
// Uso: como módulo desde mirror-assets.mjs, o a mano para probar:
//   node make-patches.mjs viejo.jar nuevo.jar salida.dbrpatch

import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'

const OP_COPY = 1
const OP_DATA = 2

/** Jars desde este tamaño llevan parche (mismo umbral que PATCH_MIN_SIZE en DbrSync.kt). */
export const PATCH_MIN_SIZE = 5 * 1024 * 1024

export const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

/** Nombre del jar sin versión, para emparejar versiones: mods/DbrServerPack-5.5.0.jar -> mods/dbrserverpack. */
export function modKey(path) {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash) : ''
  const name = path.slice(slash + 1)
  const m = /^(.+?)[-_ ]v?\d[^/]*\.jar$/i.exec(name)
  return `${dir}/${(m ? m[1] : name).toLowerCase()}`
}

/**
 * Registros locales del zip: [{ start, dataStart, dataEnd, end, key }] en orden de offset, más
 * cdStart (inicio del directorio central). null si no es un zip que sepamos leer (zip64, etc.).
 */
function readZip(buf) {
  const minEocd = Math.max(0, buf.length - 22 - 0xffff)
  let eocd = -1
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const count = buf.readUInt16LE(eocd + 10)
  const cdStart = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdStart === 0xffffffff) return null

  const entries = []
  let p = cdStart
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null
    const crc = buf.readUInt32LE(p + 16)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    if (csize === 0xffffffff || local === 0xffffffff) return null
    entries.push({ start: local, crc, csize })
    p += 46 + nameLen + extraLen + commentLen
  }
  entries.sort((a, b) => a.start - b.start)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (buf.readUInt32LE(e.start) !== 0x04034b50) return null
    e.dataStart = e.start + 30 + buf.readUInt16LE(e.start + 26) + buf.readUInt16LE(e.start + 28)
    e.dataEnd = e.dataStart + e.csize
    e.end = i + 1 < entries.length ? entries[i + 1].start : cdStart
    if (e.dataEnd > e.end) return null
    e.key = `${e.crc}:${e.csize}`
  }
  return { entries, cdStart }
}

/** Parche de oldBuf a newBuf, o null si alguno no es un zip legible. */
export function makePatch(oldBuf, newBuf) {
  const oldZip = readZip(oldBuf)
  const newZip = readZip(newBuf)
  if (!oldZip || !newZip) return null

  const byKey = new Map()
  for (const e of oldZip.entries) {
    if (!byKey.has(e.key)) byKey.set(e.key, [])
    byKey.get(e.key).push(e)
  }

  // Ops sobre el archivo nuevo, fusionando COPY contiguos y DATA contiguos.
  const ops = []
  const copy = (off, len) => {
    if (len <= 0) return
    const last = ops[ops.length - 1]
    if (last?.op === OP_COPY && last.off + last.len === off) last.len += len
    else ops.push({ op: OP_COPY, off, len })
  }
  const data = (start, end) => {
    if (end <= start) return
    const last = ops[ops.length - 1]
    if (last?.op === OP_DATA && last.end === start) last.end = end
    else ops.push({ op: OP_DATA, start, end })
  }

  let pos = 0
  for (const e of newZip.entries) {
    data(pos, e.start)
    const len = e.dataEnd - e.dataStart
    const match = (byKey.get(e.key) ?? []).find((o) =>
      oldBuf.subarray(o.dataStart, o.dataEnd).equals(newBuf.subarray(e.dataStart, e.dataEnd)))
    if (match && len > 0) {
      // La cabecera local cambia si cambió la fecha de la entrada; los datos no.
      const headerSame = oldBuf.subarray(match.start, match.dataStart).equals(newBuf.subarray(e.start, e.dataStart))
      if (headerSame) copy(match.start, match.dataEnd - match.start)
      else {
        data(e.start, e.dataStart)
        copy(match.dataStart, len)
      }
      data(e.dataEnd, e.end)
    } else {
      data(e.start, e.end)
    }
    pos = e.end
  }
  data(pos, newBuf.length) // directorio central + EOCD

  const parts = []
  const head = Buffer.alloc(4 + 1 + 20 + 8)
  head.write('DBRP', 0, 'ascii')
  head.writeUInt8(1, 4)
  Buffer.from(sha1(newBuf), 'hex').copy(head, 5)
  head.writeBigInt64BE(BigInt(newBuf.length), 25)
  parts.push(head)
  for (const o of ops) {
    if (o.op === OP_COPY) {
      const b = Buffer.alloc(17)
      b.writeUInt8(OP_COPY, 0)
      b.writeBigInt64BE(BigInt(o.off), 1)
      b.writeBigInt64BE(BigInt(o.len), 9)
      parts.push(b)
    } else {
      const b = Buffer.alloc(9)
      b.writeUInt8(OP_DATA, 0)
      b.writeBigInt64BE(BigInt(o.end - o.start), 1)
      parts.push(b, newBuf.subarray(o.start, o.end))
    }
  }
  return Buffer.concat(parts)
}

/** Aplica un parche (para comprobarlo antes de subirlo). Lanza si no casa. */
export function applyPatch(oldBuf, patch) {
  if (patch.toString('ascii', 0, 4) !== 'DBRP' || patch.readUInt8(4) !== 1) throw new Error('Parche no válido')
  const expectedSha = patch.subarray(5, 25).toString('hex')
  const size = Number(patch.readBigInt64BE(25))
  const out = Buffer.alloc(size)
  let w = 0
  let p = 33
  while (p < patch.length) {
    const op = patch.readUInt8(p)
    if (op === OP_COPY) {
      const off = Number(patch.readBigInt64BE(p + 1))
      const len = Number(patch.readBigInt64BE(p + 9))
      w += oldBuf.copy(out, w, off, off + len)
      p += 17
    } else if (op === OP_DATA) {
      const len = Number(patch.readBigInt64BE(p + 1))
      w += patch.copy(out, w, p + 9, p + 9 + len)
      p += 9 + len
    } else throw new Error(`Op desconocida: ${op}`)
  }
  if (w !== size || sha1(out) !== expectedSha) throw new Error('El parche no reconstruye el archivo')
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [oldPath, newPath, outPath] = process.argv.slice(2)
  const oldBuf = readFileSync(oldPath)
  const newBuf = readFileSync(newPath)
  const patch = makePatch(oldBuf, newBuf)
  if (!patch) throw new Error('No es un zip legible')
  applyPatch(oldBuf, patch)
  writeFileSync(outPath, patch)
  console.log(`${newBuf.length} -> ${patch.length} bytes (${((patch.length * 100) / newBuf.length).toFixed(1)} %)`)
}
