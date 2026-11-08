// Persistencia de la cuenta en userData/account.json.
// Los tokens (refresh de Microsoft y access de Minecraft) van cifrados con safeStorage (DPAPI en
// Windows, llavero del escritorio en Linux). Si en Linux no hay llavero (WM mínimo, sin
// gnome-keyring/kwallet), safeStorage no cifra: entonces se guardan en claro en un archivo 0600.
// Sin ese respaldo el refresh token no se guardaba y el jugador tenía que entrar en cada arranque.
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import type { Account } from '../../shared/account'
import type { AuthProviderId } from '../../shared/config'

type StorageMode = 'safe' | 'plain'

interface Persisted {
  type: Account['type']
  username: string
  uuid: string
  // Solo premium:
  provider?: AuthProviderId
  storage?: StorageMode
  refreshTokenEnc?: string
  mcTokenEnc?: string
  mcExpiresAt?: number
  needsRelogin?: boolean
}

/** Estado completo de la sesión premium, solo para el proceso main. */
export interface StoredSession {
  account: Account
  provider: AuthProviderId
  refreshToken: string | null
  mcToken: string | null
  mcExpiresAt: number
  needsRelogin: boolean
}

export interface SessionPatch {
  account?: Account
  provider?: AuthProviderId
  refreshToken?: string
  mcToken?: string | null
  mcExpiresAt?: number
  needsRelogin?: boolean
}

const filePath = (): string => join(app.getPath('userData'), 'account.json')

function read(): Persisted | null {
  try {
    const p = filePath()
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8')) as Persisted
  } catch {
    return null
  }
}

/** Escritura atómica: un corte a mitad (apagón, antivirus) no deja un JSON roto ni pierde la sesión. */
function write(data: Persisted): void {
  const p = filePath()
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmp, p)
  if (process.platform !== 'win32') {
    try {
      chmodSync(p, 0o600)
    } catch {
      /* no-op */
    }
  }
}

function storageMode(): StorageMode {
  try {
    return safeStorage.isEncryptionAvailable() ? 'safe' : 'plain'
  } catch {
    return 'plain'
  }
}

function seal(secret: string, mode: StorageMode): string {
  return mode === 'safe'
    ? safeStorage.encryptString(secret).toString('base64')
    : Buffer.from(secret, 'utf-8').toString('base64')
}

/** Null si no hay dato o no se puede descifrar (llavero cambiado, archivo copiado de otro PC). */
function open(sealed: string | undefined, mode: StorageMode | undefined): string | null {
  if (!sealed) return null
  try {
    // Archivos de versiones anteriores no tienen `storage`: siempre fueron safeStorage.
    if ((mode ?? 'safe') === 'plain') return Buffer.from(sealed, 'base64').toString('utf-8')
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
  } catch {
    return null
  }
}

/** Cuenta persistida sin tokens (segura para exponer al renderer). */
export function loadAccount(): Account | null {
  const p = read()
  if (!p) return null
  return { type: p.type, username: p.username, uuid: p.uuid }
}

/** Sesión premium con los tokens descifrados. Null si no hay cuenta o no es premium. */
export function loadSession(): StoredSession | null {
  const p = read()
  if (!p || p.type !== 'premium') return null
  const refreshToken = open(p.refreshTokenEnc, p.storage)
  return {
    account: { type: p.type, username: p.username, uuid: p.uuid },
    // Cuentas guardadas antes de existir `provider` se crearon con la app de Azure.
    provider: p.provider ?? 'azure',
    refreshToken,
    mcToken: open(p.mcTokenEnc, p.storage),
    mcExpiresAt: p.mcExpiresAt ?? 0,
    // Sin refresh token legible la sesión no se puede renovar: hay que volver a entrar.
    needsRelogin: Boolean(p.needsRelogin) || !refreshToken
  }
}

/** Guarda una cuenta nueva (login). Para premium, `session` trae los tokens. */
export function saveAccount(account: Account, session?: Omit<SessionPatch, 'account'>): void {
  const data: Persisted = { type: account.type, username: account.username, uuid: account.uuid }
  if (account.type === 'premium' && session) {
    const mode = storageMode()
    data.provider = session.provider
    data.storage = mode
    if (session.refreshToken) data.refreshTokenEnc = seal(session.refreshToken, mode)
    if (session.mcToken) data.mcTokenEnc = seal(session.mcToken, mode)
    data.mcExpiresAt = session.mcExpiresAt ?? 0
    data.needsRelogin = false
  }
  write(data)
}

/** Actualiza campos de la sesión premium guardada sin tocar el resto. */
export function updateSession(patch: SessionPatch): void {
  const p = read()
  if (!p || p.type !== 'premium') return
  const prevMode = p.storage ?? 'safe'
  const mode = storageMode()
  // Al cambiar de modo (llavero que aparece/desaparece) se re-sella lo que se pueda leer.
  if (mode !== prevMode) {
    const r = open(p.refreshTokenEnc, prevMode)
    const m = open(p.mcTokenEnc, prevMode)
    p.refreshTokenEnc = r ? seal(r, mode) : undefined
    p.mcTokenEnc = m ? seal(m, mode) : undefined
    p.storage = mode
  }
  if (patch.account) {
    p.username = patch.account.username
    p.uuid = patch.account.uuid
  }
  if (patch.provider) p.provider = patch.provider
  if (patch.refreshToken) p.refreshTokenEnc = seal(patch.refreshToken, mode)
  if (patch.mcToken !== undefined) p.mcTokenEnc = patch.mcToken ? seal(patch.mcToken, mode) : undefined
  if (patch.mcExpiresAt !== undefined) p.mcExpiresAt = patch.mcExpiresAt
  if (patch.needsRelogin !== undefined) p.needsRelogin = patch.needsRelogin
  write(p)
}

export function clearAccount(): void {
  try {
    const p = filePath()
    if (existsSync(p)) rmSync(p)
  } catch {
    /* no-op */
  }
}
