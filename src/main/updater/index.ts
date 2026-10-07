import { app, ipcMain, type BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../../shared/update'

const { autoUpdater } = electronUpdater

/**
 * El .deb se instala con dpkg vía pkexec, que pide la contraseña del usuario. electron-builder
 * deja el tipo de paquete en resources/package-type (el AppImage no lo trae).
 */
function isDebInstall(): boolean {
  if (process.platform !== 'linux' || !app.isPackaged) return false
  try {
    return readFileSync(join(process.resourcesPath, 'package-type'), 'utf8').trim() === 'deb'
  } catch {
    return false
  }
}

/**
 * Configura electron-updater (GitHub Releases) y reenvía su progreso al renderer.
 * Solo actúa en la app empaquetada; en dev no hace nada (no hay metadatos de update).
 */
export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  const send = (s: UpdateStatus): void => {
    getWindow()?.webContents.send('update:status', s)
  }

  // Con .deb la instalación pide contraseña: no se lanza sola (ni al cerrar), espera al botón.
  const manual = isDebInstall()

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = !manual

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'ready', version: info.version, manual })
    if (manual) return
    // Opción B (forzado): instala y reinicia solo → el jugador siempre entra con la última
    // versión. El breve margen deja ver "Reiniciando…" en la pantalla de actualización.
    setTimeout(() => autoUpdater.quitAndInstall(), 2500)
  })
  // Un fallo al buscar/descargar updates NO debe alarmar al jugador (p.ej. sin red):
  // se registra en el log y no se muestra nada.
  autoUpdater.on('error', (e) => console.error('[updater]', e.message))

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

  // Devuelve false si la instalación falló (p.ej. el jugador canceló la contraseña); si sale
  // bien la app se cierra y se reinicia. quitAndInstall es síncrono y el diálogo de pkexec
  // bloquea el proceso principal: el margen deja pintar "Instalando…" antes.
  ipcMain.handle('update:install', async (): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 150))
    let failed = false
    const onError = (): void => {
      failed = true
    }
    autoUpdater.once('error', onError)
    autoUpdater.quitAndInstall()
    autoUpdater.removeListener('error', onError)
    return !failed
  })

  // Chequeo automático al arrancar (solo en la app instalada).
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {})
  }
}
