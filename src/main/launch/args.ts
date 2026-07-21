import { delimiter } from 'path'

export interface LaunchContext {
  // Cuenta
  username: string
  uuid: string
  accessToken: string
  userType: string // 'msa' (premium) | 'legacy' (offline)
  // Instancia
  versionName: string
  gameDir: string
  assetsDir: string
  assetIndex: string
  nativesDir: string
  classpath: string[] // rutas absolutas de jars (libs + client)
  mainClass: string
  minecraftArguments: string
  // JVM
  ramGb: number
  extraJvm?: string[]
  // Ventana
  width?: number
  height?: number
  fullscreen?: boolean
}

/** Sustituye los placeholders ${...} de los minecraftArguments de 1.7.10. */
export function substituteGameArgs(template: string, ctx: LaunchContext): string[] {
  const map: Record<string, string> = {
    auth_player_name: ctx.username,
    version_name: ctx.versionName,
    game_directory: ctx.gameDir,
    assets_root: ctx.assetsDir,
    game_assets: ctx.assetsDir,
    assets_index_name: ctx.assetIndex,
    auth_uuid: ctx.uuid,
    auth_access_token: ctx.accessToken,
    auth_session: `token:${ctx.accessToken}:${ctx.uuid}`,
    user_properties: '{}',
    user_type: ctx.userType
  }
  return template
    .trim()
    .split(/\s+/)
    .map((tok) => tok.replace(/\$\{(\w+)\}/g, (_m, k: string) => map[k] ?? `\${${k}}`))
}

/** Construye la lista completa de argumentos para `java`. */
export function buildLaunchArgs(ctx: LaunchContext): string[] {
  const jvm = [
    `-Xmx${ctx.ramGb}G`,
    '-Xms512M',
    `-Djava.library.path=${ctx.nativesDir}`,
    `-Dminecraft.launcher.brand=DbrLauncher`,
    ...(ctx.extraJvm ?? []),
    '-cp',
    ctx.classpath.join(delimiter)
  ]
  const game = substituteGameArgs(ctx.minecraftArguments, ctx)
  if (ctx.width) game.push('--width', String(ctx.width))
  if (ctx.height) game.push('--height', String(ctx.height))
  if (ctx.fullscreen) game.push('--fullscreen')

  return [...jvm, ctx.mainClass, ...game]
}
