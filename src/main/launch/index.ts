import { app, ipcMain } from 'electron'
import { spawn } from 'child_process'
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync } from 'fs'
import { join } from 'path'
import { CONFIG } from '../../shared/config'
import type { LaunchProgress, LaunchResult, LaunchStatus } from '../../shared/launch'
import { loadAccount } from '../auth/store'
import { ensureMcToken } from '../auth'
import { ensureJava } from '../java'
import { loadSettings, sanitizeJvmArgs } from '../settings'
import { buildLaunchArgs, type LaunchContext } from './args'
import { mergeVersions, type VersionJson } from './version'
import { fetchVanilla, fetchForge } from './mojang'
import { installLibraries } from './libraries'
import { installAssets } from './assets'
import { errMsg } from '../errors'
import { ensureFile } from '../net'
import { flushHashCache } from '../sync/hash'
import { assetsDir, getGameDir, librariesDir, versionsDir } from './paths'
import { tr } from '../idioma'

type OnProgress = (p: LaunchProgress) => void

/** Devuelve las últimas `lines` líneas del log del juego (para diagnóstico de crashes). */
export function readGameLogTail(lines = 60): string {
  const logPath = join(getGameDir(), 'launcher-game.log')
  if (!existsSync(logPath)) return ''
  // Solo los últimos 64 KB: el log de una partida larga pesa decenas de MB y se lee al arrancar.
  const fd = openSync(logPath, 'r')
  try {
    const size = fstatSync(fd).size
    const len = Math.min(size, 64 * 1024)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const all = buf.toString('utf-8').split(/\r?\n/)
    if (len < size) all.shift() // la primera línea seguramente quedó cortada
    return all.slice(-lines).join('\n').trim()
  } finally {
    closeSync(fd)
  }
}

/**
 * Carpeta de natives. Java 8 + LWJGL2 en Windows no cargan DLLs desde rutas con caracteres fuera
 * de ASCII (usuarios con tilde o ñ, habituales en la comunidad): el juego fallaba con
 * UnsatisfiedLinkError. En ese caso las natives van a %ProgramData%, que siempre es ASCII.
 */
function nativesDirFor(vDir: string, versionId: string): string {
  const normal = join(vDir, 'natives')
  // eslint-disable-next-line no-control-regex
  if (process.platform !== 'win32' || /^[\x00-\x7f]*$/.test(normal)) return normal
  const alt = join(process.env.ProgramData ?? 'C:\\ProgramData', 'DbrLauncher', 'natives', versionId)
  try {
    mkdirSync(alt, { recursive: true })
    return alt
  } catch {
    return normal
  }
}

interface Prepared {
  version: VersionJson
  classpath: string[]
  nativesDir: string
}

/** Descarga versión + client + librerías + natives + assets. Devuelve el classpath. */
async function prepare(onProgress: OnProgress): Promise<Prepared> {
  onProgress({ phase: 'version' })
  const vanilla = await fetchVanilla(CONFIG.minecraft)
  const version = mergeVersions(vanilla, await fetchForge())

  const vDir = join(versionsDir(), version.id)
  const nativesDir = nativesDirFor(vDir, version.id)
  const clientJar = join(vDir, `${version.id}.jar`)

  if (version.downloads?.client) {
    onProgress({ phase: 'client', detail: 'client.jar' })
    await ensureFile(clientJar, version.downloads.client.url, version.downloads.client.sha1)
  }

  const classpath = await installLibraries(version.libraries, librariesDir(), nativesDir, onProgress)
  classpath.push(clientJar)

  if (version.assetIndex) await installAssets(version.assetIndex, assetsDir(), onProgress)
  flushHashCache()

  return { version, classpath, nativesDir }
}

