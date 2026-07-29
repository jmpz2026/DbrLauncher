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

/** Petición HTTP(S) con redirecciones seguidas. Rechaza solo por fallo de red, no por status. */
export function httpRequest(url: string, init: HttpInit = {}): Promise<HttpResponse> {
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
