import type { Artifact, Library, Rule } from './version'

/** Nombre de SO según el esquema de los JSON de Minecraft. */
export function osName(platform: string = process.platform): 'windows' | 'osx' | 'linux' {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'osx'
  return 'linux'
}

/** '64' o '32' para sustituir ${arch} en clasificadores de natives. */
export function archBits(arch: string = process.arch): '64' | '32' {
  return arch === 'x64' || arch === 'arm64' ? '64' : '32'
}

/** Evalúa las reglas allow/disallow de una librería para el SO actual. */
export function rulesAllow(rules: Rule[] | undefined, platform: string = process.platform): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const r of rules) {
    const matches = !r.os?.name || r.os.name === osName(platform)
    if (matches) allowed = r.action === 'allow'
  }
  return allowed
}

/** Clave de classifier de natives para el SO actual, con ${arch} resuelto. Null si no aplica. */
export function nativeClassifier(
  lib: Library,
  platform: string = process.platform,
  arch: string = process.arch
): string | null {
  const key = lib.natives?.[osName(platform)]
  if (!key) return null
  return key.replace('${arch}', archBits(arch))
}

/** Convierte un nombre maven (group:artifact:version[:classifier]) en ruta relativa de jar. */
export function mavenToPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':')
  const file = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}

const DEFAULT_MAVEN = 'https://libraries.minecraft.net/'

/** Artefacto principal (no-native) de una librería: ruta relativa + URL de descarga. */
export function resolveArtifact(lib: Library): Artifact & { path: string } {
  const path = lib.downloads?.artifact?.path ?? mavenToPath(lib.name)
  const url = lib.downloads?.artifact?.url ?? (lib.url ?? DEFAULT_MAVEN) + mavenToPath(lib.name)
  return { path, url, sha1: lib.downloads?.artifact?.sha1, size: lib.downloads?.artifact?.size }
}

/** Artefacto de natives para el SO actual (con extract.exclude), o null. */
export function resolveNative(
  lib: Library,
  platform: string = process.platform,
  arch: string = process.arch
): (Artifact & { path: string; exclude: string[] }) | null {
  const classifier = nativeClassifier(lib, platform, arch)
  if (!classifier) return null
  const dl = lib.downloads?.classifiers?.[classifier]
  const nameWithClassifier = `${lib.name}:${classifier}`
  const path = dl?.path ?? mavenToPath(nameWithClassifier)
  const url = dl?.url ?? (lib.url ?? DEFAULT_MAVEN) + mavenToPath(nameWithClassifier)
  return { path, url, sha1: dl?.sha1, size: dl?.size, exclude: lib.extract?.exclude ?? [] }
}
