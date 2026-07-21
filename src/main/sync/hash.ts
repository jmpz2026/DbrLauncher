import { createHash } from 'crypto'
import { createReadStream } from 'fs'

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
