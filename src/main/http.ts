// Capa HTTP del proceso main. Usa el módulo `net` de Electron (stack de red de Chromium)
// en lugar de fetch/undici por dos motivos que rompían el launcher en equipos ajenos:
//   1. undici valida los certificados contra el CA store empaquetado en Node, así que un
//      antivirus con escaneo HTTPS (Kaspersky/ESET/Avast) o un proxy corporativo hacía fallar
//      toda descarga con un escueto "fetch failed". Chromium usa el almacén de certificados
//      del sistema, donde esos certificados sí están instalados.
//   2. undici ignora el proxy configurado en Windows; el `net` de Electron lo respeta.
// Además los errores de Chromium traen código (ERR_CERT_AUTHORITY_INVALID, ERR_NAME_NOT_RESOLVED…),
// que traducimos a un mensaje accionable para el jugador.
import { closeSync, existsSync, openSync, rmSync, statSync, writeSync } from 'fs'
import { net } from 'electron'
import { existe } from '../shared/i18n'
import { tr } from './idioma'

export interface HttpInit {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer | URLSearchParams
  /** Progreso por bytes. `total` vale 0 si el servidor no manda content-length. */
  onProgress?: (received: number, total: number) => void
  /** Ms sin recibir nada (ni cabeceras ni datos) antes de abortar. Por defecto IDLE_TIMEOUT_MS. */
  idleTimeoutMs?: number
  /** URLs alternativas con el mismo contenido; se prueban tras el origen y antes de los CDN. */
  mirrors?: string[]
  /**
   * Escribe el cuerpo en este archivo en vez de en memoria (`body` queda vacío). Si ya tiene
   * bytes se pide `Range` desde ahí: un corte, un reintento o una sync cancelada siguen donde
   * quedaron. `onProgress` cuenta los bytes del archivo, no solo los de esta petición.
   */
  toFile?: string
  /** Cancela la petición y los reintentos pendientes (rechaza con un error `AbortError`). */
  signal?: AbortSignal
  /** Reintentos por destino (por defecto RETRIES). Menos para peticiones opcionales con plan B. */
  retries?: number
  /**
   * Si todas las fuentes responden 403/429 (bloqueo por IP), se espera y se repite una vuelta.
   * `onBlocked` recibe los ms de espera para que la UI lo muestre. Solo se espera si hay
   * `onBlocked` (20 s) o `blockedWaitMs` > 0.
   */
  onBlocked?: (waitMs: number) => void
  blockedWaitMs?: number
}

/** Error con el que se rechaza una petición cancelada con `HttpInit.signal`. */
export function abortError(): Error {
  const e = new Error('Cancelado')
  e.name = 'AbortError'
  return e
}

export const isAbortError = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError'


// `net.request` de Electron no trae timeout: una conexión que se queda colgada (wifi que
// pierde paquetes, POP saturado que acepta y no responde) dejaba el launch esperando para
// siempre. Es de inactividad y no total: un jar de 40 MB en una conexión lenta tarda, pero
// nunca pasa 20 s sin recibir un byte.
const IDLE_TIMEOUT_MS = 20_000

/** Respuesta ya buferizada (todas nuestras descargas caben en memoria). */
export interface HttpResponse {
  status: number
  ok: boolean
  headers: Record<string, string> // nombres en minúscula
  body: Buffer
  /** Solo en un fallo tras probar varias fuentes: status final de cada una (o el error de red). */
  attempts?: { host: string; status: number | string }[]
  /** Todas las fuentes respondieron 403/429: la IP del jugador está limitada o bloqueada. */
  blocked?: boolean
}

// Códigos de error de Chromium que el jugador puede accionar (textos red.<código> de
// shared/i18n). El resto se muestra crudo.
const ALIAS: Record<string, string> = { ERR_TIMED_OUT: 'ERR_CONNECTION_TIMED_OUT' }

function hintOf(code: string): string | undefined {
  const clave = 'red.' + (ALIAS[code] ?? code)
  return existe(clave) ? tr(clave) : undefined
}

