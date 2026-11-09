import type { Manifest } from '../../shared/sync'
import { httpRequest, readJson } from '../http'
import { tr } from '../idioma'
import { CONFIG } from '../../shared/config'
import { fetchSignedMeta } from '../meta'

// raw.githubusercontent.com cachea cada URL unos 5 minutos y la query no cuenta para la
// caché: quien daba Jugar justo después de un despliegue recibía el manifest viejo, o un
// archivo viejo que no casaba con el sha1 del nuevo. Una URL con el sha del commit en vez
// del nombre de la rama es inmutable, así que nunca sale vieja.
const RAW = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//

/** Sha del último commit de la rama, o null si la API no responde (límite de 60/h sin token). */
async function headSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
      headers: { Accept: 'application/vnd.github.sha' },
      retries: 0 // opcional: sin la API se pide por la rama, no vale esperar backoffs
    })
    const sha = res.ok ? res.body.toString('utf-8').trim() : ''
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null
  } catch {
    return null
  }
}

/** Bases de descarga por sha1 válidas que trae el manifest (solo https), o null. */
function mirrorsOf(data: Manifest): string[] | undefined {
  if (!Array.isArray(data.mirrors)) return undefined
  const ok = data.mirrors.filter((b): b is string => typeof b === 'string' && /^https:\/\/[^\s]+\/$/.test(b))
  return ok.length ? ok : undefined
}

function validate(data: Manifest | null): Manifest {
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".')
  }
  data.mirrors = mirrorsOf(data)
  return data
}

/**
 * Descarga y valida el manifest del modpack. Primero desde el mirror R2 con firma verificada
 * (no pasa por GitHub, así que un límite de GitHub a la IP del jugador no lo bloquea). Si R2 no
 * responde o la firma no casa, desde `url` (raw). Si es de raw.githubusercontent.com, el
 * manifest y los archivos que cuelgan de la misma rama se piden fijados al commit actual. Sin la
 * API, como antes: por la rama.
 */
export async function fetchManifest(url: string): Promise<Manifest> {
  // Solo los manifests de nuestra rama assets están en el mirror (por nombre).
  const ownBase = CONFIG.manifestUrl.slice(0, CONFIG.manifestUrl.lastIndexOf('/') + 1)
  const name = url.slice(url.lastIndexOf('/') + 1)
  const signed = url.startsWith(ownBase) ? await fetchSignedMeta(name) : null
  if (signed) {
    const res = { status: 200, ok: true, headers: {}, body: signed }
    return validate(readJson<Manifest>(res, CONFIG.metaBase + name))
  }

  const m = RAW.exec(url)
  const sha = m ? await headSha(m[1], m[2], m[3]) : null
  const branchBase = m ? m[0] : ''
  const pinnedBase = m && sha ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/` : ''
  const pin = (u: string): string => (pinnedBase && u.startsWith(branchBase) ? pinnedBase + u.slice(branchBase.length) : u)

  const res = await httpRequest(pin(url))
  if (!res.ok) throw new Error(tr('err.manifest', { status: res.status }))
  const data = validate(readJson<Manifest>(res, url))
  if (pinnedBase) {
    for (const f of data.files) f.url = pin(f.url)
  }
  return data
}
