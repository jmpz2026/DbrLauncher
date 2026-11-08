// Cadena Xbox Live → XSTS → Minecraft services → perfil.
// A partir del access token de Microsoft obtiene el perfil de Minecraft (uuid + nombre).
import { httpRequest, readJson, readJsonOr, type HttpInit, type HttpResponse } from '../http'
import { tr } from '../idioma'
import { AuthError } from './microsoft'

/** Petición a Xbox/Minecraft: un fallo de red o un 5xx se marcan como pasajeros ('network'). */
async function call(url: string, init: HttpInit): Promise<HttpResponse> {
  let res: HttpResponse
  try {
    res = await httpRequest(url, init)
  } catch (e) {
    throw new AuthError(e instanceof Error ? e.message : String(e), 'network')
  }
  if (res.status >= 500 || res.status === 429) {
    throw new AuthError(tr('err.auth_servicio', { host: new URL(url).host, status: res.status }), 'network')
  }
  return res
}

interface XboxAuth {
  token: string
  uhs: string // userhash
}

async function xblAuthenticate(msAccessToken: string, rpsPrefix: string): Promise<XboxAuth> {
  let res = await xblRequest(msAccessToken, rpsPrefix)
  // El prefijo del ticket depende de quién emitió el token (t= login.live.com, d= Azure v2).
  // Si Xbox lo rechaza, se prueba el otro una vez antes de dar el error.
  if (res.status === 400 || res.status === 401) {
    res = await xblRequest(msAccessToken, rpsPrefix === 't=' ? 'd=' : 't=')
  }
  if (!res.ok) throw new AuthError(tr('err.xbox'), 'other')
  const data = readJson<any>(res, 'user.auth.xboxlive.com')
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

function xblRequest(msAccessToken: string, rpsPrefix: string): Promise<HttpResponse> {
  return call('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `${rpsPrefix}${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
}

async function xstsAuthorize(xblToken: string): Promise<XboxAuth> {
  const res = await call('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  if (res.status === 401) {
    const err = readJsonOr<any>(res, {})
    // Errores comunes de XSTS.
    switch (String(err.XErr)) {
      case '2148916233':
        throw new AuthError(tr('err.xbox_sin_perfil'), 'other')
      case '2148916235':
        throw new AuthError(tr('err.xbox_pais'), 'other')
      case '2148916236':
      case '2148916237':
        throw new AuthError(tr('err.xbox_adulto'), 'other')
      case '2148916238':
        throw new AuthError(tr('err.xbox_menor'), 'other')
      default:
        throw new AuthError(tr('err.xsts'), 'other')
    }
  }
  if (!res.ok) throw new AuthError(tr('err.xsts'), 'other')
  const data = readJson<any>(res, 'xsts.auth.xboxlive.com')
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

async function loginWithXbox(uhs: string, xstsToken: string): Promise<{ token: string; expiresAt: number }> {
  const res = await call('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  })
  if (!res.ok) throw new AuthError(tr('err.mc_login'), 'other')
  const data = readJson<any>(res, 'api.minecraftservices.com/authentication')
  // expires_in viene en segundos (86400 hoy); si falta se asume 1 h para no dar por bueno un token viejo.
  const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600
  return { token: String(data.access_token), expiresAt: Date.now() + ttl * 1000 }
}

export interface McProfile {
  uuid: string // con guiones
  name: string
  accessToken: string // token de Minecraft para lanzar el juego
  expiresAt: number // ms epoch en que caduca accessToken
}

async function getProfile(mcAccessToken: string): Promise<Omit<McProfile, 'accessToken' | 'expiresAt'>> {
  const res = await call('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcAccessToken}` }
  })
  if (res.status === 404) {
    throw new AuthError(tr('err.mc_sin_juego'), 'other')
  }
  if (!res.ok) throw new AuthError(tr('err.mc_perfil'), 'other')
  const data = readJson<any>(res, 'api.minecraftservices.com/minecraft/profile')
  const raw = String(data.id) // sin guiones
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
  return { uuid, name: String(data.name) }
}

/** Del access token de Microsoft al perfil de Minecraft completo. */
export async function fetchMinecraftProfile(msAccessToken: string, rpsPrefix: string): Promise<McProfile> {
  const xbl = await xblAuthenticate(msAccessToken, rpsPrefix)
  const xsts = await xstsAuthorize(xbl.token)
  const mc = await loginWithXbox(xsts.uhs, xsts.token)
  const profile = await getProfile(mc.token)
  return { ...profile, accessToken: mc.token, expiresAt: mc.expiresAt }
}
