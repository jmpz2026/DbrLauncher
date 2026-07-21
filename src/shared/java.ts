// Tipos del runtime de Java gestionado por el launcher.

export interface JavaInfo {
  path: string // ruta al ejecutable java/java.exe
  version: string // ej. "1.8.0_412"
  os: string
  arch: string
}

export interface JavaProgress {
  phase: 'download' | 'extract' | 'verify'
  percent?: number // solo en 'download'
}

export type JavaResult = { ok: true; info: JavaInfo } | { ok: false; error: string }
