import { useEffect } from 'react'
import { t, type Clave } from '../../shared/i18n'
import { useStore } from './store'

export type Tr = (clave: Clave, vars?: Record<string, string | number>) => string

/** Textos en el idioma actual; el componente se vuelve a pintar al cambiar de idioma. */
export function useT(): Tr {
  const lang = useStore((s) => s.lang)
  return (clave, vars) => t(lang, clave, vars)
}

/** Mantiene <html lang> al día (lectores de pantalla, guionado). */
export function useHtmlLang(): void {
  const lang = useStore((s) => s.lang)
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang
  }, [lang])
}