function describe(url: string, err: Error): Error {
  const code = /ERR_[A-Z_]+/.exec(err.message)?.[0]
  const hint = code ? hintOf(code) : undefined
  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  })()
  const detail = hint ? `${hint} [${code}]` : err.message
  return new Error(tr('err.conectar', { host, detalle: detail }), { cause: err })
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
    if (init.signal?.aborted) return reject(abortError())
    const req = net.request({ method, url, redirect: 'follow' })
    const idleMs = init.idleTimeoutMs ?? IDLE_TIMEOUT_MS
    let settled = false
    let timer: NodeJS.Timeout | undefined
    let fd: number | null = null // archivo destino abierto (solo con toFile)
    const closeFile = (): void => {
      if (fd !== null) closeSync(fd)
      fd = null
    }
    const onAbort = (): void => {
      finish(() => reject(abortError()))
      req.abort()
    }
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeFile()
      init.signal?.removeEventListener('abort', onAbort)
      fn()
    }
    init.signal?.addEventListener('abort', onAbort, { once: true })
    // Descarga a archivo: se pide solo lo que falta.
    const offset = init.toFile && existsSync(init.toFile) ? statSync(init.toFile).size : 0
    if (offset > 0) req.setHeader('Range', `bytes=${offset}-`)
    const arm = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        finish(() => reject(describe(url, new Error(`net::ERR_TIMED_OUT (${tr('red.sin_respuesta', { s: idleMs / 1000 })})`))))
        req.abort()
      }, idleMs)
    }
    arm()
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    if (payload && !hasType && init.body instanceof URLSearchParams) {
      req.setHeader('Content-Type', 'application/x-www-form-urlencoded')
    }

    req.on('response', (res) => {
      const length = Number(res.headers['content-length'] ?? 0)
      const chunks: Buffer[] = []
      let received = 0
      // Con toFile solo un 200/206 va al archivo (206 = continúa, 200 = el servidor ignoró el
      // Range y manda todo). Un error (página HTML) se queda en memoria como siempre. Un 416
      // es un archivo a medias que ya no casa: se borra y el reintento empieza de 0.
      let base = 0
      try {
        if (init.toFile && (res.statusCode === 200 || res.statusCode === 206)) {
          base = res.statusCode === 206 ? offset : 0
          fd = openSync(init.toFile, res.statusCode === 206 ? 'a' : 'w')
        } else if (init.toFile && res.statusCode === 416) {
          rmSync(init.toFile, { force: true })
        }
      } catch (e) {
        // Disco lleno, sin permisos, archivo bloqueado por el antivirus: sin esto la promesa
        // no se resolvía nunca y la descarga se quedaba colgada.
        finish(() => reject(e as Error))
        req.abort()
        return
      }
      const total = length > 0 ? base + length : 0
      arm()
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        arm()
        if (fd !== null) {
          try {
            writeSync(fd, chunk)
          } catch (e) {
            finish(() => reject(e as Error))
            req.abort()
            return
          }
        } else chunks.push(chunk)
        received += chunk.length
        onProgress?.(base + received, total)
      })
      res.on('end', () => {
        if (fd !== null && length > 0 && received !== length) {
          finish(() => reject(describe(url, new Error('net::ERR_CONTENT_LENGTH_MISMATCH'))))
          return
        }
        const norm: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          norm[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
        }
        const status = res.statusCode
        finish(() =>
          resolve({ status, ok: status >= 200 && status < 300, headers: norm, body: Buffer.concat(chunks) })
        )
      })
      res.on('error', (e: Error) => finish(() => reject(describe(url, e))))
    })
    req.on('error', (e) => finish(() => reject(describe(url, e))))

    if (payload) req.write(payload)
    req.end()
  })
}

// Fallos pasajeros del edge (Fastly/Varnish delante de raw.githubusercontent y de los CDN de
// Mojang): "503 Backend.max_conn reached" cuando el POP no tiene el archivo en caché y el origen
// rechaza la conexión. Sin reintento un 503 de un segundo tumbaba el launch completo.
// 416: Range de un archivo a medias que ya no casa; requestOnce lo borra y se reintenta de 0.
const RETRY_STATUS = new Set([408, 416, 425, 429, 500, 502, 503, 504])
const RETRIES = 3
const BACKOFF_MS = 1000 // base: 1s, 2s, 4s (antes de aplicar el jitter)
const MAX_RETRY_AFTER_MS = 10_000

