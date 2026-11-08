import { useStore } from '../store'
import { useT } from '../i18n'
import { LANGS, LANG_NAME } from '../../../shared/i18n'
import logo from '../assets/logo.png'
import { Btn } from './ui'

export default function TitleBar(): JSX.Element {
  const account = useStore((s) => s.account)
  const logout = useStore((s) => s.logout)
  const isPremium = account?.type === 'premium'
  const tr = useT()

  return (
    <header className="drag flex h-14 items-center justify-between border-b-2 border-black bg-stone/80 px-4">
      {/* Marca única: Dbr Launcher (igual que la ventana y el instalador) */}
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="" className="h-10 w-10 shrink-0 object-contain [image-rendering:auto]" />
        <div className="mc-text font-pixel text-2xl font-bold text-gold">Dbr Launcher</div>
      </div>

      <div className="no-drag flex items-center gap-3">
        <LangPicker />
        {account && (
          <div className="mc-inset flex items-center gap-2 px-3 py-1.5">
            <span className={`h-2 w-2 ${isPremium ? 'bg-gold' : 'bg-muted'}`} aria-hidden />
            <span className="text-xs text-text">{account.username}</span>
            <span className="text-[11px] text-muted">
              {isPremium ? tr('login.premium') : tr('login.no_premium')}
            </span>
          </div>
        )}
        {account && (
          <Btn onClick={() => void logout()} title={tr('titulo.cerrar_sesion')}>
            {tr('titulo.salir')}
          </Btn>
        )}
        <WindowButtons />
      </div>
    </header>
  )
}

// Selector compacto, siempre a la vista (también en el login): cambia el idioma del launcher
// y el del juego a la vez.
function LangPicker(): JSX.Element {
  const lang = useStore((s) => s.lang)
  const setIdioma = useStore((s) => s.setIdioma)
  const tr = useT()

  return (
    <div className="flex items-center gap-1" title={tr('titulo.idioma')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => void setIdioma(l)}
          aria-label={LANG_NAME[l]}
          aria-pressed={lang === l}
          className={`mc-btn h-7 px-2 text-[11px] font-semibold uppercase ${lang === l ? 'mc-btn-on' : ''}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function WindowButtons(): JSX.Element {
  const tr = useT()
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => window.dbr.minimize()}
        className="mc-btn grid h-7 w-7 place-items-center"
        aria-label={tr('titulo.minimizar')}
      >
        <span className="h-[3px] w-3 bg-current" />
      </button>
      <button
        onClick={() => window.dbr.close()}
        className="mc-btn grid h-7 w-7 place-items-center hover:!border-black hover:!bg-error hover:!text-white"
        aria-label={tr('comun.cerrar')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges">
          <path
            d="M2 2h2v2H2zM4 4h2v2H4zM6 6h2v2H6zM8 8h2v2H8zM8 2h2v2H8zM6 4h2v2H6zM4 6h2v2H4zM2 8h2v2H2z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  )
}
