import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import type { FuseStatus, FuseInstallResult } from '../../shared/fuse'

/**
 * Detección de libfuse2 en Linux. El AppImage se monta con FUSE (libfuse.so.2); si falta,
 * el doble-click no arranca. Cuando la app SÍ logra abrir sin fuse (modo extract-and-run),
 * este chequeo permite avisar al jugador y ofrecerle instalarla con un clic (pkexec).
 *
 * En Windows/Mac no hace nada: `fuse:status` devuelve missing:false.
 */

// Rutas típicas de libfuse.so.2 por si `ldconfig` no está disponible.
const FUSE_PATHS = [
  '/usr/lib/x86_64-linux-gnu/libfuse.so.2',
  '/lib/x86_64-linux-gnu/libfuse.so.2',
  '/usr/lib/libfuse.so.2',
  '/usr/lib64/libfuse.so.2',
  '/lib64/libfuse.so.2'
]

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? '' : stdout))
  })
}

async function hasFuse(): Promise<boolean> {
  // 1) ldconfig es lo más fiable (lista las libs registradas en el sistema).
  const out = await run('ldconfig', ['-p'])
  if (out) return out.includes('libfuse.so.2')
  // 2) Fallback: buscar el archivo en las rutas conocidas.
  return FUSE_PATHS.some((p) => existsSync(p))
}

// Lee el id de la distro desde /etc/os-release (ID y, si hace falta, ID_LIKE).
function readDistro(): { id: string; like: string } {
  try {
    const text = readFileSync('/etc/os-release', 'utf8')
    const pick = (key: string): string => {
      const m = text.match(new RegExp(`^${key}=("?)(.*)\\1`, 'm'))
      return (m?.[2] ?? '').toLowerCase()
    }
    return { id: pick('ID'), like: pick('ID_LIKE') }
  } catch {
    return { id: '', like: '' }
  }
}

// Comando de instalación de libfuse2 según la familia de la distro.
function installCmdFor(id: string, like: string): string {
  const family = `${id} ${like}`
  if (/debian|ubuntu|mint|pop|elementary/.test(family))
    return 'apt-get update && apt-get install -y libfuse2'
  if (/fedora|rhel|centos|rocky|almalinux/.test(family)) return 'dnf install -y fuse-libs'
  if (/arch|manjaro|endeavour/.test(family)) return 'pacman -S --noconfirm fuse2'
  if (/suse|opensuse/.test(family)) return 'zypper install -y libfuse2'
  // Desconocida: no arriesgar un comando incorrecto.
  return ''
}

export function registerFuse(): void {
  ipcMain.handle('fuse:status', async (): Promise<FuseStatus> => {
    if (process.platform !== 'linux') return { missing: false, canAutoInstall: false }
    if (await hasFuse()) return { missing: false, canAutoInstall: false }

    const { id, like } = readDistro()
    const installCmd = installCmdFor(id, like)
    const canAutoInstall = !!installCmd && !!(await run('which', ['pkexec']))
    return { missing: true, distro: id || undefined, installCmd: installCmd || undefined, canAutoInstall }
  })

  ipcMain.handle('fuse:install', async (): Promise<FuseInstallResult> => {
    if (process.platform !== 'linux') return { ok: false, error: 'Solo disponible en Linux' }
    const { id, like } = readDistro()
    const cmd = installCmdFor(id, like)
    if (!cmd) return { ok: false, error: 'Distribución no reconocida' }

    // pkexec abre un diálogo gráfico de contraseña (sin necesidad de terminal).
    return new Promise((resolve) => {
      execFile('pkexec', ['sh', '-c', cmd], { timeout: 120000 }, (err) => {
        if (err) resolve({ ok: false, error: err.message })
        else resolve({ ok: true })
      })
    })
  })
}
