export interface JrePlatform {
  os: 'windows' | 'mac' | 'linux'
  arch: 'x64' | 'aarch64'
  ext: 'zip' | 'tar.gz'
}

/**
 * Plataforma para pedir el JRE 8 a Adoptium.
 * Nota 1.7.10: usa LWJGL 2. El launcher se distribuye solo en 64-bit, así que se usa
 * **x64 por defecto**. En Mac (incluido Apple Silicon) también x64 (corre vía Rosetta);
 * no hay build aarch64 usable de Java 8 para este juego.
 */
export function currentPlatform(): JrePlatform {
  const os: JrePlatform['os'] =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'

  const arch: JrePlatform['arch'] =
    os === 'linux' && process.arch === 'arm64' ? 'aarch64' : 'x64'

  return { os, arch, ext: os === 'windows' ? 'zip' : 'tar.gz' }
}

/** URL de descarga directa del JRE 8 más reciente (Temurin/Eclipse) para la plataforma. */
export function adoptiumUrl(pl: JrePlatform): string {
  return `https://api.adoptium.net/v3/binary/latest/8/ga/${pl.os}/${pl.arch}/jre/hotspot/normal/eclipse`
}
