import { useStore, type Tab } from '../store'

const items: { id: Tab; label: string }[] = [
  { id: 'news', label: 'Noticias' },
  { id: 'home', label: 'Jugar' },
  { id: 'settings', label: 'Ajustes' }
]

export default function NavBar(): JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)

  return (
    <nav className="flex h-16 items-center justify-center gap-2 border-t-2 border-black bg-stone/85 px-4">
      {items.map((it) => {
        const active = tab === it.id
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={`mc-btn px-5 py-2 text-sm font-semibold uppercase tracking-[0.14em] ${
              active ? 'mc-btn-on' : ''
            }`}
          >
            {it.label}
          </button>
        )
      })}
      <span className="mx-1 h-6 w-[2px] bg-black" />
      <button
        onClick={() => window.dbr.openGameFolder()}
        className="mc-btn px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em]"
      >
        Carpeta
      </button>
    </nav>
  )
}
