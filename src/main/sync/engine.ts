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
  const toDownload: ManifestFile[] = []
  for (let i = 0; i < manifest.files.length; i++) {
    const f = manifest.files[i]
    onProgress({ phase: 'check', file: f.path, done: i, total: manifest.files.length })
    const dest = safeJoin(gameDir, f.path)
    let needs = true
    if (existsSync(dest)) {
      needs = f.sha1 ? (await sha1File(dest)).toLowerCase() !== f.sha1.toLowerCase() : false
    }
    if (needs) toDownload.push(f)
  }

  // 2) Determinar archivos obsoletos: gestionados antes pero ya no en el manifest.
  const wantedPaths = new Set(manifest.files.map((f) => f.path))
  const toDelete = loadManaged(managedFile).filter((p) => !wantedPaths.has(p))

  const total = toDownload.length + toDelete.length
  let done = 0

  // 3) Descargar.
  for (const f of toDownload) {
    onProgress({ phase: 'download', file: f.path, done, total })
    await ensureFile(safeJoin(gameDir, f.path), f.url, f.sha1)
    done++
  }

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
