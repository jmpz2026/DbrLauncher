import { ipcMain } from 'electron'
import { CONFIG } from '../../shared/config'
import type { SyncResult } from '../../shared/sync'
import { loadSettings, saveSettings } from '../settings'
import { getGameDir, getManagedFile } from './paths'
import { runSync } from './engine'
import { errMsg } from '../errors'
import { isAbortError } from '../http'
import { langInicial } from '../idioma'


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

  // Una sola sync a la vez: dos a la vez pisarían los mismos .part y managed.json. Una segunda
  // petición recibe el resultado de la que ya está en marcha.
  let running: Promise<SyncResult> | null = null
  ipcMain.handle('sync:start', (e): Promise<SyncResult> => {
    running ??= doSync(e.sender).finally(() => (running = null))
    return running
  })
}

async function doSync(sender: Electron.WebContents): Promise<SyncResult> {
  const ctrl = new AbortController()
  current = ctrl
  try {
    // Si el jugador aceptó aplicar la config recomendada al cambiar de variante,
    // esta sync re-aplica los archivos de siembra y se consume el flag.
    const reseed = loadSettings().modpackSeedPending
    const variant = loadSettings().modpackVariant
    const summary = await runSync(
      {
        gameDir: getGameDir(),
        managedFile: getManagedFile(),
        manifestUrl: manifestUrlForVariant(),
        reseed,
        langInicial: langInicial(),
        signal: ctrl.signal
      },
      (p) => {
        if (!sender.isDestroyed()) sender.send('sync:progress', p)
      }
    )
    // Sync correcta: los pendientes (config por re-sembrar, cambio de variante) quedan servidos.
    if (reseed) saveSettings({ modpackSeedPending: false })
    // Si el jugador cambió de variante durante la sync, esta se hizo con el manifest viejo:
    // el pendiente sigue para que el próximo Jugar sincronice la variante nueva.
    const now = loadSettings()
    if (now.modpackSyncPending && now.modpackVariant === variant) saveSettings({ modpackSyncPending: false })
    return { ok: true, summary }
  } catch (err) {
    if (ctrl.signal.aborted || isAbortError(err)) return { ok: false, error: '', cancelled: true }
    return { ok: false, error: errMsg(err) }
  } finally {
    if (current === ctrl) current = null
  }
}
