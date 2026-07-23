import { create } from 'zustand'
import type { Account } from '../../shared/account'
import type { SyncProgress, SyncSummary } from '../../shared/sync'
import type { JavaInfo, JavaProgress } from '../../shared/java'
import type { LaunchProgress } from '../../shared/launch'
import { DEFAULT_JVM_ARGS, type LauncherSettings, type ModpackVariant } from '../../shared/settings'
import type { ServerStatus } from '../../shared/status'
import type { UpdateStatus } from '../../shared/update'

export type Tab = 'home' | 'news' | 'settings'
export type { Account, AccountType } from '../../shared/account'

// Marca temporal del último ping para no repetirlo en cada cambio de pestaña.
let lastPingAt = 0

interface State {
  tab: Tab
  setTab: (t: Tab) => void

  // Sesión
  ready: boolean // ya se consultó la cuenta persistida
  account: Account | null
  setAccount: (a: Account | null) => void
  hydrate: () => Promise<void>
  logout: () => Promise<void>

  // Sincronización de mods
  syncing: boolean
  syncProgress: SyncProgress | null
  syncSummary: SyncSummary | null
  syncError: string
  startSync: () => Promise<void>

  // Lanzamiento
  launching: boolean // preparando/descargando antes de arrancar
  launchProgress: LaunchProgress | null
  launchError: string
  gameRunning: boolean // el proceso de Minecraft está vivo
  play: () => Promise<void> // sync + launch

  // Runtime de Java
  javaInfo: JavaInfo | null
  javaBusy: boolean
  javaProgress: JavaProgress | null
  javaError: string
  loadJava: () => Promise<void>
  ensureJava: () => Promise<void>

  // Ajustes (persistidos)
  ramGb: number
  width: number
  height: number
  fullscreen: boolean
  jvmArgs: string
  modpackVariant: ModpackVariant // 'full' | 'lite'
  autoSyncMods: boolean // sincronizar mods al dar Jugar
  maxRamGb: number // tope asignable según la RAM del equipo (deja headroom al SO)
  totalRamGb: number // RAM física total del equipo (para el aviso)
  loadSettings: () => Promise<void>
  setSetting: (patch: Partial<LauncherSettings>) => Promise<void>
  setRamGb: (n: number) => void

  // Estado del servidor
  serverStatus: ServerStatus | null
  pinging: boolean
  ping: () => Promise<void>

  // Auto-actualización
  updateStatus: UpdateStatus | null
  setUpdateStatus: (s: UpdateStatus) => void
  installUpdate: () => void
}

export const useStore = create<State>((set, get) => ({
  tab: 'home',
  setTab: (tab) => set({ tab }),

  ready: false,
  account: null,
  setAccount: (account) => set({ account }),
  hydrate: async () => {
    let account: Account | null = null
    try {
      account = (await window.dbr?.auth?.get?.()) ?? null
    } catch {
      account = null
    }
    set({ account, ready: true })
    // Un fallo al cargar ajustes NO debe deslogear al usuario: se queda con los defaults.
    try {
      await get().loadSettings()
    } catch {
      /* defaults */
    }
  },
  logout: async () => {
    await window.dbr.auth.logout()
    set({ account: null, tab: 'home' })
  },

  syncing: false,
  syncProgress: null,
  syncSummary: null,
  syncError: '',
  startSync: async () => {
    if (!window.dbr?.sync) return
    set({ syncing: true, syncError: '', syncSummary: null, syncProgress: null })
    const off = window.dbr.sync.onProgress((p) => set({ syncProgress: p }))
    try {
      const res = await window.dbr.sync.start()
      if (res.ok) set({ syncSummary: res.summary })
      else set({ syncError: res.error })
    } finally {
      off()
      set({ syncing: false, syncProgress: null })
    }
  },

  launching: false,
  launchProgress: null,
  launchError: '',
  gameRunning: false,
  play: async () => {
    if (!window.dbr?.launch) return
    // 1) Sincronizar mods (si está configurado el manifest y el usuario dejó activada la
    // actualización automática). Con autoSyncMods=false se lanza con lo que ya haya instalado.
    if (get().autoSyncMods) {
      await get().startSync()
      if (get().syncError) return
    }

    // 2) Preparar + lanzar. El listener de estado vive hasta que el juego termina
    // (el proceso sigue vivo después de que launch.start() resuelva al arrancar).
    set({ launching: true, launchError: '', launchProgress: null, gameRunning: false })
    const offP = window.dbr.launch.onProgress((p) => set({ launchProgress: p }))
    const offS = window.dbr.launch.onStatus((s) => {
      if (s.state === 'running') set({ gameRunning: true, launching: false, launchProgress: null })
      else if (s.state === 'exited') {
        set({ gameRunning: false })
        offS()
      } else if (s.state === 'error') {
        set({ launchError: s.error ?? 'Error', launching: false, gameRunning: false })
        offS()
      }
    })
    try {
      const res = await window.dbr.launch.start()
      if (!res.ok) set({ launchError: res.error })
    } finally {
      offP()
      set({ launching: false })
    }
  },

  javaInfo: null,
  javaBusy: false,
  javaProgress: null,
  javaError: '',
  loadJava: async () => {
    if (!window.dbr?.java) return
    const javaInfo = await window.dbr.java.get()
    set({ javaInfo })
  },
  ensureJava: async () => {
    if (!window.dbr?.java) return
    set({ javaBusy: true, javaError: '', javaProgress: null })
    const off = window.dbr.java.onProgress((p) => set({ javaProgress: p }))
    try {
      const res = await window.dbr.java.ensure()
      if (res.ok) set({ javaInfo: res.info })
      else set({ javaError: res.error })
    } finally {
      off()
      set({ javaBusy: false, javaProgress: null })
    }
  },

  ramGb: 3,
  width: 854,
  height: 480,
  fullscreen: false,
  jvmArgs: DEFAULT_JVM_ARGS,
  modpackVariant: 'full',
  autoSyncMods: true,
  maxRamGb: 16,
  totalRamGb: 0,
  loadSettings: async () => {
    if (!window.dbr?.settings) return
    const [s, limits] = await Promise.all([
      window.dbr.settings.get(),
      window.dbr.settings.limits()
    ])
    set({
      ramGb: s.ramGb,
      width: s.width,
      height: s.height,
      fullscreen: s.fullscreen,
      jvmArgs: s.jvmArgs,
      modpackVariant: s.modpackVariant,
      autoSyncMods: s.autoSyncMods,
      maxRamGb: limits.maxGb,
      totalRamGb: limits.totalGb
    })
  },
  setSetting: async (patch) => {
    set(patch)
    if (!window.dbr?.settings) return
    const s = await window.dbr.settings.set(patch)
    set({
      ramGb: s.ramGb,
      width: s.width,
      height: s.height,
      fullscreen: s.fullscreen,
      jvmArgs: s.jvmArgs,
      modpackVariant: s.modpackVariant,
      autoSyncMods: s.autoSyncMods
    })
  },
  setRamGb: (ramGb) => void get().setSetting({ ramGb }),

  serverStatus: null,
  pinging: false,
  ping: async () => {
    if (!window.dbr?.status) return
    if (Date.now() - lastPingAt < 30_000) return // cachea 30s
    lastPingAt = Date.now()
    set({ pinging: true })
    try {
      const serverStatus = await window.dbr.status.ping()
      set({ serverStatus })
    } finally {
      set({ pinging: false })
    }
  },

  updateStatus: null,
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  installUpdate: () => void window.dbr?.update?.install()
}))
