import { ipcMain } from 'electron'
import { CONFIG, isManifestConfigured } from '../../shared/config'
import type { SyncResult } from '../../shared/sync'
import { loadSettings, saveSettings } from '../settings'
import { getGameDir, getManagedFile } from './paths'
import { runSync } from './engine'
import { errMsg } from '../errors'
import { isAbortError } from '../http'
import { langInicial } from '../idioma'

export { runSync } from './engine'

/** URL del manifest según la variante elegida en ajustes (todas comparten Forge/MC). */
function manifestUrlForVariant(): string {
  switch (loadSettings().modpackVariant) {
    case 'lite':
      return CONFIG.manifestUrlLite
    case 'experimental':
      return CONFIG.manifestUrlExperimental
    default:
      return CONFIG.manifestUrl
  }
}

/** Sync en curso, para poder cancelarla desde el renderer. */
let current: AbortController | null = null

/** Registra el handler IPC de sincronización. Llamar una vez al arrancar. */
export function registerSync(): void {
  // Lo bajado a medias queda en .part: la próxima sync sigue desde ahí.
  ipcMain.handle('sync:cancel', () => current?.abort())

  ipcMain.handle('sync:start', async (e): Promise<SyncResult> => {
    const ctrl = new AbortController()
    current = ctrl
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
          reseed,
          langInicial: langInicial(),
          signal: ctrl.signal
        },
        (p) => e.sender.send('sync:progress', p)
      )
      // Sync correcta: los pendientes (config por re-sembrar, cambio de variante) quedan servidos.
      if (reseed) saveSettings({ modpackSeedPending: false })
      if (loadSettings().modpackSyncPending) saveSettings({ modpackSyncPending: false })
      return { ok: true, summary }
    } catch (err) {
      if (ctrl.signal.aborted || isAbortError(err)) return { ok: false, error: '', cancelled: true }
      return { ok: false, error: errMsg(err) }
    } finally {
      if (current === ctrl) current = null
    }
  })
}
