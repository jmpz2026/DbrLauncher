import { useEffect, useState } from 'react'
import type { NewsItem } from '../../../shared/news'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; items: NewsItem[] }

export default function News(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!window.dbr?.news) return
      const res = await window.dbr.news.get()
      if (!alive) return
      if (res.ok) setState({ status: 'ok', items: res.news.items })
      else setState({ status: 'error', error: res.error })
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto px-12 py-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-5 w-2 bg-gold" />
        <h2 className="mc-text text-2xl font-bold uppercase tracking-wide text-gold">Noticias</h2>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm uppercase tracking-wider text-muted mc-text-sm">
          Cargando<span className="animate-blink">_</span>
        </p>
      )}

      {state.status === 'error' && (
        <div className="mc-panel !border-red-600 px-4 py-3 text-xs text-red-300">{state.error}</div>
      )}

      {state.status === 'ok' && state.items.length === 0 && (
        <p className="text-sm text-muted">No hay noticias por ahora.</p>
      )}

      {state.status === 'ok' && state.items.length > 0 && (
        <div className="space-y-3">
          {state.items.map((it, i) => (
            <article
              key={i}
              className="mc-panel group border-l-[6px] !border-l-gold-deep py-3 pl-4 pr-4 transition-colors hover:!border-l-gold hover:bg-stone2"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="mc-text-sm text-lg font-semibold uppercase tracking-wide text-gold-light">
                  {it.title}
                </h3>
                <span className="shrink-0 text-xs uppercase tracking-wider text-muted">
                  {it.tag ?? it.date ?? ''}
                </span>
              </div>
              <p className="text-sm text-muted">{it.body}</p>
              {it.url && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs uppercase tracking-wider text-gold hover:text-gold-light"
                >
                  Leer más →
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
