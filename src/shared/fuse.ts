// Estado de libfuse2 en Linux (necesaria para montar el AppImage con doble-click).
// En Windows/Mac 'missing' siempre es false: no aplica.
export interface FuseStatus {
  missing: boolean
  distro?: string // id de /etc/os-release (ubuntu, fedora, arch…)
  installCmd?: string // comando que instala libfuse2 en esa distro
  canAutoInstall: boolean // hay pkexec para instalar con un clic (prompt gráfico)
}

export interface FuseInstallResult {
  ok: boolean
  error?: string
}
