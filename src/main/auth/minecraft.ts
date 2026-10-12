// Cadena Xbox Live → XSTS → Minecraft services → perfil.
// A partir del access token de Microsoft obtiene el perfil de Minecraft (uuid + nombre).
import { httpRequest, readJson, readJsonOr } from '../http'
import { tr } from '../idioma'

interface XboxAuth {
  token: string
  uhs: string // userhash
}

async function xblAuthenticate(msAccessToken: string): Promise<XboxAuth> {
  const res = await httpRequest('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  if (!res.ok) throw new Error(tr('err.xbox'))
  const data = readJson<any>(res, 'user.auth.xboxlive.com')
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

async function xstsAuthorize(xblToken: string): Promise<XboxAuth> {
  const res = await httpRequest('https://xsts.auth.xboxlive.com/xsts/authorize', {
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
        throw new Error(tr('err.xbox_sin_perfil'))
      case '2148916235':
        throw new Error(tr('err.xbox_pais'))
      case '2148916236':
      case '2148916237':
        throw new Error(tr('err.xbox_adulto'))
      case '2148916238':
        throw new Error(tr('err.xbox_menor'))
      default:
        throw new Error(tr('err.xsts'))
    }
  }
  if (!res.ok) throw new Error(tr('err.xsts'))
  const data = readJson<any>(res, 'xsts.auth.xboxlive.com')
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

async function loginWithXbox(uhs: string, xstsToken: string): Promise<string> {
  const res = await httpRequest('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  })
  if (!res.ok) throw new Error(tr('err.mc_login'))
  const data = readJson<any>(res, 'api.minecraftservices.com/authentication')
  return data.access_token as string
}

export interface McProfile {
  uuid: string // con guiones
  name: string
  accessToken: string // token de Minecraft (para lanzar el juego en Fase 5)
}

async function getProfile(mcAccessToken: string): Promise<Omit<McProfile, 'accessToken'>> {
  const res = await httpRequest('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcAccessToken}` }
  })
  if (res.status === 404) {
    throw new Error(tr('err.mc_sin_juego'))
  }
  if (!res.ok) throw new Error(tr('err.mc_perfil'))
  const data = readJson<any>(res, 'api.minecraftservices.com/minecraft/profile')
  const raw = String(data.id) // sin guiones
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
  return { uuid, name: String(data.name) }
}

/** Del access token de Microsoft al perfil de Minecraft completo. */
export async function fetchMinecraftProfile(msAccessToken: string): Promise<McProfile> {
  const xbl = await xblAuthenticate(msAccessToken)
  const xsts = await xstsAuthorize(xbl.token)
  const mcToken = await loginWithXbox(xsts.uhs, xsts.token)
  const profile = await getProfile(mcToken)
  return { ...profile, accessToken: mcToken }
}
