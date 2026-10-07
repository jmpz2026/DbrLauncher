// Estado de la auto-actualización (electron-updater).
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number // en 'downloading'
  manual?: boolean // en 'ready': instalar pide contraseña (.deb), espera al botón
  error?: string
}
