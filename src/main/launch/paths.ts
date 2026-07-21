import { app } from 'electron'
import { join } from 'path'
import { getGameDir } from '../sync/paths'

export { getGameDir }

export const librariesDir = (): string => join(app.getPath('userData'), 'libraries')
export const assetsDir = (): string => join(app.getPath('userData'), 'assets')
export const versionsDir = (): string => join(app.getPath('userData'), 'versions')
