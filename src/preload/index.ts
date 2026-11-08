import { contextBridge, ipcRenderer } from 'electron'
import type { Account, AuthResult, DeviceCodeInfo } from '../shared/account'
import type { SyncProgress, SyncResult } from '../shared/sync'
import type { JavaInfo, JavaProgress, JavaResult } from '../shared/java'
import type { LaunchProgress, LaunchResult, LaunchStatus } from '../shared/launch'
import type { LauncherSettings, RamLimits } from '../shared/settings'
import type { ServerStatus } from '../shared/status'
import type { UpdateStatus } from '../shared/update'
import type { FuseStatus, FuseInstallResult } from '../shared/fuse'
import type { LiteProposal } from '../shared/perf'
import type { IdiomaInfo, Lang } from '../shared/i18n'

/** Suscripción a un canal main→renderer. Devuelve la función para desuscribir. */
function on<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
  minimize: (): void => ipcRenderer.send('window:minimize'),
  close: (): void => ipcRenderer.send('window:close'),
  openGameFolder: (): void => ipcRenderer.send('app:open-folder'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  // Últimas líneas del log del juego (visor / diagnóstico de crashes).
  readGameLog: (): Promise<string> => ipcRenderer.invoke('app:read-log'),

  auth: {
    get: (): Promise<Account | null> => ipcRenderer.invoke('auth:get'),
    loginPirata: (username: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:login-pirata', username),
    loginPremium: (): Promise<AuthResult> => ipcRenderer.invoke('auth:login-premium'),
    cancelPremium: (): Promise<void> => ipcRenderer.invoke('auth:cancel-premium'),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
    // Suscripción al device code durante el login premium. Devuelve una función para desuscribir.
    onDeviceCode: (cb: (v: DeviceCodeInfo) => void): (() => void) => on('auth:device-code', cb),
    // La sesión cambió en segundo plano (renovación: nombre nuevo o sesión premium caducada).
    onSessionChanged: (cb: (v: Account | null) => void): (() => void) => on('auth:session-changed', cb)
  },

  sync: {
    start: (): Promise<SyncResult> => ipcRenderer.invoke('sync:start'),
    cancel: (): Promise<void> => ipcRenderer.invoke('sync:cancel'),
    // Progreso de la sincronización. Devuelve una función para desuscribir.
    onProgress: (cb: (v: SyncProgress) => void): (() => void) => on('sync:progress', cb)
  },

  java: {
    get: (): Promise<JavaInfo | null> => ipcRenderer.invoke('java:get'),
    ensure: (force = false): Promise<JavaResult> => ipcRenderer.invoke('java:ensure', force),
    onProgress: (cb: (v: JavaProgress) => void): (() => void) => on('java:progress', cb)
  },

  launch: {
    start: (): Promise<LaunchResult> => ipcRenderer.invoke('launch:start'),
    onProgress: (cb: (v: LaunchProgress) => void): (() => void) => on('launch:progress', cb),
    onStatus: (cb: (v: LaunchStatus) => void): (() => void) => on('launch:status', cb)
  },

  settings: {
    get: (): Promise<LauncherSettings> => ipcRenderer.invoke('settings:get'),
    limits: (): Promise<RamLimits> => ipcRenderer.invoke('settings:limits'),
    set: (patch: Partial<LauncherSettings>): Promise<LauncherSettings> =>
      ipcRenderer.invoke('settings:set', patch)
  },

  status: {
    ping: (): Promise<ServerStatus> => ipcRenderer.invoke('status:ping')
  },

  update: {
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (v: UpdateStatus) => void): (() => void) => on('update:status', cb)
  },

  fuse: {
    status: (): Promise<FuseStatus> => ipcRenderer.invoke('fuse:status'),
    install: (): Promise<FuseInstallResult> => ipcRenderer.invoke('fuse:install')
  },

  idioma: {
    get: (): Promise<IdiomaInfo> => ipcRenderer.invoke('idioma:get'),
    set: (lang: Lang): Promise<IdiomaInfo> => ipcRenderer.invoke('idioma:set', lang)
  },

  perf: {
    // ¿Proponer pasar a Lite? (hardware justo o marca del juego)
    check: (): Promise<LiteProposal> => ipcRenderer.invoke('perf:check'),
    answer: (accept: boolean): Promise<void> => ipcRenderer.invoke('perf:answer', accept)
  }
}

export type DbrApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('dbr', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (definido en index.d.ts)
  window.dbr = api
}
