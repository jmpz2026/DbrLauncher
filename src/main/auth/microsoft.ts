// OAuth de Microsoft con device code flow. Sirve a los dos proveedores de CONFIG.auth
// (login.live.com y Azure v2): mismos parámetros, distintas URLs y client ID.
import type { AuthProvider } from '../../shared/config'
import { abortError, httpRequest, readJsonOr, type HttpResponse } from '../http'
import { tr } from '../idioma'

export interface MsToken {
  accessToken: string
  refreshToken: string
}

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
  message: string
}

/**
 * Tipo de fallo, para decidir qué hacer con la sesión guardada:
 * - expired: Microsoft ya no acepta el refresh token → hay que volver a entrar.
 * - network: no hubo respuesta útil (sin red, timeout, 5xx) → conservar la sesión y reintentar.
 * - other: cualquier otro error.
 */
export type AuthErrorKind = 'expired' | 'network' | 'other'

export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: AuthErrorKind
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

// Códigos OAuth que significan "el refresh token ya no sirve".
const EXPIRED_CODES = new Set(['invalid_grant', 'interaction_required', 'consent_required', 'bad_verification_code'])

/** Clasifica una respuesta de error del token endpoint. */
function kindOf(res: HttpResponse, error: unknown): AuthErrorKind {
  if (res.status >= 500 || res.status === 429 || res.status === 408) return 'network'
  return EXPIRED_CODES.has(String(error)) ? 'expired' : 'other'
}

/** POST al token endpoint. Un fallo de red se convierte en AuthError('network'). */
async function postForm(
  url: string,
  form: Record<string, string>,
  signal?: AbortSignal
): Promise<{ res: HttpResponse; data: Record<string, unknown> }> {
  let res: HttpResponse
  try {
    res = await httpRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    throw new AuthError(e instanceof Error ? e.message : String(e), 'network')
  }
  return { res, data: readJsonOr<Record<string, unknown>>(res, {}) }
}

/** Paso 1: pedir un device code. El usuario abrirá la URL e introducirá userCode. */
export async function requestDeviceCode(p: AuthProvider, signal?: AbortSignal): Promise<DeviceCode> {
  // login.live.com exige response_type=device_code; Azure v2 lo ignora.
  const { res, data } = await postForm(
    p.deviceCodeUrl,
    { client_id: p.clientId, scope: p.scope, response_type: 'device_code' },
    signal
  )
  if (!res.ok || !data.device_code) {
    throw new AuthError(
      tr('err.ms_iniciar', { detalle: String(data.error_description ?? data.error ?? res.status) }),
      kindOf(res, data.error)
    )
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri ?? 'https://www.microsoft.com/link'),
    expiresIn: Number(data.expires_in ?? 900),
    interval: Number(data.interval ?? 5),
    message: String(data.message ?? '')
  }
}

/** Paso 2: sondear el token endpoint hasta que el usuario autorice (o expire / se cancele). */
export async function pollForToken(p: AuthProvider, dc: DeviceCode, signal?: AbortSignal): Promise<MsToken> {
  const deadline = Date.now() + dc.expiresIn * 1000
  let intervalMs = Math.max(dc.interval, 1) * 1000

  while (Date.now() < deadline) {
    await sleep(intervalMs, signal)
    let res: HttpResponse
    let data: Record<string, unknown>
    try {
      ;({ res, data } = await postForm(
        p.tokenUrl,
        {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: p.clientId,
          device_code: dc.deviceCode
        },
        signal
      ))
    } catch (e) {
      // Un corte de red durante la espera no debe tirar el login: se reintenta en el próximo ciclo.
      if (e instanceof AuthError && e.kind === 'network') continue
      throw e
    }

    if (res.ok && data.access_token) {
      return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token ?? '') }
    }

    switch (data.error) {
      case 'authorization_pending':
        break // seguir esperando
      case 'slow_down':
        intervalMs += 5000
        break
      case 'authorization_declined':
      case 'access_denied':
        throw new AuthError(tr('err.ms_cancelado'), 'other')
      case 'expired_token':
        throw new AuthError(tr('err.ms_expiro'), 'other')
      default:
        if (res.status >= 500) continue
        throw new AuthError(
          tr('err.ms_error', { detalle: String(data.error_description ?? data.error ?? res.status) }),
          'other'
        )
    }
  }
  throw new AuthError(tr('err.ms_expiro'), 'other')
}

/** Renueva el access token con el refresh token guardado. Microsoft suele devolver uno nuevo. */
export async function refreshToken(p: AuthProvider, refresh: string): Promise<MsToken> {
  const { res, data } = await postForm(p.tokenUrl, {
    grant_type: 'refresh_token',
    client_id: p.clientId,
    refresh_token: refresh,
    scope: p.scope
  })
  if (!res.ok || !data.access_token) {
    // Cualquier 4xx del refresh (invalid_grant, client no válido, token revocado) significa que
    // ese refresh token ya no sirve. Solo 5xx/408/429 son pasajeros.
    // Un 200 sin token es un portal cautivo o un proxy, no un rechazo de Microsoft.
    const kind = res.ok || kindOf(res, data.error) === 'network' ? 'network' : 'expired'
    throw new AuthError(tr('err.ms_sesion'), kind)
  }
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token ?? refresh)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
