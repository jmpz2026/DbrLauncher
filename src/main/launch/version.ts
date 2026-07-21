// Tipos y merge de los JSON de versión (vanilla + overlay de Forge vía inheritsFrom).

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
}

export interface Artifact {
  path?: string
  url: string
  sha1?: string
  size?: number
}

export interface Library {
  name: string // maven: group:artifact:version[:classifier]
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  natives?: Record<string, string> // os -> clave de classifier (ej. "natives-windows")
  rules?: Rule[]
  extract?: { exclude?: string[] }
  url?: string // base maven legacy (Forge) cuando no hay downloads
}

export interface AssetIndexRef {
  id: string
  url: string
  sha1?: string
  totalSize?: number
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  mainClass: string
  minecraftArguments?: string
  libraries: Library[]
  assetIndex?: AssetIndexRef
  assets?: string
  downloads?: { client?: Artifact }
}

/**
 * Fusiona un overlay (Forge) sobre la base (vanilla). El overlay manda en
 * mainClass/minecraftArguments; las librerías del overlay van **antes** (Forge
 * espera cargar launchwrapper/FML primero).
 */
export function mergeVersions(base: VersionJson, overlay: VersionJson): VersionJson {
  return {
    id: overlay.id,
    mainClass: overlay.mainClass || base.mainClass,
    minecraftArguments: overlay.minecraftArguments || base.minecraftArguments,
    libraries: [...overlay.libraries, ...base.libraries],
    assetIndex: base.assetIndex,
    assets: base.assets,
    downloads: base.downloads
  }
}