// raw.githubusercontent responde 403 cuando bloquea la IP del cliente (VPN, proxy, CGNAT
// compartido, IP marcada por abuso). Reintentar contra el origen no sirve, pero los mirrors
// sirven el mismo archivo desde otra red: se salta directo a ellos.
// 3xx: net.request ya sigue las redirecciones válidas, así que un 3xx que llega aquí no se pudo
// seguir (sin Location, destino bloqueado). Lo devuelve un intermediario del usuario (antivirus
// con escaneo HTTPS, filtro del ISP, proxy), nunca raw: los mirrors van por otra red.
// 404: el primer destino puede ser el mirror R2 con el archivo aún sin subir; las demás fuentes
// lo tienen. Si todas dan 404 se devuelve el 404 del primero.
const MIRROR_STATUS = new Set([301, 302, 303, 307, 308, 403, 404])

// Bloqueo por IP: 403 (raw, release) o 429 (límite de peticiones anónimas de GitHub). Pasa en
// minutos, así que tras agotar todas las fuentes se espera y se repite una sola vuelta.
const BLOCK_STATUS = new Set([403, 429])
const BLOCKED_WAIT_MS = 20_000

/** Espera cancelable con `signal`. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = (): void => {
      clearTimeout(t)
      reject(abortError())
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

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

// Conexiones simultáneas por host de GitHub. La sync baja 8 archivos a la vez; contra raw eso
// dispara el límite de peticiones anónimas (403/429) y bloquea la IP unos minutos. El mirror R2
// (Cloudflare) no tiene este límite y va sin tope extra.
const HOST_LIMIT: Record<string, number> = {
  'raw.githubusercontent.com': 3,
  'github.com': 4,
  'api.github.com': 2,
  'cdn.jsdelivr.net': 3,
  'cdn.statically.io': 3
}
const hostActive = new Map<string, number>()
const hostQueue = new Map<string, (() => void)[]>()

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Corre `fn` cuando haya hueco para el host de `url` (sin tope si el host no está en la tabla). */
async function withHostSlot<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = hostOf(url)
  const limit = HOST_LIMIT[host]
  if (!limit) return fn()
  if ((hostActive.get(host) ?? 0) >= limit) {
    // Espera su turno: quien libere el hueco se lo pasa directo, sin bajar el contador.
    await new Promise<void>((resolve) => {
      const q = hostQueue.get(host) ?? []
      q.push(resolve)
      hostQueue.set(host, q)
    })
  } else {
    hostActive.set(host, (hostActive.get(host) ?? 0) + 1)
  }
  try {
    return await fn()
  } finally {
    const next = hostQueue.get(host)?.shift()
    if (next) next()
    else hostActive.set(host, (hostActive.get(host) ?? 1) - 1)
  }
}

// Cuando el POP de Fastly delante de raw.githubusercontent se cae (503 Backend.max_conn reached)
// el corte dura minutos, mucho más que cualquier backoff, y tumbaba el launch entero aunque el
// archivo estuviera perfectamente publicado. Estos CDNs sirven el MISMO repo/rama desde otra red,
// así que un fallo regional de Fastly deja de ser un punto único de fallo. Solo se usan cuando el
// origen ya agotó sus reintentos: cachean por nombre de rama y pueden ir unas horas desfasados.
// Solo para descargas a memoria (JSON y archivos chicos): jsDelivr da 403 a los archivos de más
// de 20 MB y Statically se cuelga con los jars, así que con `toFile` no se usan.
function mirrorsFor(url: string, toFile: boolean): string[] {
  if (toFile) return []
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url)
  if (!m) return []
  const [, owner, repo, ref, path] = m
  return [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`,
    `https://cdn.statically.io/gh/${owner}/${repo}/${ref}/${path}`
  ]
}

type Attempt = { host: string; status: number | string }

interface Round {
  /** 2xx o status definitivo del primero (`done`), o el status a reportar si nada salió bien. */
  res?: HttpResponse
  done: boolean
  err?: unknown
  attempts: Attempt[]
}

