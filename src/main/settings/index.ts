import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_JVM_ARGS, DEFAULT_SETTINGS, type LauncherSettings } from '../../shared/settings'

const filePath = (): string => join(app.getPath('userData'), 'settings.json')
let cache: LauncherSettings | null = null

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
  ipcMain.handle('settings:set', (_e, patch: Partial<LauncherSettings>): LauncherSettings =>
    saveSettings(patch)
  )
}
