import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, normalize, sep } from 'path'
import type { ManifestFile, SyncProgress, SyncSummary } from '../../shared/sync'
import { sha1File } from './hash'
import { fetchManifest } from './manifest'
import { ensureFile } from '../net'

export interface SyncOptions {
  gameDir: string // dónde viven los mods/configs
  managedFile: string // índice JSON de archivos gestionados
  manifestUrl: string
}

type OnProgress = (p: SyncProgress) => void

// Nº de descargas/verificaciones simultáneas. Igual criterio que installAssets:
// en serie son decenas de archivos uno a uno = lentísimo en el primer install.
const CONCURRENCY = 8

/** Corre `task` sobre `items` con un pool acotado de workers. Preserva el orden de entrada. */
async function pool<T>(items: T[], limit: number, task: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      await task(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

function loadManaged(managedFile: string): string[] {
  try {
    const j = JSON.parse(readFileSync(managedFile, 'utf-8')) as { files?: unknown }
    return Array.isArray(j.files) ? (j.files as string[]) : []
  } catch {
    return []
  }
}

function saveManaged(managedFile: string, files: string[]): void {
  writeFileSync(managedFile, JSON.stringify({ files }), 'utf-8')
}

/** Une base + ruta relativa impidiendo path traversal (`..`, rutas absolutas). */
export function safeJoin(base: string, rel: string): string {
  const target = normalize(join(base, rel))
  const root = normalize(base.endsWith(sep) ? base : base + sep)
  if (!target.startsWith(root)) throw new Error(`Ruta insegura en manifest: ${rel}`)
  return target
}

/** Sincroniza los archivos locales con el manifest. Reporta progreso por callback. */
export async function runSync(opts: SyncOptions, onProgress: OnProgress): Promise<SyncSummary> {
  const { gameDir, managedFile, manifestUrl } = opts
  const manifest = await fetchManifest(manifestUrl)
  mkdirSync(gameDir, { recursive: true })

  // 1) Comprobar qué archivos hay que descargar (faltan o SHA1 distinto).
  // El sha1 en disco se calcula en paralelo: es I/O + CPU, en serie tarda en modpacks grandes.
  const checkTotal = manifest.files.length
  const needed: boolean[] = new Array(checkTotal).fill(false)
  let checked = 0
  await pool(manifest.files, CONCURRENCY, async (f, i) => {
    const dest = safeJoin(gameDir, f.path)
    let needs = true
    if (existsSync(dest)) {
      needs = f.sha1 ? (await sha1File(dest)).toLowerCase() !== f.sha1.toLowerCase() : false
    }
    needed[i] = needs
    onProgress({ phase: 'check', file: f.path, done: ++checked, total: checkTotal })
  })
  const toDownload: ManifestFile[] = manifest.files.filter((_, i) => needed[i])

  // 2) Determinar archivos obsoletos: gestionados antes pero ya no en el manifest.
  const wantedPaths = new Set(manifest.files.map((f) => f.path))
  const toDelete = loadManaged(managedFile).filter((p) => !wantedPaths.has(p))

  const total = toDownload.length + toDelete.length
  let done = 0

  // 3) Descargar en paralelo (pool acotado). `done` es un contador compartido: como JS es
  // monohilo entre awaits, el ++ no compite; solo la barra ve el orden de finalización.
  await pool(toDownload, CONCURRENCY, async (f) => {
    await ensureFile(safeJoin(gameDir, f.path), f.url, f.sha1)
    onProgress({ phase: 'download', file: f.path, done: ++done, total })
  })

  // 4) Borrar obsoletos.
  for (const p of toDelete) {
    onProgress({ phase: 'delete', file: p, done, total })
    try {
      rmSync(safeJoin(gameDir, p))
    } catch {
      /* si ya no existe, no pasa nada */
    }
    done++
  }

  saveManaged(managedFile, [...wantedPaths])
  onProgress({ phase: 'done', file: '', done: total, total })
  return { updated: toDownload.length, removed: toDelete.length, version: manifest.version }
}
