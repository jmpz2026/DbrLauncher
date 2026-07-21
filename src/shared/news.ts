// Noticias del launcher (news.json en el repo del modpack).
export interface NewsItem {
  title: string
  date?: string
  body: string
  url?: string
  tag?: string
}

export interface News {
  items: NewsItem[]
}

export type NewsResult = { ok: true; news: News } | { ok: false; error: string }
