// Estado del servidor de Minecraft (Server List Ping).
export interface ServerStatus {
  online: boolean
  players?: number
  max?: number
  version?: string
  motd?: string
  latencyMs?: number
  error?: string
}
