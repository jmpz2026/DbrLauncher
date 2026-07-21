import type { Manifest } from '../../shared/sync'

/** Descarga y valida el manifest del modpack desde una URL directa. */
export async function fetchManifest(url: string): Promise<Manifest> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`No se pudo descargar el manifest (${res.status}).`)
  const data = (await res.json()) as Manifest
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".')
  }
  return data
}
