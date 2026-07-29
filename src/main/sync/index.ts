import { ipcMain } from 'electron'
import { CONFIG, isManifestConfigured } from '../../shared/config'
import type { SyncResult } from '../../shared/sync'
import { loadSettings, saveSettings } from '../settings'
import { getGameDir, getManagedFile } from './paths'
import { runSync } from './engine'
import { errMsg } from '../errors'

export { runSync } from './engine'

/** URL del manifest según la variante elegida en ajustes (lite comparte Forge/MC con full). */
function manifestUrlForVariant(): string {
  return loadSettings().modpackVariant === 'lite' ? CONFIG.manifestUrlLite : CONFIG.manifestUrl
}

/** Registra el handler IPC de sincronización. Llamar una vez al arrancar. */
export function registerSync(): void {
  ipcMain.handle('sync:start', async (e): Promise<SyncResult> => {
    try {
      // Sin repo de modpack configurado no hay nada que sincronizar: se omite (no es error),
      // así se puede lanzar vanilla igualmente.
      if (!isManifestConfigured()) {
        return { ok: true, summary: { updated: 0, removed: 0, version: '' } }
      }
      // Si el jugador aceptó aplicar la config recomendada al cambiar de variante,
      // esta sync re-aplica los archivos de siembra y se consume el flag.
      const reseed = loadSettings().modpackSeedPending
      const summary = await runSync(
        {
          gameDir: getGameDir(),
          managedFile: getManagedFile(),
          manifestUrl: manifestUrlForVariant(),
          reseed
        },
        (p) => e.sender.send('sync:progress', p)
      )
      // Sync correcta: los pendientes (config por re-sembrar, cambio de variante) quedan servidos.
      if (reseed) saveSettings({ modpackSeedPending: false })
      if (loadSettings().modpackSyncPending) saveSettings({ modpackSyncPending: false })
      return { ok: true, summary }
    } catch (err) {
      return { ok: false, error: errMsg(err) }
    }
  })
}
