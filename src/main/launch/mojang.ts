import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { CONFIG } from '../../shared/config'
import { fetchJson } from '../net'
import { readJson } from '../http'
import { fetchMeta } from '../meta'
import { versionsDir } from './paths'
import type { VersionJson } from './version'

const VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestIndex {
  versions: { id: string; url: string }[]
}

function readCached(file: string): VersionJson | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as VersionJson) : null
  } catch {
    return null
  }
}

function writeCached(file: string, v: VersionJson): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(v))
  } catch {
    /* sin caché solo se vuelve a bajar */
  }
}

/**
 * JSON de versión vanilla. Una versión publicada de Mojang no cambia nunca, así que tras la
 * primera descarga se lee del disco: dos peticiones menos (y dos puntos de cuelgue menos) en
 * cada launch.
 */
export async function fetchVanilla(id: string): Promise<VersionJson> {
  const file = join(versionsDir(), id, `${id}.json`)
  const cached = readCached(file)
  if (cached) return cached
  const index = await fetchJson<ManifestIndex>(VERSION_MANIFEST)
  const entry = index.versions.find((v) => v.id === id)
  if (!entry) throw new Error(`La versión ${id} no está en el manifest de Mojang.`)
  const v = await fetchJson<VersionJson>(entry.url)
  writeCached(file, v)
  return v
}

/**
 * Overlay de Forge (JSON con inheritsFrom) desde el repo del modpack. Este sí puede cambiar,
 * así que se pide siempre; la copia en disco solo se usa si la red falla.
 */
export async function fetchForge(): Promise<VersionJson> {
  const file = join(versionsDir(), 'forge-overlay.json')
  try {
    // Hay copia en disco de reserva: pocos reintentos, que la red caída no retrase el launch.
    // Primero el mirror R2 firmado; si no, raw.
    const { res } = await fetchMeta('forge-1.7.10.json', CONFIG.forgeJsonUrl)
    if (!res.ok) throw new Error(`GET ${CONFIG.forgeJsonUrl} -> ${res.status}`)
    const v = readJson<VersionJson>(res, CONFIG.forgeJsonUrl)
    writeCached(file, v)
    return v
  } catch (e) {
    const cached = readCached(file)
    if (cached) return cached
    throw e
  }
}