/** Una vuelta por todos los destinos, con reintentos por destino. */
async function oneRound(targets: string[], init: HttpInit, attempts: number): Promise<Round> {
  let lastRes: HttpResponse | undefined
  let lastErr: unknown
  const tried: Attempt[] = []

  for (const [i, target] of targets.entries()) {
    const isMirror = i > 0
    let final: number | string | undefined
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const backoff = jitter(BACKOFF_MS * 2 ** (attempt - 1))
      if (init.signal?.aborted) throw abortError()
      try {
        const res = await withHostSlot(target, () => requestOnce(target, init))
        final = res.status
        // Del mirror solo vale un 2xx: su 404 (archivo no cacheado, repo privado, jar de más de
        // 20 MB) no dice nada del primero y no debe sustituir a su status real.
        const toMirror = !isMirror && targets.length > 1 && MIRROR_STATUS.has(res.status)
        // 403/429 nunca es definitivo: puede ser un bloqueo pasajero (ver httpRequest).
        const definitive = !RETRY_STATUS.has(res.status) && !BLOCK_STATUS.has(res.status)
        if (res.ok || (!isMirror && !toMirror && definitive)) {
          return { res, done: true, attempts: tried }
        }
        if (!isMirror || !lastRes) lastRes = res
        if (toMirror) break
        if (attempt < attempts && RETRY_STATUS.has(res.status)) {
          await wait(retryAfterMs(res) ?? backoff, init.signal)
        } else if (attempt < attempts) {
          break // status definitivo del mirror: pasar al siguiente sin gastar reintentos
        }
      } catch (e) {
        if (isAbortError(e)) throw e
        lastErr = e
        final = /ERR_[A-Z_]+/.exec(String((e as Error)?.cause ?? e))?.[0] ?? 'error'
        if (attempt < attempts) await wait(backoff, init.signal)
      }
    }
    if (final !== undefined) tried.push({ host: hostOf(target), status: final })
  }
  return { res: lastRes, done: false, err: lastErr, attempts: tried }
}

/** Todas las fuentes que respondieron dieron 403/429 (los fallos de red no cuentan en contra). */
function isBlocked(attempts: Attempt[]): boolean {
  const statuses = attempts.map((a) => a.status).filter((s): s is number => typeof s === 'number')
  return statuses.length > 0 && statuses.every((s) => BLOCK_STATUS.has(s))
}

/**
 * Petición HTTP(S) con redirecciones seguidas y reintentos con backoff exponencial ante status
 * pasajeros o cortes de red. Con varios destinos (`url`, luego `init.mirrors`, luego los CDN de
 * raw) pasa al siguiente si el anterior agota sus reintentos o responde 403/404/3xx. Si todos
 * terminan en 403/429 (IP bloqueada o limitada por GitHub) espera `blockedWaitMs` y repite una
 * vuelta. Solo reintenta métodos idempotentes (GET/HEAD): los POST de auth tienen su propia
 * lógica de polling. Rechaza solo por fallo de red, no por status.
 *
 * `onProgress` puede retroceder a 0 si hay reintento (empieza una descarga nueva).
 */
export async function httpRequest(url: string, init: HttpInit = {}): Promise<HttpResponse> {
  const method = (init.method ?? 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  const targets = idempotent ? [url, ...(init.mirrors ?? []), ...mirrorsFor(url, !!init.toFile)] : [url]
  const attempts = idempotent ? Math.max(0, init.retries ?? RETRIES) + 1 : 1

  let round = await oneRound(targets, init, attempts)
  // Solo quien lo pide espera (la sync, vía ensureFile): un 403 de auth no es un bloqueo.
  const waitMs = init.blockedWaitMs ?? (init.onBlocked ? BLOCKED_WAIT_MS : 0)
  if (!round.done && idempotent && waitMs > 0 && isBlocked(round.attempts)) {
    const ms = jitter(waitMs)
    init.onBlocked?.(ms)
    await wait(ms, init.signal)
    round = await oneRound(targets, init, attempts)
  }

  if (round.done && round.res) return round.res
  // Agotados origen y mirrors: se devuelve el último status pasajero (el llamador lo reporta) y
  // solo se lanza si nunca hubo respuesta, es decir si todo fueron fallos de red.
  if (round.res) return { ...round.res, attempts: round.attempts, blocked: isBlocked(round.attempts) }
  throw round.err
}

/** Cuerpo como JSON. Lanza si no es JSON válido (p. ej. el portal cautivo de un wifi). */
export function readJson<T>(res: HttpResponse, url: string): T {
  const NO = Symbol()
  const v = readJsonOr<T | typeof NO>(res, NO)
  if (v === NO) throw new Error(`Respuesta no válida (no es JSON) de ${url} [HTTP ${res.status}]`)
  return v
}

/** Cuerpo como JSON, tolerante: devuelve `fallback` si no parsea. Para cuerpos de error. */
export function readJsonOr<T>(res: HttpResponse, fallback: T): T {
  try {
    return JSON.parse(res.body.toString('utf-8')) as T
  } catch {
    return fallback
  }
}
