import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerAuth } from './auth'
import { registerSync } from './sync'
import { registerJava } from './java'
import { registerLaunch } from './launch'
import { registerSettings } from './settings'
import { registerStatus } from './status'
import { registerNews } from './news'
import { registerUpdater } from './updater'

// UI estática de pixel-art: no necesita GPU. Desactivar la aceleración por hardware elimina
// el proceso GPU de Chromium (~30-50MB menos de RAM) y va mejor en equipos viejos. Debe
// llamarse antes de app.whenReady().
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 640,
    resizable: false,
    show: false,
    frame: false,
    backgroundColor: '#0b0e0c',
    autoHideMenuBar: true,
    title: 'Dbr Launcher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => (mainWindow = null))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Controles de ventana (barra de título propia)
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('app:open-folder', () => shell.openPath(app.getPath('userData')))
  ipcMain.handle('app:version', () => app.getVersion())

  // Autenticación (pirata + premium Microsoft)
  registerAuth()
  // Sincronización de mods/configs desde el manifest
  registerSync()
  // Runtime de Java 8 (descarga Temurin/Adoptium)
  registerJava()
  // Lanzamiento de Minecraft/Forge
  registerLaunch()
  // Ajustes, estado del servidor y noticias
  registerSettings()
  registerStatus()
  registerNews()
  // Auto-actualización (GitHub Releases)
  registerUpdater(() => mainWindow)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
