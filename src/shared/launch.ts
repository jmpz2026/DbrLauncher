// Tipos del lanzador de Minecraft/Forge.

export type LaunchPhase =
  | 'version'
  | 'libraries'
  | 'natives'
  | 'assets'
  | 'client'
  | 'launching'
  | 'running'

export interface LaunchProgress {
  phase: LaunchPhase
  percent?: number // 0-100 en fases con conteo
  detail?: string // archivo/acción en curso
}

export type LaunchState = 'idle' | 'preparing' | 'running' | 'exited' | 'error'

export interface LaunchStatus {
  state: LaunchState
  code?: number // código de salida del proceso
  error?: string
}

export type LaunchResult = { ok: true } | { ok: false; error: string }
