// Variante del modpack a sincronizar (comparten Forge/MC, distinto set de mods).
export type ModpackVariant = 'full' | 'lite'

// Ajustes del launcher (persistidos en userData/settings.json).
export interface LauncherSettings {
  ramGb: number
  width: number
  height: number
  fullscreen: boolean
  jvmArgs: string // argumentos JVM extra separados por espacios
  jvmArgsMigrated: boolean // true tras aplicar (una vez) los flags GC por defecto a usuarios viejos
  modpackVariant: ModpackVariant // 'full' (por defecto) | 'lite'
  autoSyncMods: boolean // sincronizar/actualizar mods al dar Jugar (por defecto true)
}

/**
 * Flags GC por defecto (los mismos que el launcher oficial de Mojang para Java 8 / G1).
 * Dan FPS más suave (menos tirones), no más FPS máximos. Buen punto de partida seguro.
 */
export const DEFAULT_JVM_ARGS =
  '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 ' +
  '-XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M'

export const DEFAULT_SETTINGS: LauncherSettings = {
  ramGb: 3,
  width: 854,
  height: 480,
  fullscreen: false,
  jvmArgs: DEFAULT_JVM_ARGS,
  jvmArgsMigrated: false,
  modpackVariant: 'full',
  autoSyncMods: true
}

/** RAM mínima asignable al juego (GB). */
export const MIN_RAM_GB = 2

/** RAM (GB) que se reserva para el SO al calcular el máximo asignable al juego. */
export const RAM_HEADROOM_GB = 2

/** Límites de RAM calculados según la memoria física del equipo (main → renderer). */
export interface RamLimits {
  totalGb: number
  maxGb: number
}
