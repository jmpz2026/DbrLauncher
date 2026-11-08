import { app, ipcMain } from 'electron'
import { join } from 'path'
import { MC_LANG, langDe, t, type Clave, type IdiomaInfo, type Lang } from '../../shared/i18n'
import { loadSettings, saveSettings } from '../settings'
import { escribirLang, langActual } from '../sync/lang'
import { getGameDir } from '../sync/paths'

// Idioma del launcher = idioma del juego. Manda el lang: de options.txt (el jugador puede
// cambiarlo dentro de Minecraft); antes de la primera sync, el elegido en el launcher o el
// del sistema.

const opciones = (): string => join(getGameDir(), 'options.txt')

/** Código de Minecraft para la primera siembra de options.txt. */
export function langInicial(): string {
  return loadSettings().idioma ?? MC_LANG[langDe(app.getLocale())]
}

export function idiomaInfo(): IdiomaInfo {
  const juego = langActual(opciones())
  return { lang: langDe(juego ?? langInicial()), juego }
}

// tr() se llama en errores de red y de descarga, a veces en ráfaga: leer options.txt y
// settings.json cada vez es disco de más. El idioma se cachea unos segundos (lo puede cambiar
// el jugador dentro del juego) y fijarIdioma lo invalida al momento.
const LANG_TTL_MS = 5000
let langCache: { lang: Lang; at: number } | null = null

/** Texto en el idioma actual, para errores y mensajes que salen de main. */
export function tr(clave: Clave, vars?: Record<string, string | number>): string {
  if (!langCache || Date.now() - langCache.at > LANG_TTL_MS) {
    langCache = { lang: idiomaInfo().lang, at: Date.now() }
  }
  return t(langCache.lang, clave, vars)
}

/** Cambia el idioma del launcher y el del juego (si options.txt ya existe). */
export function fijarIdioma(lang: Lang): IdiomaInfo {
  const mc = MC_LANG[lang]
  langCache = null
  saveSettings({ idioma: mc })
  escribirLang(opciones(), mc)
  return idiomaInfo()
}

export function registerIdioma(): void {
  ipcMain.handle('idioma:get', (): IdiomaInfo => idiomaInfo())
  ipcMain.handle('idioma:set', (_e, lang: Lang): IdiomaInfo =>
    fijarIdioma(lang === 'es' || lang === 'pt' ? lang : 'en')
  )
}
