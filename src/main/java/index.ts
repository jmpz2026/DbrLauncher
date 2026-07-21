import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { JavaInfo, JavaProgress, JavaResult } from '../../shared/java'
import { currentPlatform } from './platform'
import { installJava } from './install'
import { getRuntimeDir, getRuntimeInfoFile } from './paths'

let cached: JavaInfo | null | undefined

/** JRE ya instalado (lee el marcador y comprueba que el ejecutable sigue ahí), o null. */
export function getJavaInfo(): JavaInfo | null {
  if (cached !== undefined) return cached
  try {
    const info = JSON.parse(readFileSync(getRuntimeInfoFile(), 'utf-8')) as JavaInfo
    cached = existsSync(info.path) ? info : null
  } catch {
    cached = null
  }
  return cached
}

/** Garantiza un JRE 8 disponible: usa el cacheado (si el ejecutable sigue ahí) o lo descarga. */
export async function ensureJava(onProgress: (p: JavaProgress) => void): Promise<JavaInfo> {
  const existing = getJavaInfo()
  if (existing && existsSync(existing.path)) return existing
  cached = undefined // marcador obsoleto (ejecutable borrado): reinstalar

  const pl = currentPlatform()
  const { javaPath, version } = await installJava(getRuntimeDir(), pl, onProgress)
  const info: JavaInfo = { path: javaPath, version, os: pl.os, arch: pl.arch }

  mkdirSync(dirname(getRuntimeInfoFile()), { recursive: true })
  writeFileSync(getRuntimeInfoFile(), JSON.stringify(info), 'utf-8')
  cached = info
  return info
}

/** Registra los handlers IPC del runtime de Java. */
export function registerJava(): void {
  ipcMain.handle('java:get', (): JavaInfo | null => getJavaInfo())
  ipcMain.handle('java:ensure', async (e): Promise<JavaResult> => {
    try {
      const info = await ensureJava((p) => e.sender.send('java:progress', p))
      return { ok: true, info }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
