import { inflateRaw } from 'zlib'
import { promisify } from 'util'

// Asíncrono: el inflate síncrono de los ~40 MB del JRE congelaba la ventana (el main
// process pinta la UI de Electron) durante varios segundos.
const inflateRawAsync = promisify(inflateRaw)
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { safeJoin } from '../util'

// Extractor de ZIP con Node puro (zlib). Se usa en lugar del `tar`/`bsdtar` del SO porque
// Windows solo trae `tar.exe` desde 10 build 1803 (2018); en PCs más viejos no existe y
// `spawn tar` falla con ENOENT. Los .zip (JRE Windows) y .jar (natives) son formato ZIP.

const EOCD_SIG = 0x06054b50 // End Of Central Directory
const CDH_SIG = 0x02014b50 // Central Directory Header

/** Busca la firma EOCD desde el final (el comentario final puede medir hasta 65535 bytes). */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

/** Mismo criterio que `tar --exclude`: patrón con '/' final = prefijo; si no, ruta exacta. */
function isExcluded(name: string, exclude: string[]): boolean {
  return exclude.some((e) =>
    e.endsWith('/') ? name.startsWith(e) : name === e || name.startsWith(`${e}/`)
  )
}

/**
 * Extrae un .zip/.jar a destDir sin depender de binarios del SO. `exclude` omite entradas
 * (patrones tipo manifest, p.ej. 'META-INF/'). Soporta stored (0) y deflate (8).
 */
export async function extractZip(archiveFile: string, destDir: string, exclude: string[] = []): Promise<void> {
  const buf = readFileSync(archiveFile)
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('ZIP inválido: no se encontró el End of Central Directory.')

  const count = buf.readUInt16LE(eocd + 10)
  if (count === 0xffff) throw new Error('ZIP inválido o ZIP64 no soportado.')
  let off = buf.readUInt32LE(eocd + 16) // offset del central directory

  mkdirSync(destDir, { recursive: true })

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CDH_SIG) throw new Error('ZIP inválido: central directory corrupto.')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const externalAttr = buf.readUInt32LE(off + 38)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    off += 46 + nameLen + extraLen + commentLen

    if (!name || isExcluded(name, exclude)) continue

    const dest = safeJoin(destDir, name)
    if (name.endsWith('/')) {
      mkdirSync(dest, { recursive: true })
      continue
    }

    // La cabecera local tiene sus PROPIOS name/extra lengths: definen dónde empiezan los datos.
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)

    let data: Buffer
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = await inflateRawAsync(raw)
    else throw new Error(`ZIP: método de compresión no soportado (${method}) en ${name}`)

    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, data)

    // Preservar permisos unix (bits altos de external attributes); en Windows es irrelevante.
    if (process.platform !== 'win32') {
      // 0o777: sin setuid/setgid/sticky, que un zip ajeno no tiene por qué poder pedir.
      const mode = (externalAttr >>> 16) & 0o777
      if (mode) chmodSync(dest, mode)
    }
  }
}
