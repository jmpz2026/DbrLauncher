import { ipcMain, shell, type WebContents } from 'electron'
import { isAzureConfigured } from '../../shared/config'
import type { Account, AuthResult, DeviceCodeInfo } from '../../shared/account'
import { makePirataAccount } from './offline'
import { requestDeviceCode, pollForToken, refreshToken } from './microsoft'
import { fetchMinecraftProfile } from './minecraft'
import { loadAccount, loadRefreshToken, saveAccount, clearAccount } from './store'

// Token de Minecraft en memoria de la sesión actual (para lanzar el juego en Fase 5).
let currentMcToken: string | null = null

async function loginPremium(sender: WebContents): Promise<Account> {
  if (!isAzureConfigured()) {
    throw new Error('Falta configurar el Azure client ID en src/shared/config.ts (auth.azureClientId).')
  }
  const dc = await requestDeviceCode()

  const info: DeviceCodeInfo = {
    userCode: dc.userCode,
    verificationUri: dc.verificationUri,
    expiresIn: dc.expiresIn,
    message: dc.message
  }
  sender.send('auth:device-code', info)
  // Abrir el navegador en la página de verificación de Microsoft.
  void shell.openExternal(dc.verificationUri)

  const ms = await pollForToken(dc)
  const profile = await fetchMinecraftProfile(ms.accessToken)
  currentMcToken = profile.accessToken

  const account: Account = { type: 'premium', username: profile.name, uuid: profile.uuid }
  saveAccount(account, ms.refreshToken)
  return account
}

/** Registra todos los handlers IPC de autenticación. Llamar una vez al arrancar. */
export function registerAuth(): void {
  ipcMain.handle('auth:get', (): Account | null => loadAccount())

  ipcMain.handle('auth:login-pirata', (_e, username: string): AuthResult => {
    try {
      const account = makePirataAccount(username)
      saveAccount(account)
      currentMcToken = null
      return { ok: true, account }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:login-premium', async (e): Promise<AuthResult> => {
    try {
      const account = await loginPremium(e.sender)
      return { ok: true, account }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:logout', (): void => {
    clearAccount()
    currentMcToken = null
  })
}

/** Token de Minecraft de la sesión (null si es pirata o aún no se resolvió). */
export function getMcToken(): string | null {
  return currentMcToken
}

/**
 * Garantiza un token de Minecraft para lanzar: usa el de la sesión, o si es premium
 * lo renueva silenciosamente con el refresh token guardado. Null para pirata.
 */
export async function ensureMcToken(): Promise<string | null> {
  if (currentMcToken) return currentMcToken
  const account = loadAccount()
  if (account?.type !== 'premium') return null

  const refresh = loadRefreshToken()
  if (!refresh) return null
  try {
    const ms = await refreshToken(refresh)
    const profile = await fetchMinecraftProfile(ms.accessToken)
    currentMcToken = profile.accessToken
    saveAccount(account, ms.refreshToken) // rotar el refresh token
    return currentMcToken
  } catch {
    return null // sesión premium expirada: se lanzará con token dummy
  }
}
