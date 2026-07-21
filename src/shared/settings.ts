// Ajustes del launcher (persistidos en userData/settings.json).
export interface LauncherSettings {
  ramGb: number
  width: number
  height: number
  fullscreen: boolean
  jvmArgs: string // argumentos JVM extra separados por espacios
}

export const DEFAULT_SETTINGS: LauncherSettings = {
  ramGb: 4,
  width: 854,
  height: 480,
  fullscreen: false,
  jvmArgs: ''
}
