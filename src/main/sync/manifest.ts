import type { Manifest } from '../../shared/sync'
import { httpRequest, readJson } from '../http'

/** Descarga y valida el manifest del modpack desde una URL directa. */
export async function fetchManifest(url: string): Promise<Manifest> {
  const res = await httpRequest(url)
  if (!res.ok) throw new Error(`No se pudo descargar el manifest (${res.status}).`)
  const data = readJson<Manifest>(res, url)
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".')
  }
  return data
}
