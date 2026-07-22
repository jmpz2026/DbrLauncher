import { contextBridge, ipcRenderer } from 'electron'
import type { Account, AuthResult, DeviceCodeInfo } from '../shared/account'
import type { SyncProgress, SyncResult } from '../shared/sync'
import type { JavaInfo, JavaProgress, JavaResult } from '../shared/java'
import type { LaunchProgress, LaunchResult, LaunchStatus } from '../shared/launch'
import type { LauncherSettings } from '../shared/settings'
import type { ServerStatus } from '../shared/status'
import type { NewsResult } from '../shared/news'
import type { UpdateStatus } from '../shared/update'
import type { FuseStatus, FuseInstallResult } from '../shared/fuse'

const api = {
  platform: process.platform,
  minimize: (): void => ipcRenderer.send('window:minimize'),
  close: (): void => ipcRenderer.send('window:close'),
  openGameFolder: (): void => ipcRenderer.send('app:open-folder'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  auth: {
    get: (): Promise<Account | null> => ipcRenderer.invoke('auth:get'),
    loginPirata: (username: string): Promise<AuthResult> =>
      ipcRenderer.invoke('auth:login-pirata', username),
    loginPremium: (): Promise<AuthResult> => ipcRenderer.invoke('auth:login-premium'),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
    // Suscripción al device code durante el login premium. Devuelve una función para desuscribir.
    onDeviceCode: (cb: (info: DeviceCodeInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: DeviceCodeInfo): void => cb(info)
      ipcRenderer.on('auth:device-code', listener)
      return () => ipcRenderer.removeListener('auth:device-code', listener)
    }
  },

  sync: {
    start: (): Promise<SyncResult> => ipcRenderer.invoke('sync:start'),
    // Progreso de la sincronización. Devuelve una función para desuscribir.
    onProgress: (cb: (p: SyncProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: SyncProgress): void => cb(p)
      ipcRenderer.on('sync:progress', listener)
      return () => ipcRenderer.removeListener('sync:progress', listener)
    }
  },

  java: {
    get: (): Promise<JavaInfo | null> => ipcRenderer.invoke('java:get'),
    ensure: (): Promise<JavaResult> => ipcRenderer.invoke('java:ensure'),
    onProgress: (cb: (p: JavaProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: JavaProgress): void => cb(p)
      ipcRenderer.on('java:progress', listener)
      return () => ipcRenderer.removeListener('java:progress', listener)
    }
  },

  launch: {
    start: (): Promise<LaunchResult> => ipcRenderer.invoke('launch:start'),
    onProgress: (cb: (p: LaunchProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: LaunchProgress): void => cb(p)
      ipcRenderer.on('launch:progress', listener)
      return () => ipcRenderer.removeListener('launch:progress', listener)
    },
    onStatus: (cb: (s: LaunchStatus) => void): (() => void) => {
      const listener = (_e: unknown, s: LaunchStatus): void => cb(s)
      ipcRenderer.on('launch:status', listener)
      return () => ipcRenderer.removeListener('launch:status', listener)
    }
  },

  settings: {
    get: (): Promise<LauncherSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<LauncherSettings>): Promise<LauncherSettings> =>
      ipcRenderer.invoke('settings:set', patch)
  },

  status: {
    ping: (): Promise<ServerStatus> => ipcRenderer.invoke('status:ping')
  },

  news: {
    get: (): Promise<NewsResult> => ipcRenderer.invoke('news:get')
  },

  update: {
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, s: UpdateStatus): void => cb(s)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    }
  },

  fuse: {
    status: (): Promise<FuseStatus> => ipcRenderer.invoke('fuse:status'),
    install: (): Promise<FuseInstallResult> => ipcRenderer.invoke('fuse:install')
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
