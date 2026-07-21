import { app } from 'electron'
import { join } from 'path'

/** Carpeta donde se extrae el JRE 8 gestionado. */
export const getRuntimeDir = (): string => join(app.getPath('userData'), 'runtime', 'jre8')

/** Marcador JSON con la ruta y versión del JRE instalado (para no re-descargar). */
export const getRuntimeInfoFile = (): string =>
  join(app.getPath('userData'), 'runtime', 'jre8.json')
