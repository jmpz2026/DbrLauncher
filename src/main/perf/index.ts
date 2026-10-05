import { app, ipcMain } from 'electron'
import { cpus, totalmem } from 'os'
import type { LiteProposal } from '../../shared/perf'
import { loadSettings, saveSettings } from '../settings'
import { getKey, setKey } from './cfg'

/**
 * Detección de equipo justo en el launcher (PC) y propuesta de pasar a la variante Lite.
 * Plan en DbrServerPack/docs/rendimiento/PLAN.md, fase 4.
 *
 * Nunca cambia nada sola: propone, y el renderer enseña el diálogo. Reglas:
 * - Solo con la variante Completa.
 * - La marca del juego (`recomendarLite=true`: el jugador aceptó el modo ligero dentro del
 *   juego) basta por sí sola, y vale aunque antes se rechazara: es evidencia nueva.
 * - Por hardware, una sola vez (se guarda la respuesta) y con 2 señales o más: menos de 4 GB
 *   de RAM, 4 núcleos o menos, GPU por software o Intel integrada antigua.
 */
const RAM_JUSTA = 4 * 1024 ** 3
const NUCLEOS_JUSTOS = 4
const SOFTWARE = ['gdi generic', 'llvmpipe', 'softpipe', 'swrast', 'microsoft basic render']

const NONE: LiteProposal = { propose: false, reason: '', fromGame: false }

export async function checkLite(): Promise<LiteProposal> {
  const s = loadSettings()
  if (s.modpackVariant !== 'full') return NONE
  if (getKey('recomendarLite') === 'true') {
    return {
      propose: true,
      fromGame: true,
      reason: 'El juego activó su modo ligero en este equipo.'
    }
  }
  if (s.liteProposal !== 'none') return NONE

  const senales: string[] = []
  if (totalmem() < RAM_JUSTA) senales.push(`${(totalmem() / 1024 ** 3).toFixed(1)} GB de RAM`)
  const nucleos = cpus().length
  if (nucleos <= NUCLEOS_JUSTOS) senales.push(`${nucleos} núcleos`)
  const gpu = await gpuJusta()
  if (gpu) senales.push(gpu)
  if (senales.length < 2) return NONE
  return { propose: true, fromGame: false, reason: `Detectado: ${senales.join(', ')}.` }
}

/**
 * La GPU, por los textos que dé Chromium. Con la aceleración por hardware desactivada (ver
 * main/index.ts) la información puede venir pobre o no venir: entonces simplemente no
 * cuenta como señal.
 */
async function gpuJusta(): Promise<string | null> {
  try {
    const info = await Promise.race([
      app.getGPUInfo('basic'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ])
    if (!info) return null
    const textos = JSON.stringify(info).toLowerCase()
    if (SOFTWARE.some((t) => textos.includes(t))) return 'GPU por software'
    if (intelAntigua(textos)) return 'GPU integrada antigua'
  } catch {
    /* sin datos de GPU: no cuenta */
  }
  return null
}

/** Mismo criterio que el mod (core.perf.Deteccion): GMA y HD Graphics sin número o 1000+. */
function intelAntigua(t: string): boolean {
  if (!t.includes('intel')) return false
  if (/\bgma\b|q35|g41|g45/.test(t)) return true
  if (/uhd|iris|\barc\b/.test(t)) return false
  const m = /hd graphics(?:\s+(\d{3,4}))?/.exec(t)
  if (!m) return false
  return !m[1] || Number(m[1]) >= 1000
}

/**
 * Respuesta del jugador. La marca del juego se limpia siempre y se le deja al mod la
 * respuesta en `launcher`, para que no repita por su cuenta la propuesta por hardware.
 * El cambio de variante lo pide el renderer con settings:set: así pasa por la misma lógica
 * que el selector de Ajustes y re-sincroniza.
 */
export function answerLite(accept: boolean): void {
  saveSettings({ liteProposal: accept ? 'accepted' : 'rejected' })
  try {
    setKey('recomendarLite', 'false', 'B')
    setKey('launcher', accept ? 'aceptada' : 'rechazada', 'S')
  } catch {
    /* sin carpeta del juego todavía: la respuesta queda en los ajustes del launcher */
  }
}

export function registerPerf(): void {
  ipcMain.handle('perf:check', (): Promise<LiteProposal> => checkLite())
  ipcMain.handle('perf:answer', (_e, accept: boolean): void => answerLite(Boolean(accept)))
}
