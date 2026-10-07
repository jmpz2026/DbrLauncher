import type { Manifest } from '../../shared/sync'
import { httpRequest, readJson } from '../http'

// raw.githubusercontent.com cachea cada URL unos 5 minutos y la query no cuenta para la
// caché: quien daba Jugar justo después de un despliegue recibía el manifest viejo, o un
// archivo viejo que no casaba con el sha1 del nuevo. Una URL con el sha del commit en vez
// del nombre de la rama es inmutable, así que nunca sale vieja.
const RAW = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//

/** Sha del último commit de la rama, o null si la API no responde (límite de 60/h sin token). */
async function headSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
      headers: { Accept: 'application/vnd.github.sha' }
    })
    const sha = res.ok ? res.body.toString('utf-8').trim() : ''
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null
  } catch {
    return null
  }
}

/**
 * Descarga y valida el manifest del modpack desde una URL directa. Si es de
 * raw.githubusercontent.com, el manifest y los archivos que cuelgan de la misma rama se piden
 * fijados al commit actual. Sin la API, como antes: por la rama.
 */
export async function fetchManifest(url: string): Promise<Manifest> {
  const m = RAW.exec(url)
  const sha = m ? await headSha(m[1], m[2], m[3]) : null
  const branchBase = m ? m[0] : ''
  const pinnedBase = m && sha ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/` : ''
  const pin = (u: string): string => (pinnedBase && u.startsWith(branchBase) ? pinnedBase + u.slice(branchBase.length) : u)

  const res = await httpRequest(pin(url))
  if (!res.ok) throw new Error(`No se pudo descargar el manifest (${res.status}).`)
  const data = readJson<Manifest>(res, url)
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".')
  }
  if (pinnedBase) {
    for (const f of data.files) f.url = pin(f.url)
  }
  return data
}
