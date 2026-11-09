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
  // Fuentes de cada archivo del modpack por contenido (`<base><sha1>`, y los parches
  // `<base><sha1viejo>-<sha1nuevo>.dbrpatch`), en orden. raw (la `url` del manifest) va al final.
  // 1) Worker de Cloudflare sobre R2: fuera de GitHub, así un límite o bloqueo de GitHub a la IP
  //    del jugador no tumba la sync. 2) Assets del release `assets-files`. Las dos las sube la
  //    Action de la rama assets. El manifest puede traer su propia lista en `mirrors`.
  assetBases: [
    'https://dbr-assets.dbrlauncher.workers.dev/f/',
    'https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/'
  ],
  // Manifests y forge json en el mirror R2, cada uno con su firma en `<nombre>.sig`.
  metaBase: 'https://dbr-assets.dbrlauncher.workers.dev/m/',
  // Clave pública ECDSA P-256 (SPKI DER en base64). La privada es el secret MANIFEST_SIGN_KEY.
  // P-256 y no Ed25519: Android solo verifica Ed25519 desde la API 33. Misma clave en Android.
  metaSignKey:
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE5vX89swMxkQvjBpfg4r4jgll/+L1KeEGCVs2qXVH/QBcGCYXdlpmiJ1sqqrQ3T+/uVgXvXq0EjHGi/W0F3mr2A==',
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

