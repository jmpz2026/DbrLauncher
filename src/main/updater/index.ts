import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../../shared/update'

const { autoUpdater } = electronUpdater

/**
 * Configura electron-updater (GitHub Releases) y reenvía su progreso al renderer.
 * Solo actúa en la app empaquetada; en dev no hace nada (no hay metadatos de update).
 */
export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  const send = (s: UpdateStatus): void => {
    getWindow()?.webContents.send('update:status', s)
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => send({ state: 'error', error: e.message }))

  ipcMain.handle('update:check', async (): Promise<void> => {
    if (!app.isPackaged) {
      send({ state: 'none' })
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* el evento 'error' ya informa */
    }
  })

  ipcMain.handle('update:install', (): void => autoUpdater.quitAndInstall())

  // Chequeo automático al arrancar (solo en la app instalada).
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {})
  }
}
