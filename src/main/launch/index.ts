import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { closeSync, mkdirSync, openSync } from 'fs'
import { join } from 'path'
import { CONFIG, isForgeConfigured } from '../../shared/config'
import type { LaunchProgress, LaunchResult, LaunchStatus } from '../../shared/launch'
import { loadAccount } from '../auth/store'
import { ensureMcToken } from '../auth'
import { ensureJava } from '../java'
import { loadSettings } from '../settings'
import { buildLaunchArgs, type LaunchContext } from './args'
import { mergeVersions, type VersionJson } from './version'
import { fetchVanilla, fetchForge } from './mojang'
import { installLibraries } from './libraries'
import { installAssets } from './assets'
import { ensureFile } from '../net'
import { assetsDir, getGameDir, librariesDir, versionsDir } from './paths'

type OnProgress = (p: LaunchProgress) => void

interface Prepared {
  version: VersionJson
  classpath: string[]
  nativesDir: string
}

/** Descarga versión + client + librerías + natives + assets. Devuelve el classpath. */
async function prepare(onProgress: OnProgress): Promise<Prepared> {
  onProgress({ phase: 'version', detail: 'Resolviendo versión' })
  const vanilla = await fetchVanilla(CONFIG.minecraft)
  const version = isForgeConfigured() ? mergeVersions(vanilla, await fetchForge()) : vanilla

  const vDir = join(versionsDir(), version.id)
  const nativesDir = join(vDir, 'natives')
  const clientJar = join(vDir, `${version.id}.jar`)

  if (version.downloads?.client) {
    onProgress({ phase: 'client', detail: 'client.jar' })
    await ensureFile(clientJar, version.downloads.client.url, version.downloads.client.sha1)
  }

  const classpath = await installLibraries(version.libraries, librariesDir(), nativesDir, onProgress)
  classpath.push(clientJar)

  if (version.assetIndex) await installAssets(version.assetIndex, assetsDir(), onProgress)

  return { version, classpath, nativesDir }
}

/** Prepara todo y lanza el juego. Resuelve cuando el proceso arranca. */
export async function launch(
  onProgress: OnProgress,
  onStatus: (s: LaunchStatus) => void
): Promise<void> {
  const account = loadAccount()
  if (!account) throw new Error('No hay sesión iniciada.')

  const settings = loadSettings()

  const java = await ensureJava((jp) =>
    onProgress({
      phase: 'version',
      detail: `Java ${jp.phase}${jp.percent != null ? ` ${jp.percent}%` : ''}`
    })
  )

  const prep = await prepare(onProgress)
  if (!prep.version.minecraftArguments) {
    throw new Error('El JSON de versión no trae minecraftArguments (formato 1.13+ no soportado).')
  }

  const ctx: LaunchContext = {
    username: account.username,
    uuid: account.uuid.replace(/-/g, ''),
    accessToken: (await ensureMcToken()) ?? '0',
    userType: account.type === 'premium' ? 'msa' : 'legacy',
    versionName: prep.version.id,
    gameDir: getGameDir(),
    assetsDir: assetsDir(),
    assetIndex: prep.version.assets ?? CONFIG.minecraft,
    nativesDir: prep.nativesDir,
    classpath: prep.classpath,
    mainClass: prep.version.mainClass,
    minecraftArguments: prep.version.minecraftArguments,
    ramGb: settings.ramGb,
    extraJvm: settings.jvmArgs.trim() ? settings.jvmArgs.trim().split(/\s+/) : undefined,
    width: settings.width,
    height: settings.height,
    fullscreen: settings.fullscreen
  }

  const args = buildLaunchArgs(ctx)
  onProgress({ phase: 'launching', detail: 'Arrancando Minecraft' })

  // El directorio de trabajo debe existir o spawn falla con ENOENT (culpando a java).
  const gameDir = getGameDir()
  mkdirSync(gameDir, { recursive: true })

  // stdout/stderr van a un archivo por descriptor (no por pipe del padre): así el juego no
  // se bloquea aunque nadie lea, y queda un log. `detached` + `unref` = el juego es
  // independiente y sobrevive aunque se cierre el launcher. `windowsHide` evita una consola.
  const logFd = openSync(join(gameDir, 'launcher-game.log'), 'w')
  const child = spawn(java.path, args, {
    cwd: gameDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true
  })
  child.unref()

  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        onStatus({ state: 'running' })
        resolve()
      })
      child.once('error', (e) => reject(new Error(`No se pudo iniciar java: ${e.message}`)))
    })
  } finally {
    closeSync(logFd) // el proceso hijo mantiene su propio handle del archivo
  }

  child.on('exit', (code) => onStatus({ state: 'exited', code: code ?? -1 }))
}

/** Registra el handler IPC de lanzamiento. */
export function registerLaunch(): void {
  ipcMain.handle('launch:start', async (e): Promise<LaunchResult> => {
    try {
      await launch(
        (p) => e.sender.send('launch:progress', p),
        (s) => e.sender.send('launch:status', s)
      )
      return { ok: true }
    } catch (err) {
      const error = (err as Error).message
      e.sender.send('launch:status', { state: 'error', error })
      return { ok: false, error }
    }
  })
}
