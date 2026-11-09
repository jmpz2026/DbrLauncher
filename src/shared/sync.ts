// Tipos del motor de sincronización de archivos del modpack.

export interface ManifestFile {
  path: string // relativa al directorio del juego (ej. "mods/JRMCore.jar")
  url: string // URL de descarga directa
  sha1: string // hash esperado (hex) para verificar/decidir descarga
  size?: number
  // Archivo de "siembra": se descarga solo si NO existe en el equipo (config del jugador,
  // p.ej. options.txt). No se re-descarga aunque cambie el sha1 ni se borra al quedar
  // fuera del manifest. Se marca con el archivo `.dbr-once` del repo de assets.
  once?: boolean
}

export interface Manifest {
  version: string // versión del modpack
  minecraft?: string
  forge?: string
  files: ManifestFile[]
  // Bases de descarga por sha1, en orden (`<base><sha1>`). Si falta, CONFIG.assetBases.
  // Las escribe gen-manifest; cambiar de CDN no necesita una versión nueva del launcher.
  mirrors?: string[]
}

export type SyncPhase = 'check' | 'download' | 'delete' | 'done'

export interface SyncProgress {
  phase: SyncPhase
  file: string // ruta del archivo en curso ('' en 'done')
  done: number
  total: number
  // Solo en 'download': cuántos archivos siguen bajando además de `file`, y el avance en bytes.
  // Contar archivos terminados deja la barra quieta mientras bajan los jars grandes.
  inFlight?: number
  bytesDone?: number
  bytesTotal?: number // 0 si algún archivo del manifest no trae `size`
  // Todas las fuentes dieron 403/429: segundos que faltan para el último intento.
  blockedSecs?: number
}

export interface SyncSummary {
  updated: number // archivos descargados/actualizados
  removed: number // archivos obsoletos eliminados
  version: string
}

// cancelled: el jugador paró la sync; no es un error que mostrar.
export type SyncResult = { ok: true; summary: SyncSummary } | { ok: false; error: string; cancelled?: boolean }
