import type { Manifest } from '../../shared/sync'
import { httpRequest, readJson } from '../http'

/**
 * Añade un parámetro de query a una URL. raw.githubusercontent.com cachea cada URL unos 5
 * minutos: sin esto, quien da Jugar justo después de un despliegue recibe el manifest viejo
 * (o un archivo viejo que no casa con el sha1 del nuevo).
 */
export function withQuery(url: string, key: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`
}

/** Descarga y valida el manifest del modpack desde una URL directa. Siempre fresco: sin caché del CDN. */
export async function fetchManifest(url: string): Promise<Manifest> {
  const res = await httpRequest(withQuery(url, 't', String(Date.now())))
  if (!res.ok) throw new Error(`No se pudo descargar el manifest (${res.status}).`)
  const data = readJson<Manifest>(res, url)
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".')
  }
  return data
}
