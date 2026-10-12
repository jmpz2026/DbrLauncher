import { useStore, type Tab } from '../store'
import discordIcon from '../assets/discord.png'
import { useT } from '../i18n'
import type { Clave } from '../../../shared/i18n'

const items: { id: Tab; label: Clave }[] = [
  { id: 'home', label: 'nav.jugar' },
  { id: 'settings', label: 'nav.ajustes' }
]

export default function NavBar(): JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const tr = useT()

  return (
    <nav className="relative flex h-16 items-center justify-center gap-2 border-t-2 border-black bg-stone/85 px-4">
      {/* Discord — abajo a la izquierda */}
      <a
        href="https://discord.gg/HaQh38sFbD"
        target="_blank"
        rel="noreferrer"
        title={tr('nav.discord')}
        className="mc-btn absolute left-3 inset-y-0 my-auto grid h-10 w-10 place-items-center hover:!border-[#8ea1e1]"
      >
        <img src={discordIcon} alt="Discord" className="h-6 w-6" />
      </a>

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
            {tr(it.label)}
          </button>
        )
      })}
      <span className="mx-1 h-6 w-[2px] bg-black" />
      <button
        onClick={() => window.dbr.openGameFolder()}
        className="mc-btn px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em]"
      >
        {tr('nav.carpeta')}
      </button>
    </nav>
  )
}
