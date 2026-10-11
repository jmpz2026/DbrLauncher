import { existsSync, readFileSync, writeFileSync } from 'fs'

// Idioma del juego en options.txt. El que viene en DBR-ASSETS dice lang:es_ES para todos;
// el servidor habla castellano, inglés y portugués y sigue el idioma de Minecraft de cada
// jugador, así que la primera vez se elige según el sistema operativo.

/** Idioma de Minecraft para un locale del sistema ("pt-BR", "es-419", "en-US"...). */
export function langParaSistema(locale: string): string {
  const l = (locale || '').toLowerCase()
  if (l.startsWith('es')) return 'es_ES'
  if (l.startsWith('pt')) return 'pt_BR'
  return 'en_US'
}

/** La línea lang: de un options.txt, o null si no tiene. */
export function leerLang(texto: string): string | null {
  const m = /^lang:(.+)$/m.exec(texto)
  return m ? m[1].trim() : null
}

/** El texto con lang: cambiado (o agregado al final si no estaba). */
export function fijarLang(texto: string, lang: string): string {
  if (/^lang:.*$/m.test(texto)) return texto.replace(/^lang:.*$/m, 'lang:' + lang)
  return texto + (texto.endsWith('\n') || texto === '' ? '' : '\n') + 'lang:' + lang + '\n'
}

/** lang: del options.txt que ya tiene el jugador (antes de re-sembrarlo), o null. */
export function langActual(ruta: string): string | null {
  try {
    return existsSync(ruta) ? leerLang(readFileSync(ruta, 'utf-8')) : null
  } catch {
    return null
  }
}

/**
 * Después de sembrar options.txt: si el jugador ya tenía uno, se le respeta su idioma (un
 * cambio de variante re-siembra y no tiene que volver a castellano); si es la primera vez,
 * el del sistema operativo.
 */
export function aplicarLang(ruta: string, previo: string | null, localeSistema: string): void {
  try {
    const texto = readFileSync(ruta, 'utf-8')
    const lang = previo ?? langParaSistema(localeSistema)
    if (leerLang(texto) !== lang) writeFileSync(ruta, fijarLang(texto, lang), 'utf-8')
  } catch {
    // Sin options.txt legible el juego arranca en inglés igual; no vale cortar la sync.
  }
}
