import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { authProvider, CONFIG, isPremiumEnabled } from '../../shared/config'
import type { Account, AuthResult, DeviceCodeInfo } from '../../shared/account'
import { makePirataAccount } from './offline'
import { AuthError, pollForToken, refreshToken, requestDeviceCode } from './microsoft'
import { fetchMinecraftProfile } from './minecraft'
import { clearAccount, loadAccount, loadSession, saveAccount, updateSession } from './store'
import { errMsg } from '../errors'
import { isAbortError } from '../http'
import { tr } from '../idioma'

// Márgenes de renovación del token de Minecraft (dura ~24 h):
// - al lanzar se exige que le queden al menos 10 min, para que no caduque al entrar al server;
// - al abrir el launcher se renueva si le quedan menos de 12 h. El launcher se cierra al lanzar
//   el juego, así que cada sesión de juego pasa por aquí: el refresh token de Microsoft se usa (y
//   rota) como mucho una vez cada ~12 h y la sesión solo caduca si el jugador no abre el launcher
//   en mucho tiempo.
const LAUNCH_MARGIN_MS = 10 * 60_000
const KEEPALIVE_MARGIN_MS = 12 * 3600_000
const KEEPALIVE_EVERY_MS = 6 * 3600_000
const NETWORK_RETRY_MS = [2_000, 5_000]

// Hosts que puede abrir el device code flow en el navegador.
const VERIFY_HOSTS = new Set(['www.microsoft.com', 'microsoft.com', 'login.live.com', 'aka.ms'])

let memToken: { token: string; expiresAt: number } | null = null
let inflight: Promise<string> | null = null
let loginAbort: AbortController | null = null
let getWindow: () => BrowserWindow | null = () => null

/** Cuenta para el renderer, con la marca de sesión caducada si es premium. */
function publicAccount(): Account | null {
  const account = loadAccount()
  if (account?.type !== 'premium') return account
  return { ...account, needsRelogin: loadSession()?.needsRelogin ?? false }
}

function notifySession(): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('auth:session-changed', publicAccount())
}

function sendSafe(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

function openVerification(url: string): void {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' && VERIFY_HOSTS.has(u.hostname)) void shell.openExternal(u.toString()).catch(() => {})
  } catch {
    /* URL inválida: el jugador tiene el enlace y el código en pantalla */
  }
}

