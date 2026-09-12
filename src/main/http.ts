// Capa HTTP del proceso main. Usa el módulo `net` de Electron (stack de red de Chromium)
// en lugar de fetch/undici por dos motivos que rompían el launcher en equipos ajenos:
//   1. undici valida los certificados contra el CA store empaquetado en Node, así que un
//      antivirus con escaneo HTTPS (Kaspersky/ESET/Avast) o un proxy corporativo hacía fallar
//      toda descarga con un escueto "fetch failed". Chromium usa el almacén de certificados
//      del sistema, donde esos certificados sí están instalados.
//   2. undici ignora el proxy configurado en Windows; el `net` de Electron lo respeta.
// Además los errores de Chromium traen código (ERR_CERT_AUTHORITY_INVALID, ERR_NAME_NOT_RESOLVED…),
// que traducimos a un mensaje accionable para el jugador.
import { net } from 'electron'

export interface HttpInit {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer | URLSearchParams
  /** Progreso por bytes. `total` vale 0 si el servidor no manda content-length. */
  onProgress?: (received: number, total: number) => void
}

/** Respuesta ya buferizada (todas nuestras descargas caben en memoria). */
export interface HttpResponse {
  status: number
  ok: boolean
  headers: Record<string, string> // nombres en minúscula
  body: Buffer
}

// Códigos de error de Chromium que el jugador puede accionar. El resto se muestra crudo.
const HINTS: Record<string, string> = {
  ERR_NAME_NOT_RESOLVED: 'el DNS no resolvió el dominio (tu proveedor de internet puede estar bloqueándolo; prueba con DNS 1.1.1.1)',
  ERR_INTERNET_DISCONNECTED: 'no hay conexión a internet',
  ERR_CONNECTION_TIMED_OUT: 'la conexión expiró (red lenta o firewall)',
  ERR_TIMED_OUT: 'la conexión expiró (red lenta o firewall)',
  ERR_CONNECTION_REFUSED: 'el servidor rechazó la conexión',
  ERR_CONNECTION_RESET: 'la conexión se cortó a mitad (firewall o antivirus)',
  ERR_CERT_AUTHORITY_INVALID: 'certificado no confiable: desactiva el escaneo HTTPS/SSL de tu antivirus o añade su certificado al sistema',
  ERR_CERT_COMMON_NAME_INVALID: 'el certificado no corresponde al dominio (algo está interceptando la conexión)',
  ERR_CERT_DATE_INVALID: 'certificado fuera de fecha: revisa la fecha y hora de tu PC',
  ERR_SSL_PROTOCOL_ERROR: 'fallo de TLS (antivirus, proxy o Windows sin actualizar)',
  ERR_PROXY_CONNECTION_FAILED: 'el proxy configurado en Windows no responde'
}

function describe(url: string, err: Error): Error {
  const code = /ERR_[A-Z_]+/.exec(err.message)?.[0]
  const hint = code ? HINTS[code] : undefined
  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  })()
  const detail = hint ? `${hint} [${code}]` : err.message
  return new Error(`No se pudo conectar con ${host}: ${detail}`, { cause: err })
}

function toBuffer(body: HttpInit['body']): Buffer | null {
  if (body == null) return null
  if (Buffer.isBuffer(body)) return body
  return Buffer.from(typeof body === 'string' ? body : body.toString(), 'utf-8')
}

/** Una sola petición, sin reintentos. Rechaza solo por fallo de red, no por status. */
function requestOnce(url: string, init: HttpInit = {}): Promise<HttpResponse> {
  const { method = 'GET', headers = {}, onProgress } = init
  const payload = toBuffer(init.body)
  const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')

  return new Promise((resolve, reject) => {
    const req = net.request({ method, url, redirect: 'follow' })
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    if (payload && !hasType && init.body instanceof URLSearchParams) {
      req.setHeader('Content-Type', 'application/x-www-form-urlencoded')
    }

    req.on('response', (res) => {
      const total = Number(res.headers['content-length'] ?? 0)
      const chunks: Buffer[] = []
      let received = 0
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        onProgress?.(received, total)
      })
      res.on('end', () => {
        const norm: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          norm[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
        }
        const status = res.statusCode
        resolve({ status, ok: status >= 200 && status < 300, headers: norm, body: Buffer.concat(chunks) })
      })
      res.on('error', (e: Error) => reject(describe(url, e)))
    })
    req.on('error', (e) => reject(describe(url, e)))

    if (payload) req.write(payload)
    req.end()
  })
}

