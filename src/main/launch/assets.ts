import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { LaunchProgress } from '../../shared/launch'
import type { AssetIndexRef } from './version'
import { ensureFile } from '../net'

const RESOURCES = 'https://resources.download.minecraft.net'
const CONCURRENCY = 12

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
}

/** Descarga el índice de assets y todos los objetos que falten (layout hasheado). */
export async function installAssets(
  ref: AssetIndexRef,
  assetsDir: string,
  onProgress: (p: LaunchProgress) => void
): Promise<void> {
  const indexPath = join(assetsDir, 'indexes', `${ref.id}.json`)
  await ensureFile(indexPath, ref.url, ref.sha1)

  const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as AssetIndex
  const objects = Object.values(index.objects)
  let next = 0
  let done = 0

  // Pool acotado: los assets se bajan en paralelo (miles de archivos en serie = lentísimo).
  const worker = async (): Promise<void> => {
    while (next < objects.length) {
      const { hash } = objects[next++]
      const sub = hash.slice(0, 2)
      const dest = join(assetsDir, 'objects', sub, hash)
      // Content-addressed: si ya existe, es correcto — no re-hashear ~150MB en cada arranque.
      if (!existsSync(dest)) await ensureFile(dest, `${RESOURCES}/${sub}/${hash}`, hash)
      done++
      if (done % 25 === 0 || done === objects.length) {
        onProgress({ phase: 'assets', percent: Math.round((done / objects.length) * 100) })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, objects.length) }, worker))
}
