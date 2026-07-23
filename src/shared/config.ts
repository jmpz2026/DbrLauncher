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
  newsUrl: 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/news.json',
  // JSON de versión de Forge (overlay con inheritsFrom: "1.7.10").
  forgeJsonUrl: 'https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/forge-1.7.10.json',

  // Autenticación premium (Microsoft OAuth · device code flow).
  // 1) Registrar una app en Azure Portal → Entra ID → App registrations (cuenta personal/consumers).
  // 2) Tipo "public client / native", habilitar "Allow public client flows" = Yes.
  // 3) Pegar el Application (client) ID aquí. Sin secreto (public client).
  auth: {
    azureClientId: 'YOUR_AZURE_CLIENT_ID',
    scope: 'XboxLive.signin offline_access',
    // Tenant 'consumers' = solo cuentas Microsoft personales (las de Minecraft/Xbox).
    deviceCodeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
  }
} as const

// True cuando el client ID sigue sin configurarse.
export const isAzureConfigured = (): boolean => {
  const id: string = CONFIG.auth.azureClientId
  return id !== 'YOUR_AZURE_CLIENT_ID' && id.length > 0
}

// True cuando ya se rellenó el OWNER/REPO del manifest.
export const isManifestConfigured = (): boolean => !CONFIG.manifestUrl.includes('OWNER/REPO')

// True cuando ya se rellenó el JSON de Forge.
export const isForgeConfigured = (): boolean => !CONFIG.forgeJsonUrl.includes('OWNER/REPO')

export type LauncherConfig = typeof CONFIG
