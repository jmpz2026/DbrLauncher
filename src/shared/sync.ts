// Tipos del motor de sincronización de archivos del modpack.

export interface ManifestFile {
  path: string // relativa al directorio del juego (ej. "mods/JRMCore.jar")
  url: string // URL de descarga directa
  sha1: string // hash esperado (hex) para verificar/decidir descarga
  size?: number
}

export interface Manifest {
  version: string // versión del modpack
  minecraft?: string
  forge?: string
  files: ManifestFile[]
}

export type SyncPhase = 'check' | 'download' | 'delete' | 'done'

export interface SyncProgress {
  phase: SyncPhase
  file: string // ruta del archivo en curso ('' en 'done')
  done: number
  total: number
}

export interface SyncSummary {
  updated: number // archivos descargados/actualizados
  removed: number // archivos obsoletos eliminados
  version: string
}

export type SyncResult = { ok: true; summary: SyncSummary } | { ok: false; error: string }
