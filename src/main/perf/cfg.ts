import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getGameDir } from '../sync/paths'

/**
 * Lectura y escritura mínima de config/dbrcore/rendimiento.cfg, el archivo del modo de
 * rendimiento del mod (DbrCore, core.perf.Rendimiento). Es un .cfg de Forge:
 *
 *   rendimiento {
 *       S:preferencia=auto
 *       B:recomendarLite=false
 *   }
 *
 * Solo se tocan dos claves: se lee y se limpia `recomendarLite`, y se escribe `launcher` con
 * la respuesta del jugador. Lo demás lo gestiona el mod; si falta algo, el mod lo completa
 * con sus valores al arrancar.
 */
const CAT = 'rendimiento'

export const perfCfgPath = (): string =>
  join(getGameDir(), 'config', 'dbrcore', 'rendimiento.cfg')

function read(): string {
  try {
    return readFileSync(perfCfgPath(), 'utf-8')
  } catch {
    return ''
  }
}

const keyRe = (key: string): RegExp => new RegExp(`^(\\s*)([SBID]):${key}=(.*)$`, 'm')

/** Valor crudo de una clave del bloque `rendimiento`, o null. */
export function getKey(key: string): string | null {
  const m = keyRe(key).exec(read())
  return m ? m[3].trim() : null
}

/** Escribe una clave (crea el archivo y el bloque si hace falta). `type` es S (texto) o B. */
export function setKey(key: string, value: string, type: 'S' | 'B'): void {
  let text = read()
  const re = keyRe(key)
  if (re.test(text)) {
    text = text.replace(re, (_all, indent: string) => `${indent}${type}:${key}=${value}`)
  } else if (new RegExp(`^${CAT}\\s*\\{`, 'm').test(text)) {
    // Antes de la llave que cierra el bloque `rendimiento`.
    text = text.replace(
      new RegExp(`(^${CAT}\\s*\\{[\\s\\S]*?)(^\\})`, 'm'),
      (_all, body: string, close: string) => `${body}    ${type}:${key}=${value}\n${close}`
    )
  } else {
    const sep = text && !text.endsWith('\n') ? '\n' : ''
    text = `${text}${sep}${CAT} {\n    ${type}:${key}=${value}\n}\n`
  }
  const file = perfCfgPath()
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf-8')
}
