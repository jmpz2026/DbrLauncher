import { join } from 'path'
import type { LaunchProgress } from '../../shared/launch'
import { extractArchive } from '../java/install'
import type { Library } from './version'
import { resolveArtifact, resolveNative, rulesAllow } from './resolve'
import { ensureFile } from '../net'

type OnProgress = (p: LaunchProgress) => void

/**
 * Descarga las librerías aplicables (según reglas de SO), extrae los natives al
 * nativesDir y devuelve el classpath (rutas absolutas de los jars).
 */
export async function installLibraries(
  libs: Library[],
  librariesDir: string,
  nativesDir: string,
  onProgress: OnProgress
): Promise<string[]> {
  const applicable = libs.filter((l) => rulesAllow(l.rules))
  const classpath: string[] = []

  for (let i = 0; i < applicable.length; i++) {
    const lib = applicable[i]
    onProgress({
      phase: 'libraries',
      percent: Math.round(((i + 1) / applicable.length) * 100),
      detail: lib.name
    })

    // Natives: descargar el jar del classifier y extraerlo al nativesDir.
    const native = resolveNative(lib)
    if (native) {
      const nativeJar = join(librariesDir, native.path)
      await ensureFile(nativeJar, native.url, native.sha1)
      await extractArchive(nativeJar, nativesDir, native.exclude)
    }

    // Artefacto principal: presente si tiene downloads.artifact o si no es una lib solo-natives.
    const hasArtifact = !!lib.downloads?.artifact || !lib.natives
    if (hasArtifact) {
      const art = resolveArtifact(lib)
      const dest = join(librariesDir, art.path)
      await ensureFile(dest, art.url, art.sha1)
      classpath.push(dest)
    }
  }

  return classpath
}
