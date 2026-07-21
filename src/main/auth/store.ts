import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import type { Account } from '../../shared/account'

interface Persisted {
  type: Account['type']
  username: string
  uuid: string
  refreshTokenEnc?: string // base64 de safeStorage.encryptString (solo premium)
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

/** Cuenta persistida sin tokens (segura para exponer al renderer). */
export function loadAccount(): Account | null {
  const p = read()
  if (!p) return null
  return { type: p.type, username: p.username, uuid: p.uuid }
}

/** Refresh token descifrado, o null si no hay / no se puede descifrar. */
export function loadRefreshToken(): string | null {
  const p = read()
  if (!p?.refreshTokenEnc) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(p.refreshTokenEnc, 'base64'))
  } catch {
    return null
  }
}

/** Guarda la cuenta. Si viene refreshToken (premium), lo cifra con safeStorage. */
export function saveAccount(account: Account, refreshToken?: string): void {
  const data: Persisted = {
    type: account.type,
    username: account.username,
    uuid: account.uuid
  }
  if (refreshToken && safeStorage.isEncryptionAvailable()) {
    data.refreshTokenEnc = safeStorage.encryptString(refreshToken).toString('base64')
  }
  writeFileSync(filePath(), JSON.stringify(data), 'utf-8')
}

export function clearAccount(): void {
  try {
    const p = filePath()
    if (existsSync(p)) rmSync(p)
  } catch {
    /* no-op */
  }
}
