import { ipcMain } from 'electron'
import { CONFIG, isManifestConfigured } from '../../shared/config'
import type { News, NewsResult } from '../../shared/news'

export function registerNews(): void {
  ipcMain.handle('news:get', async (): Promise<NewsResult> => {
    try {
      if (!isManifestConfigured()) {
        return { ok: false, error: 'Noticias no configuradas (rellena OWNER/REPO en config.ts).' }
      }
      const res = await fetch(CONFIG.newsUrl, { redirect: 'follow' })
      if (!res.ok) throw new Error(`No se pudieron cargar las noticias (${res.status}).`)
      const news = (await res.json()) as News
      if (!Array.isArray(news.items)) throw new Error('news.json inválido: falta "items".')
      return { ok: true, news }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
