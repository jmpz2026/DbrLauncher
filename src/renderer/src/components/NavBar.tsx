import { useStore, type Tab } from '../store'
import discordIcon from '../assets/discord.png'
import { useT } from '../i18n'
import { Btn } from './ui'
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
        aria-label={tr('nav.discord')}
        className="mc-btn absolute left-3 inset-y-0 my-auto grid h-10 w-10 place-items-center hover:!border-[#8ea1e1]"
      >
        <img src={discordIcon} alt="" className="h-6 w-6" />
      </a>

      {items.map((it) => {
        const active = tab === it.id
        return (
          <Btn
            key={it.id}
            size="md"
            on={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => setTab(it.id)}
            className="px-5"
          >
            {tr(it.label)}
          </Btn>
        )
      })}
      <span className="mx-1 h-6 w-[2px] bg-black" aria-hidden />
      <Btn size="md" onClick={() => window.dbr.openGameFolder()}>
        {tr('nav.carpeta')}
      </Btn>
    </nav>
  )
}
