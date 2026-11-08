import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerAuth } from './auth'
import { registerSync } from './sync'
import { registerJava } from './java'
import { registerLaunch, readGameLogTail } from './launch'
import { registerSettings } from './settings'
import { registerStatus } from './status'
import { registerUpdater } from './updater'
import { registerFuse } from './fuse'
import { registerPerf } from './perf'
import { registerIdioma } from './idioma'

// UI estática de pixel-art: no necesita GPU. Desactivar la aceleración por hardware elimina
// el proceso GPU de Chromium (~30-50MB menos de RAM) y va mejor en equipos viejos. Debe
// llamarse antes de app.whenReady().
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

// Hosts que la UI puede abrir en el navegador del sistema (Discord, GitHub, web del server y
// la página del código de Microsoft). Cualquier otra URL, file:// o protocolo raro se ignora.
const EXTERNAL_HOSTS = new Set([
  'discord.gg',
  'github.com',
  'main.jingames.net',
  'www.microsoft.com',
  'microsoft.com',
  'login.live.com',
  'stability.ai'
])

function openExternalSafe(raw: string): void {
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.hostname)) {
      shell.openExternal(u.toString()).catch(() => {})
    }
  } catch {
    /* URL inválida */
  }
}

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
      // El preload solo usa contextBridge + ipcRenderer: corre en sandbox sin problema.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => (mainWindow = null))

  win.webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url)
    return { action: 'deny' }
  })
  // Soltar un enlace o un .html sobre la ventana la hacía navegar a esa página, que heredaba
  // window.dbr. La ventana nunca sale de la UI propia.
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  // La URL del servidor de desarrollo solo vale sin empaquetar: en la app instalada, una
  // variable de entorno no debe poder cargar otra página con acceso a window.dbr.
  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const load = devUrl ? win.loadURL(devUrl) : win.loadFile(join(__dirname, '../renderer/index.html'))
  load.catch((e) => console.error('[window] no se pudo cargar la UI:', e))
}

// Una sola instancia: dos launchers abiertos hacían dos syncs sobre los mismos archivos y se
// pisaban settings.json y la sesión. El segundo arranque solo trae al frente la ventana abierta.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return
  // Controles de ventana (barra de título propia)
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.on('app:open-folder', () => void shell.openPath(app.getPath('userData')))
  ipcMain.handle('app:version', () => app.getVersion())
  // Log del último arranque del juego (para el visor / diagnóstico de crashes).
  ipcMain.handle('app:read-log', () => readGameLogTail(200))

  // Autenticación (pirata + premium Microsoft)
  registerAuth(() => mainWindow)
  // Sincronización de mods/configs desde el manifest
  registerSync()
  // Runtime de Java 8 (descarga Temurin/Adoptium)
  registerJava()
  // Lanzamiento de Minecraft/Forge
  registerLaunch()
  // Ajustes y estado del servidor
  registerSettings()
  registerStatus()
  // Auto-actualización (GitHub Releases)
  registerUpdater(() => mainWindow)
  // Detección de libfuse2 en Linux (AppImage)
  registerFuse()
  // Propuesta de pasar a Lite en equipos justos
  registerPerf()
  // Idioma del launcher y del juego (lang: de options.txt)
  registerIdioma()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
