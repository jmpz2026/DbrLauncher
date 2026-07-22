import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../store'

export default function Home(): JSX.Element {
  const account = useStore((s) => s.account)
  const ram = useStore((s) => s.ramGb)
  const syncing = useStore((s) => s.syncing)
  const launching = useStore((s) => s.launching)
  const gameRunning = useStore((s) => s.gameRunning)
  const play = useStore((s) => s.play)
  const ping = useStore((s) => s.ping)

  useEffect(() => {
    void ping()
  }, [ping])

  const busy = syncing || launching || gameRunning
  const label = gameRunning
    ? 'Jugando…'
    : launching
      ? 'Preparando…'
      : syncing
        ? 'Sincronizando…'
        : 'Jugar'

  return (
    <div className="relative h-full">
      <BuildTag />

      <div className="flex h-full flex-col items-center justify-center gap-7 px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-gold-deep mc-text-sm">
          Bienvenido de vuelta
        </p>

        <h1 className="mc-text -mt-1 text-[58px] font-bold uppercase leading-none tracking-tight text-gold">
          {account?.username ?? 'Jugador'}
        </h1>

        <div className="relative mt-2 grid place-items-center">
          {!busy && (
            <span className="pointer-events-none absolute -right-6 -top-5 z-10 origin-center animate-splash-pulse whitespace-nowrap text-xs font-bold uppercase tracking-wide text-gold mc-text-sm">
              ¡Ki al máximo!
            </span>
          )}
          <button
            onClick={() => void play()}
            disabled={busy}
            className="mc-btn-gold flex items-center gap-3 px-16 py-5 text-2xl font-bold uppercase tracking-[0.18em] disabled:opacity-70"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 12 12"
              shapeRendering="crispEdges"
              fill="currentColor"
            >
              <path d="M2 1h2v10H2zM4 2h2v8H4zM6 3h2v6H6zM8 4h2v4H8z" />
            </svg>
            {label}
          </button>
        </div>

        <StatusArea ram={ram} />
      </div>
    </div>
  )
}

function StatusArea({ ram }: { ram: number }): JSX.Element {
  const syncing = useStore((s) => s.syncing)
  const launching = useStore((s) => s.launching)
  const gameRunning = useStore((s) => s.gameRunning)
  const summary = useStore((s) => s.syncSummary)
  const syncError = useStore((s) => s.syncError)
  const launchError = useStore((s) => s.launchError)

  if (syncing) return <SyncBar />
  if (launching) return <LaunchBar />

  const error = launchError || syncError
  if (error) {
    return (
      <div className="mc-panel !border-red-600 mt-1 max-w-lg px-4 py-2 text-center text-xs text-red-300">
        {error}
      </div>
    )
  }

  if (gameRunning) {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs uppercase tracking-wider text-grass mc-text-sm">
        <span className="h-2 w-2 animate-blink bg-grass" />
        Minecraft en marcha
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-2.5">
        <Chip online>Mods al día</Chip>
        <Chip>{ram} GB RAM</Chip>
        <ServerChip />
      </div>
      {summary && summary.version && (
        <p className="text-xs uppercase tracking-wider text-grass mc-text-sm">
          Listo · v{summary.version} — {summary.updated} actualizados
          {summary.removed > 0 ? `, ${summary.removed} eliminados` : ''}
        </p>
      )}
    </div>
  )
}

function LaunchBar(): JSX.Element {
  const p = useStore((s) => s.launchProgress)
  const pct = p?.percent ?? 0
  const hasPct = typeof p?.percent === 'number'

  const phaseText: Record<string, string> = {
    version: 'Resolviendo versión',
    libraries: 'Descargando librerías',
    natives: 'Extrayendo natives',
    assets: 'Descargando assets',
    client: 'Descargando cliente',
    launching: 'Arrancando Minecraft',
    running: 'En marcha'
  }
  const label = p ? (phaseText[p.phase] ?? p.phase) : 'Preparando…'

  return (
    <div className="mt-1 w-full max-w-md">
      <div className="mc-inset h-5 w-full overflow-hidden p-[2px]">
        <div
          className="h-full bg-gold transition-[width] duration-150"
          style={{ width: hasPct ? `${pct}%` : '20%' }}
        />
      </div>
      <p className="mt-2 truncate text-center text-xs uppercase tracking-wider text-muted mc-text-sm">
        {label}
        {hasPct && <span className="ml-2 text-gold">{pct}%</span>}
        {p?.detail ? <span className="ml-2 normal-case text-muted/70">{p.detail}</span> : null}
      </p>
    </div>
  )
}

function SyncBar(): JSX.Element {
  const p = useStore((s) => s.syncProgress)
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
  const file = p?.file ? p.file.split('/').pop() : ''

  let label = 'Preparando…'
  if (p?.phase === 'check') label = 'Comprobando archivos…'
  else if (p?.phase === 'download') label = `Descargando ${file} — ${p.done}/${p.total}`
  else if (p?.phase === 'delete') label = `Limpiando ${p.done}/${p.total}`
  else if (p?.phase === 'done') label = 'Listo'

  const indeterminate = !p || p.phase === 'check'

  return (
    <div className="mt-1 w-full max-w-md">
      <div className="mc-inset h-5 w-full overflow-hidden p-[2px]">
        <div
          className="h-full bg-gold transition-[width] duration-150"
          style={{ width: indeterminate ? '15%' : `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-center text-xs uppercase tracking-wider text-muted mc-text-sm">
        {label}
        {!indeterminate && <span className="ml-2 text-gold">{pct}%</span>}
      </p>
    </div>
  )
}

function ServerChip(): JSX.Element {
  const status = useStore((s) => s.serverStatus)
  const pinging = useStore((s) => s.pinging)

  if (pinging && !status) return <Chip>Servidor…</Chip>
  if (status?.online) {
    return (
      <Chip online>
        {status.players ?? 0}/{status.max ?? 0} en línea
      </Chip>
    )
  }
  return <Chip>Servidor offline</Chip>
}

function Chip({ children, online }: { children: ReactNode; online?: boolean }): JSX.Element {
  return (
    <span className="mc-inset flex items-center gap-2 px-3 py-1.5 text-xs text-text mc-text-sm">
      {online && <span className="h-2 w-2 bg-grass" />}
      {children}
    </span>
  )
}

function BuildTag(): JSX.Element {
  // La versión se lee en runtime desde app.getVersion() (package.json),
  // así el tag se actualiza solo en cada release. No hardcodear.
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.dbr.getVersion().then(setVersion)
  }, [])

  return (
    <div className="pointer-events-none absolute bottom-6 right-8 text-right text-[10px] font-medium uppercase leading-relaxed tracking-[0.22em] text-muted mc-text-sm">
      <div>Build v{version}</div>
      <div className="text-gold-deep">Forge · Java 8</div>
    </div>
  )
}
