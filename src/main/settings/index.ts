import { app, ipcMain } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { totalmem } from 'os'
import { join } from 'path'
import {
  DEFAULT_JVM_ARGS,
  OLD_DEFAULT_JVM_ARGS_32M,
  DEFAULT_SETTINGS,
  MIN_RAM_GB,
  RAM_HEADROOM_GB,
  type LauncherSettings,
  type RamLimits
} from '../../shared/settings'

const filePath = (): string => join(app.getPath('userData'), 'settings.json')
let cache: LauncherSettings | null = null

/** Escritura atómica: un corte a mitad no deja settings.json roto (volvería a los defaults). */
function persist(data: LauncherSettings): void {
  const p = filePath()
  writeFileSync(p + '.tmp', JSON.stringify(data), 'utf-8')
  renameSync(p + '.tmp', p)
}

// Flags JVM que ejecutan código o comandos arbitrarios. Un renderer comprometido (o un
// settings.json manipulado) no debe poder colarlos en el arranque del juego.
const JVM_FORBIDDEN = /^-(javaagent|agentlib|agentpath|Xbootclasspath|XX:OnError|XX:OnOutOfMemoryError)/i

/** Quita de los argumentos JVM los flags peligrosos. */
export function sanitizeJvmArgs(args: string): string {
  return args
    .split(/\s+/)
    .filter((a) => a && !JVM_FORBIDDEN.test(a))
    .join(' ')
    .slice(0, 2000)
}

/** RAM física total (GB, redondeada hacia abajo). */
export function totalRamGb(): number {
  return Math.floor(totalmem() / 1024 ** 3)
}

/**
 * RAM máxima asignable al juego: deja RAM_HEADROOM_GB libres para el SO. Nunca menos de
 * MIN_RAM_GB (para no dejar el slider en cero en equipos muy justos) ni más de 16.
 */
export function maxRamGb(): number {
  return Math.min(16, Math.max(MIN_RAM_GB, totalRamGb() - RAM_HEADROOM_GB))
}

function ramLimits(): RamLimits {
  return { totalGb: totalRamGb(), maxGb: maxRamGb() }
}

export function loadSettings(): LauncherSettings {
  if (cache) return cache
  try {
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(filePath(), 'utf-8')) as object) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  // Migración única: a usuarios viejos (sin flag) que no tocaron los JVM args les ponemos
  // los flags GC por defecto una sola vez. Tras marcarse, un campo vacío ya se respeta.
  let migrated = false
  if (!cache.jvmArgsMigrated) {
    if (!cache.jvmArgs.trim()) cache.jvmArgs = DEFAULT_JVM_ARGS
    cache.jvmArgsMigrated = true
    migrated = true
  }
  // Regiones de G1 de 32 MB a 8 MB, solo a quien sigue con el default viejo tal cual.
  if (cache.jvmArgs.trim() === OLD_DEFAULT_JVM_ARGS_32M) {
    cache.jvmArgs = DEFAULT_JVM_ARGS
    migrated = true
  }
  if (migrated) {
    try {
      persist(cache)
    } catch {
      /* si no se puede persistir, se reintentará al siguiente arranque */
    }
  }
  // Nunca dejar que ramGb supere lo que el equipo puede dar (deja headroom al SO): un -Xmx
  // por encima de la RAM real causa thrashing y pantalla negra al cargar. Corrige en memoria
  // a los users que ya quedaron con un valor demasiado alto (p.ej. 4G en un equipo de 4GB).
  cache.ramGb = Math.min(Math.max(cache.ramGb, MIN_RAM_GB), maxRamGb())
  return cache
}

export function saveSettings(patch: Partial<LauncherSettings>): LauncherSettings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  persist(next)
  return next
}

export function registerSettings(): void {
  ipcMain.handle('settings:get', (): LauncherSettings => loadSettings())
  ipcMain.handle('settings:limits', (): RamLimits => ramLimits())
  ipcMain.handle('settings:set', (_e, patch: unknown): LauncherSettings =>
    saveSettings(markVariantChange(sanitizePatch(patch)))
  )
}

/**
 * Si el patch cambia la variante del modpack, marca que hace falta sincronizar. Se hace aquí y
 * no en la UI para que valga venga de donde venga el cambio.
 */
function markVariantChange(patch: Partial<LauncherSettings>): Partial<LauncherSettings> {
  if (!patch.modpackVariant || patch.modpackVariant === loadSettings().modpackVariant) return patch
  return { ...patch, modpackSyncPending: true }
}

const VARIANTS = new Set(['full', 'lite', 'experimental'])
const LITE_ANSWERS = new Set(['none', 'accepted', 'rejected'])
const int = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : undefined

/**
 * Valida el patch que llega del renderer: solo claves conocidas, con su tipo y en rango.
 * Lo que no encaja se descarta en silencio (no se guarda NaN, ni una variante inventada).
 */
function sanitizePatch(raw: unknown): Partial<LauncherSettings> {
  if (!raw || typeof raw !== 'object') return {}
  const p = raw as Record<string, unknown>
  const out: Partial<LauncherSettings> = {}
  const ram = int(p.ramGb, MIN_RAM_GB, maxRamGb())
  if (ram !== undefined) out.ramGb = ram
  const w = int(p.width, 320, 7680)
  if (w !== undefined) out.width = w
  const h = int(p.height, 240, 4320)
  if (h !== undefined) out.height = h
  if (typeof p.musicaVolumen === 'number' && Number.isFinite(p.musicaVolumen)) {
    out.musicaVolumen = Math.min(Math.max(p.musicaVolumen, 0), 1)
  }
  for (const k of ['fullscreen', 'autoSyncMods', 'modpackSeedPending', 'modpackSyncPending', 'musicaActiva'] as const) {
    if (typeof p[k] === 'boolean') out[k] = p[k] as boolean
  }
  if (typeof p.jvmArgs === 'string') out.jvmArgs = sanitizeJvmArgs(p.jvmArgs)
  if (typeof p.modpackVariant === 'string' && VARIANTS.has(p.modpackVariant)) {
    out.modpackVariant = p.modpackVariant as LauncherSettings['modpackVariant']
  }
  if (typeof p.liteProposal === 'string' && LITE_ANSWERS.has(p.liteProposal)) {
    out.liteProposal = p.liteProposal as LauncherSettings['liteProposal']
  }
  if (p.idioma === null || (typeof p.idioma === 'string' && /^[a-z]{2}_[A-Z]{2}$/.test(p.idioma))) {
    out.idioma = p.idioma as string | null
  }
  return out
}
