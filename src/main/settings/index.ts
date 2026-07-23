import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { totalmem } from 'os'
import { join } from 'path'
import {
  DEFAULT_JVM_ARGS,
  DEFAULT_SETTINGS,
  MIN_RAM_GB,
  RAM_HEADROOM_GB,
  type LauncherSettings,
  type RamLimits
} from '../../shared/settings'

const filePath = (): string => join(app.getPath('userData'), 'settings.json')
let cache: LauncherSettings | null = null

/** RAM física total (GB, redondeada hacia abajo). */
export function totalRamGb(): number {
  return Math.floor(totalmem() / 1024 ** 3)
}

/**
 * RAM máxima asignable al juego: deja RAM_HEADROOM_GB libres para el SO. Nunca menos de
 * MIN_RAM_GB (para no dejar el slider en cero en equipos muy justos) ni más de 16.
 */
export function maxRamGb(): number {
  return Math.min(16, Math.max(MIN_RAM_GB, totalRamGb() - RAM_HEADROOM_GB))
}

export function ramLimits(): RamLimits {
  return { totalGb: totalRamGb(), maxGb: maxRamGb() }
}

export function loadSettings(): LauncherSettings {
  if (cache) return cache
  try {
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(filePath(), 'utf-8')) as object) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  // Migración única: a usuarios viejos (sin flag) que no tocaron los JVM args les ponemos
  // los flags GC por defecto una sola vez. Tras marcarse, un campo vacío ya se respeta.
  if (!cache.jvmArgsMigrated) {
    if (!cache.jvmArgs.trim()) cache.jvmArgs = DEFAULT_JVM_ARGS
    cache.jvmArgsMigrated = true
    try {
      writeFileSync(filePath(), JSON.stringify(cache), 'utf-8')
    } catch {
      /* si no se puede persistir, se reintentará al siguiente arranque */
    }
  }
  // Nunca dejar que ramGb supere lo que el equipo puede dar (deja headroom al SO): un -Xmx
  // por encima de la RAM real causa thrashing y pantalla negra al cargar. Corrige en memoria
  // a los users que ya quedaron con un valor demasiado alto (p.ej. 4G en un equipo de 4GB).
  cache.ramGb = Math.min(Math.max(cache.ramGb, MIN_RAM_GB), maxRamGb())
  return cache
}

export function saveSettings(patch: Partial<LauncherSettings>): LauncherSettings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  writeFileSync(filePath(), JSON.stringify(next), 'utf-8')
  return next
}

export function registerSettings(): void {
  ipcMain.handle('settings:get', (): LauncherSettings => loadSettings())
  ipcMain.handle('settings:limits', (): RamLimits => ramLimits())
  ipcMain.handle('settings:set', (_e, patch: Partial<LauncherSettings>): LauncherSettings =>
    saveSettings(clampPatch(patch))
  )
}

/** Aplica el tope de RAM también al guardar, por si el patch llega con un valor fuera de rango. */
function clampPatch(patch: Partial<LauncherSettings>): Partial<LauncherSettings> {
  if (typeof patch.ramGb !== 'number') return patch
  return { ...patch, ramGb: Math.min(Math.max(patch.ramGb, MIN_RAM_GB), maxRamGb()) }
}
