import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, type LauncherSettings } from '../../shared/settings'

const filePath = (): string => join(app.getPath('userData'), 'settings.json')
let cache: LauncherSettings | null = null

export function loadSettings(): LauncherSettings {
  if (cache) return cache
  try {
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(filePath(), 'utf-8')) as object) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
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
