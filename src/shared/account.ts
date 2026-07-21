// Tipos de cuenta compartidos entre main y renderer.
export type AccountType = 'pirata' | 'premium'

export interface Account {
  type: AccountType
  username: string
  uuid: string // con guiones, formato Minecraft
}

// Resultado estándar de las operaciones de login por IPC.
export type AuthResult = { ok: true; account: Account } | { ok: false; error: string }

// Datos del device code flow que main envía al renderer mientras espera.
export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  message: string
}
