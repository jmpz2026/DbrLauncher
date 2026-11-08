// Configuración central del launcher. Editar aquí datos del server y del repo del modpack.
export const CONFIG = {
  // Identidad
  brand: 'Dbr',

  // Servidor de Minecraft (para el ping de estado)
  serverHost: 'dragonblock.online',
  serverPort: 25625,

  // Versiones
  minecraft: '1.7.10',
  forge: '10.13.4.1614', // versión de Forge para 1.7.10

  // Hosting del modpack (repo DBR-ASSETS, servido por raw.githubusercontent).
  // Dos variantes del modpack que comparten Forge/MC: 'full' (por defecto) y 'lite'.
  // El manifest lite vive junto al full en la rama assets; sus jars van en la subcarpeta
  // lite/ (mismo `path` local, distinta url/sha1) → cambiar de variante re-sincroniza solo.
  manifestUrl: 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest.json',
  manifestUrlLite: 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest-lite.json',
  // Variante experimental (mods en pruebas, no apta para el servidor): mismo esquema que lite,
  // jars en la subcarpeta experimental/.
  manifestUrlExperimental:
    'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest-experimental.json',
  // Copia de cada archivo del modpack como asset de un release, con su sha1 por nombre. La sube
  // la Action de la rama assets. Se sirve desde objects.githubusercontent.com, otra red distinta
  // de raw: cuando raw bloquea la IP del jugador (403) la sync baja de aquí.
  assetMirrorBase: 'https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/',
  // JSON de versión de Forge (overlay con inheritsFrom: "1.7.10").
  forgeJsonUrl: 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/forge-1.7.10.json',

  // Autenticación premium (Microsoft OAuth · device code flow). Dos proveedores:
  // - 'live': client ID público del Minecraft Launcher oficial contra login.live.com. Mojang ya lo
  //   tiene aprobado, así que login_with_xbox no da 403. No es nuestro: Microsoft puede cortarlo.
  // - 'azure': nuestra app de Azure (consumers). Solo funciona cuando Mojang apruebe el client ID
  //   en aka.ms/mce-reviewappid; hasta entonces login_with_xbox devuelve 403.
  // Cambiar `provider` obliga a volver a entrar: cada refresh token solo vale con su client ID.
  auth: {
    premiumEnabled: true,
    provider: 'live' as AuthProviderId,
    providers: {
      live: {
        clientId: '00000000402b5328',
        scope: 'service::user.auth.xboxlive.com::MBI_SSL',
        deviceCodeUrl: 'https://login.live.com/oauth20_connect.srf',
        tokenUrl: 'https://login.live.com/oauth20_token.srf',
        // login.live.com espera el ticket RPS con prefijo t=; los tokens de Azure v2 usan d=.
        rpsPrefix: 't='
      },
      azure: {
        clientId: 'cea6378f-0390-4f9f-8f41-a4f512877fe5',
        scope: 'XboxLive.signin offline_access',
        // Tenant 'consumers' = solo cuentas Microsoft personales (las de Minecraft/Xbox).
        deviceCodeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
        tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        rpsPrefix: 'd='
      }
    }
  }
} as const

export type AuthProviderId = 'live' | 'azure'

export interface AuthProvider {
  clientId: string
  scope: string
  deviceCodeUrl: string
  tokenUrl: string
  rpsPrefix: string
}

export const authProvider = (id: AuthProviderId = CONFIG.auth.provider): AuthProvider =>
  CONFIG.auth.providers[id]

// True cuando el login premium está activado.
export const isPremiumEnabled = (): boolean => CONFIG.auth.premiumEnabled

