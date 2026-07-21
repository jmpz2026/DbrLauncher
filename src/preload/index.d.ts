import type { DbrApi } from './index'

declare global {
  interface Window {
    dbr: DbrApi
  }
}

export {}
