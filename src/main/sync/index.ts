import { ipcMain } from 'electron'
import { CONFIG, isManifestConfigured } from '../../shared/config'
import type { SyncResult } from '../../shared/sync'
import { getGameDir, getManagedFile } from './paths'
import { runSync } from './engine'

export { runSync } from './engine'

/** Registra el handler IPC de sincronización. Llamar una vez al arrancar. */
export function registerSync(): void {
  ipcMain.handle('sync:start', async (e): Promise<SyncResult> => {
    try {
      // Sin repo de modpack configurado no hay nada que sincronizar: se omite (no es error),
      // así se puede lanzar vanilla igualmente.
      if (!isManifestConfigured()) {
        return { ok: true, summary: { updated: 0, removed: 0, version: '' } }
      }
      const summary = await runSync(
        { gameDir: getGameDir(), managedFile: getManagedFile(), manifestUrl: CONFIG.manifestUrl },
        (p) => e.sender.send('sync:progress', p)
      )
      return { ok: true, summary }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
