// Tipos de cuenta compartidos entre main y renderer.
export type AccountType = 'pirata' | 'premium'

export interface Account {
  type: AccountType
  username: string
  uuid: string // con guiones, formato Minecraft
  /** Solo premium: Microsoft rechazó el refresh token y hay que volver a entrar. */
  needsRelogin?: boolean
}

// Resultado estándar de las operaciones de login por IPC.
export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; cancelled?: boolean }

// Datos del device code flow que main envía al renderer mientras espera.
export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  message: string
}