// Fallos pasajeros del edge (Fastly/Varnish delante de raw.githubusercontent y de los CDN de
// Mojang): "503 Backend.max_conn reached" cuando el POP no tiene el archivo en caché y el origen
// rechaza la conexión. Sin reintento un 503 de un segundo tumbaba el launch completo.
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const RETRIES = 3
const BACKOFF_MS = 1000 // base: 1s, 2s, 4s (antes de aplicar el jitter)
const MAX_RETRY_AFTER_MS = 10_000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Jitter ±50%: sin él, las descargas paralelas del sync reintentan todas a la vez y vuelven a
// golpear el mismo POP saturado en fase, así que los reintentos fallan en bloque.
const jitter = (ms: number): number => Math.round(ms * (0.5 + Math.random()))

/** Espera indicada por el servidor (`Retry-After`: segundos o fecha HTTP), acotada. */
function retryAfterMs(res: HttpResponse): number | null {
  const raw = res.headers['retry-after']
  if (!raw) return null
  const secs = Number(raw)
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(raw) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.min(ms, MAX_RETRY_AFTER_MS)
}

// Cuando el POP de Fastly delante de raw.githubusercontent se cae (503 Backend.max_conn reached)
// el corte dura minutos, mucho más que cualquier backoff, y tumbaba el launch entero aunque el
// archivo estuviera perfectamente publicado. Estos CDNs sirven el MISMO repo/rama desde otra red,
// así que un fallo regional de Fastly deja de ser un punto único de fallo. Solo se usan cuando el
// origen ya agotó sus reintentos: cachean por nombre de rama y pueden ir unas horas desfasados.
function mirrorsFor(url: string): string[] {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url)
  if (!m) return []
  const [, owner, repo, ref, path] = m
  return [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`,
    `https://cdn.statically.io/gh/${owner}/${repo}/${ref}/${path}`
  ]
}

/**
 * Petición HTTP(S) con redirecciones seguidas y reintentos con backoff exponencial ante status
 * pasajeros o cortes de red; si el origen es raw.githubusercontent y sigue caído tras los
 * reintentos, repite el ciclo contra los mirrors. Solo reintenta métodos idempotentes (GET/HEAD):
 * los POST de auth tienen su propia lógica de polling. Rechaza solo por fallo de red, no por status.
 *
 * `onProgress` puede retroceder a 0 si hay reintento (empieza una descarga nueva).
 */
export async function httpRequest(url: string, init: HttpInit = {}): Promise<HttpResponse> {
  const method = (init.method ?? 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  const targets = idempotent ? [url, ...mirrorsFor(url)] : [url]
  const attempts = idempotent ? RETRIES + 1 : 1

  let lastRes: HttpResponse | undefined
  let lastErr: unknown

  for (const [i, target] of targets.entries()) {
    const isMirror = i > 0
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const backoff = jitter(BACKOFF_MS * 2 ** (attempt - 1))
      try {
        const res = await requestOnce(target, init)
        // Del mirror solo vale un 2xx: su 404 (archivo no cacheado, repo privado, jar de más de
        // 20 MB) no dice nada del origen y no debe sustituir al status real de raw.
        if (res.ok || (!isMirror && !RETRY_STATUS.has(res.status))) return res
        if (!isMirror || !lastRes) lastRes = res
        if (attempt < attempts && RETRY_STATUS.has(res.status)) {
          await sleep(retryAfterMs(res) ?? backoff)
        } else if (attempt < attempts) {
          break // status definitivo del mirror: pasar al siguiente sin gastar reintentos
        }
      } catch (e) {
        lastErr = e
        if (attempt < attempts) await sleep(backoff)
      }
    }
  }

  // Agotados origen y mirrors: se devuelve el último status pasajero (el llamador lo reporta) y
  // solo se lanza si nunca hubo respuesta, es decir si todo fueron fallos de red.
  if (lastRes) return lastRes
  throw lastErr
}

/** Cuerpo como JSON. Lanza si no es JSON válido (p. ej. el portal cautivo de un wifi). */
export function readJson<T>(res: HttpResponse, url: string): T {
  try {
    return JSON.parse(res.body.toString('utf-8')) as T
  } catch {
    throw new Error(`Respuesta no válida (no es JSON) de ${url} [HTTP ${res.status}]`)
  }
}

/** Cuerpo como JSON, tolerante: devuelve `fallback` si no parsea. Para cuerpos de error. */
export function readJsonOr<T>(res: HttpResponse, fallback: T): T {
  try {
    return JSON.parse(res.body.toString('utf-8')) as T
  } catch {
    return fallback
  }
}