/** Prepara todo y lanza el juego. Resuelve cuando el proceso arranca. */
export async function launch(
  onProgress: OnProgress,
  onStatus: (s: LaunchStatus) => void
): Promise<void> {
  const account = loadAccount()
  if (!account) throw new Error(tr('err.sin_sesion'))

  const settings = loadSettings()
  // Primero la sesión: si la premium caducó, avisar antes de preparar Java y librerías.
  const accessToken = (await ensureMcToken()) ?? '0'
  const jvmExtra = sanitizeJvmArgs(settings.jvmArgs)

  const java = await ensureJava((jp) => onProgress({ phase: 'java', percent: jp.percent }))

  const prep = await prepare(onProgress)
  if (!prep.version.minecraftArguments) {
    throw new Error('El JSON de versión no trae minecraftArguments (formato 1.13+ no soportado).')
  }

  const ctx: LaunchContext = {
    username: account.username,
    uuid: account.uuid.replace(/-/g, ''),
    accessToken,
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
    extraJvm: jvmExtra ? jvmExtra.split(' ') : undefined,
    width: settings.width,
    height: settings.height,
    fullscreen: settings.fullscreen
  }

  const args = buildLaunchArgs(ctx)
  onProgress({ phase: 'launching' })

  // El directorio de trabajo debe existir o spawn falla con ENOENT (culpando a java).
  const gameDir = getGameDir()
  mkdirSync(gameDir, { recursive: true })

  // En Windows lanzar con javaw.exe (sin consola) en vez de java.exe. NO usar windowsHide:
  // con java.exe pondría SW_HIDE en el arranque y LWJGL2 crea la ventana del juego OCULTA
  // (el proceso corre pero no se ve Minecraft). stdout/stderr van a un archivo por descriptor
  // (no pipe del padre) y `detached` + `unref` hacen el juego independiente del launcher.
  const exe =
    process.platform === 'win32' ? java.path.replace(/java\.exe$/i, 'javaw.exe') : java.path
  const logFd = openSync(join(gameDir, 'launcher-game.log'), 'w')
  const child = spawn(exe, args, {
    cwd: gameDir,
    env: gameEnv(),
    detached: true,
    stdio: ['ignore', logFd, logFd]
  })
  child.unref()

  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        onStatus({ state: 'running' })
        resolve()
      })
      child.once('error', (e) => reject(new Error(tr('err.java_iniciar', { detalle: e.message }))))
    })
  } finally {
    closeSync(logFd) // el proceso hijo mantiene su propio handle del archivo
  }

  // Salida con código != 0 = crash: adjuntamos el final del log para diagnóstico en la UI.
  child.on('exit', (code) => {
    const exitCode = code ?? -1
    const logTail = exitCode !== 0 ? readGameLogTail() : undefined
    onStatus({ state: 'exited', code: exitCode, logTail })
  })
}

/**
 * Entorno del juego. Dentro de un AppImage, LD_LIBRARY_PATH y LD_PRELOAD apuntan a las librerías
 * empaquetadas con Electron; Java las heredaba y LWJGL/OpenAL/GTK podían cargar versiones que no
 * son las del sistema y fallar al abrir la ventana o el audio.
 */
function gameEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.platform === 'linux' && env.APPIMAGE) {
    delete env.LD_LIBRARY_PATH
    delete env.LD_PRELOAD
  }
  return env
}

/** Registra el handler IPC de lanzamiento. */
export function registerLaunch(): void {
  let launching = false
  ipcMain.handle('launch:start', async (e): Promise<LaunchResult> => {
    // Un doble clic en Jugar no debe arrancar dos juegos.
    if (launching) return { ok: false, error: tr('err.lanzando') }
    launching = true
    try {
      await launch(
        (p) => e.sender.send('launch:progress', p),
        (s) => e.sender.send('launch:status', s)
      )
      // MC arrancó y es un proceso independiente (detached/unref): cerramos el launcher
      // para liberar toda su RAM durante la partida. Pequeño margen para que el renderer
      // muestre el estado "iniciado" antes de salir.
      setTimeout(() => app.quit(), 2000)
      return { ok: true }
    } catch (err) {
      const error = errMsg(err)
      if (!e.sender.isDestroyed()) e.sender.send('launch:status', { state: 'error', error })
      return { ok: false, error }
    } finally {
      launching = false
    }
  })
}
