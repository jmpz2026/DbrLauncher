import { createHash } from 'crypto'
import type { Account } from '../../shared/account'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

/**
 * UUID offline idéntico al que genera Minecraft para cuentas no premium:
 * UUID v3 de los bytes de `OfflinePlayer:<nombre>` (Java UUID.nameUUIDFromBytes).
 */
export function offlineUuid(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // versión 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // variante IETF
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Valida el nombre y construye la cuenta pirata. Lanza si el nombre no es válido. */
export function makePirataAccount(rawName: string): Account {
  const username = rawName.trim()
  if (!NAME_RE.test(username)) {
    throw new Error('El nombre debe tener 3-16 caracteres: letras, números o guion bajo.')
  }
  return { type: 'pirata', username, uuid: offlineUuid(username) }
}
