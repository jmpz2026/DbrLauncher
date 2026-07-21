import { CONFIG } from '../../shared/config'

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

const { azureClientId, scope, deviceCodeUrl, tokenUrl } = CONFIG.auth

/** Paso 1: pedir un device code. El usuario abrirá la URL e introducirá userCode. */
export async function requestDeviceCode(): Promise<DeviceCode> {
  const res = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: azureClientId, scope })
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`No se pudo iniciar el login de Microsoft: ${data.error_description ?? res.status}`)
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri),
    expiresIn: Number(data.expires_in),
    interval: Number(data.interval ?? 5),
    message: String(data.message ?? '')
  }
}

/** Paso 2: sondear el token endpoint hasta que el usuario autorice (o expire). */
export async function pollForToken(dc: DeviceCode): Promise<MsToken> {
  const deadline = Date.now() + dc.expiresIn * 1000
  let intervalMs = Math.max(dc.interval, 1) * 1000

  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: azureClientId,
        device_code: dc.deviceCode
      })
    })
    const data = (await res.json()) as Record<string, unknown>

    if (res.ok) {
      return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token) }
    }

    switch (data.error) {
      case 'authorization_pending':
        break // seguir esperando
      case 'slow_down':
        intervalMs += 5000
        break
      case 'authorization_declined':
        throw new Error('Autorización cancelada en Microsoft.')
      case 'expired_token':
        throw new Error('El código expiró. Intenta de nuevo.')
      default:
        throw new Error(`Error de Microsoft: ${data.error_description ?? data.error}`)
    }
  }
  throw new Error('El código expiró. Intenta de nuevo.')
}

/** Renueva el access token usando el refresh token guardado. */
export async function refreshToken(refresh: string): Promise<MsToken> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: azureClientId,
      refresh_token: refresh,
      scope
    })
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) throw new Error('La sesión de Microsoft expiró. Vuelve a iniciar sesión.')
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token ?? refresh)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
