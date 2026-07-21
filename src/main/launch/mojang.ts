import { CONFIG } from '../../shared/config'
import { fetchJson } from '../net'
import type { VersionJson } from './version'

const VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestIndex {
  versions: { id: string; url: string }[]
}

/** Descarga el JSON de versión vanilla desde el manifest oficial de Mojang. */
export async function fetchVanilla(id: string): Promise<VersionJson> {
  const index = await fetchJson<ManifestIndex>(VERSION_MANIFEST)
  const entry = index.versions.find((v) => v.id === id)
  if (!entry) throw new Error(`La versión ${id} no está en el manifest de Mojang.`)
  return fetchJson<VersionJson>(entry.url)
}

/** Descarga el overlay de Forge (JSON con inheritsFrom) desde el repo del modpack. */
export async function fetchForge(): Promise<VersionJson> {
  return fetchJson<VersionJson>(CONFIG.forgeJsonUrl)
}
