import { app } from 'electron'
import { join } from 'path'

/** Directorio de la instancia de Minecraft gestionada por el launcher. */
export const getGameDir = (): string => join(app.getPath('userData'), 'game')

/** Índice de archivos que el launcher gestiona (para borrar los obsoletos). */
export const getManagedFile = (): string => join(app.getPath('userData'), 'managed.json')
