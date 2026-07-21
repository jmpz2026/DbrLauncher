import { useStore } from '../store'

export default function TitleBar(): JSX.Element {
  const account = useStore((s) => s.account)
  const logout = useStore((s) => s.logout)
  const isPremium = account?.type === 'premium'

  return (
    <header className="drag flex h-14 items-center justify-between border-b-2 border-black bg-stone/80 px-4">
      {/* Marca — icono de flecha (play) + RESURRECTION en grande */}
      <div className="flex items-center gap-3">
        <div className="mc-panel grid h-9 w-9 place-items-center text-gold">
          <svg
            width="16"
            height="16"
            viewBox="0 0 12 12"
            shapeRendering="crispEdges"
            fill="currentColor"
          >
            <path d="M2 1h2v10H2zM4 2h2v8H4zM6 3h2v6H6zM8 4h2v4H8z" />
          </svg>
        </div>
        <div className="mc-text text-2xl font-bold uppercase tracking-[0.14em] text-gold">
          Resurrection
        </div>
      </div>

      <div className="no-drag flex items-center gap-3">
        {account && (
          <div className="mc-inset flex items-center gap-2 px-3 py-1.5">
            <span className={`h-2 w-2 ${isPremium ? 'bg-gold' : 'bg-muted'}`} />
            <span className="text-xs text-text mc-text-sm">{account.username}</span>
            <span className="text-[9px] uppercase tracking-wider text-gold-deep">
              {account.type}
            </span>
          </div>
        )}
        {account && (
          <button
            onClick={() => void logout()}
            className="mc-btn px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
            title="Cerrar sesión"
          >
            Salir
          </button>
        )}
        <WindowButtons />
      </div>
    </header>
  )
}

function WindowButtons(): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => window.dbr.minimize()}
        className="mc-btn grid h-7 w-7 place-items-center"
        aria-label="Minimizar"
      >
        <span className="h-[3px] w-3 bg-current" />
      </button>
      <button
        onClick={() => window.dbr.close()}
        className="mc-btn grid h-7 w-7 place-items-center hover:!border-red-500 hover:!bg-red-600 hover:text-white"
        aria-label="Cerrar"
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