async function loginPremium(sender: WebContents): Promise<Account> {
  if (!isPremiumEnabled()) throw new Error(tr('err.premium_off'))
  loginAbort?.abort()
  const abort = new AbortController()
  loginAbort = abort
  const providerId = CONFIG.auth.provider
  const provider = authProvider(providerId)
  try {
    const dc = await requestDeviceCode(provider, abort.signal)
    const info: DeviceCodeInfo = {
      userCode: dc.userCode,
      verificationUri: dc.verificationUri,
      expiresIn: dc.expiresIn,
      message: dc.message
    }
    sendSafe(sender, 'auth:device-code', info)
    openVerification(dc.verificationUri)

    const ms = await pollForToken(provider, dc, abort.signal)
    const profile = await fetchMinecraftProfile(ms.accessToken, provider.rpsPrefix)
    const account: Account = { type: 'premium', username: profile.name, uuid: profile.uuid }
    saveAccount(account, {
      provider: providerId,
      refreshToken: ms.refreshToken,
      mcToken: profile.accessToken,
      mcExpiresAt: profile.expiresAt
    })
    memToken = { token: profile.accessToken, expiresAt: profile.expiresAt }
    return account
  } finally {
    if (loginAbort === abort) loginAbort = null
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Refresh de Microsoft + cadena Xbox → Minecraft, con reintentos ante fallos de red. */
async function renew(marginMs: number): Promise<string> {
  const s = loadSession()
  if (!s) throw new Error(tr('err.sin_sesion'))
  if (s.mcToken && !s.needsRelogin && s.mcExpiresAt - Date.now() > marginMs) {
    memToken = { token: s.mcToken, expiresAt: s.mcExpiresAt }
    return s.mcToken
  }
  if (s.needsRelogin || !s.refreshToken) throw new AuthError(tr('err.ms_sesion'), 'expired')

  const provider = authProvider(s.provider)
  // Si el jugador cerró sesión o entró con otra cuenta mientras se renovaba, no tocar nada.
  const same = (): boolean => loadAccount()?.uuid === s.account.uuid
  let refresh = s.refreshToken
  for (let attempt = 0; ; attempt++) {
    try {
      const ms = await refreshToken(provider, refresh)
      // Guardar el refresh token rotado YA, antes de la cadena de Xbox: si esta falla, el
      // siguiente intento debe usar el nuevo y no uno que Microsoft quizá ya invalidó.
      if (!same()) throw new Error(tr('err.sin_sesion'))
      if (ms.refreshToken !== refresh) {
        refresh = ms.refreshToken
        updateSession({ refreshToken: refresh })
      }
      const profile = await fetchMinecraftProfile(ms.accessToken, provider.rpsPrefix)
      if (!same()) throw new Error(tr('err.sin_sesion'))
      updateSession({
        // El jugador puede haberse cambiado el nombre en minecraft.net.
        account: { type: 'premium', username: profile.name, uuid: profile.uuid },
        mcToken: profile.accessToken,
        mcExpiresAt: profile.expiresAt,
        needsRelogin: false
      })
      memToken = { token: profile.accessToken, expiresAt: profile.expiresAt }
      if (profile.name !== s.account.username) notifySession()
      return profile.accessToken
    } catch (e) {
      if (e instanceof AuthError && e.kind === 'expired' && same()) {
        updateSession({ needsRelogin: true, mcToken: null, mcExpiresAt: 0 })
        memToken = null
        notifySession()
        throw e
      }
      const network = e instanceof AuthError && e.kind === 'network'
      if (network && attempt < NETWORK_RETRY_MS.length) {
        await sleep(NETWORK_RETRY_MS[attempt])
        continue
      }
      if (network) throw new AuthError(tr('err.ms_sesion_red', { detalle: errMsg(e) }), 'network')
      throw e
    }
  }
}

/**
 * Token de Minecraft válido para la cuenta actual. Null para cuentas no premium.
 * Lanza si la sesión premium caducó (hay que volver a entrar) o si no se pudo renovar por red:
 * nunca se lanza una cuenta premium con un token falso, el servidor la rechazaría.
 */
export async function ensureMcToken(marginMs = LAUNCH_MARGIN_MS): Promise<string | null> {
  if (loadAccount()?.type !== 'premium') return null
  if (memToken && memToken.expiresAt - Date.now() > marginMs) return memToken.token
  // Una sola renovación a la vez: el arranque y el botón Jugar no deben rotar el token dos veces.
  inflight ??= renew(marginMs).finally(() => (inflight = null))
  return inflight
}

/** Renovación en segundo plano para que el refresh token no caduque por falta de uso. */
function keepAlive(): void {
  ensureMcToken(KEEPALIVE_MARGIN_MS).catch(() => {
    /* expirada → ya se avisó al renderer; red → se reintenta en el próximo ciclo o al lanzar */
  })
}

/** Registra todos los handlers IPC de autenticación. Llamar una vez al arrancar. */
export function registerAuth(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter

  ipcMain.handle('auth:get', (): Account | null => publicAccount())

  ipcMain.handle('auth:login-pirata', (_e, username: string): AuthResult => {
    try {
      const account = makePirataAccount(username)
      saveAccount(account)
      memToken = null
      return { ok: true, account }
    } catch (err) {
      return { ok: false, error: errMsg(err) }
    }
  })

  ipcMain.handle('auth:login-premium', async (e): Promise<AuthResult> => {
    try {
      const account = await loginPremium(e.sender)
      return { ok: true, account }
    } catch (err) {
      if (isAbortError(err)) return { ok: false, error: '', cancelled: true }
      return { ok: false, error: errMsg(err) }
    }
  })

  ipcMain.handle('auth:cancel-premium', (): void => {
    loginAbort?.abort()
  })

  ipcMain.handle('auth:logout', (): void => {
    loginAbort?.abort()
    clearAccount()
    memToken = null
  })

  keepAlive()
  setInterval(keepAlive, KEEPALIVE_EVERY_MS).unref?.()
}
