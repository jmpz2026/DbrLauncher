import { ipcMain } from 'electron'
import { CONFIG } from '../../shared/config'
import type { ServerStatus } from '../../shared/status'
import { pingServer } from './ping'

export { pingServer } from './ping'

export function registerStatus(): void {
  ipcMain.handle('status:ping', (): Promise<ServerStatus> =>
    pingServer(CONFIG.serverHost, CONFIG.serverPort)
  )
}
