import { useEffect, useState, type ReactNode } from 'react'
import type { LaunchPhase } from '../../../shared/launch'
import { useStore } from '../store'
import { useT } from '../i18n'

export default function Home(): JSX.Element {
  const account = useStore((s) => s.account)
  const ram = useStore((s) => s.ramGb)
  const syncing = useStore((s) => s.syncing)
  const launching = useStore((s) => s.launching)
  const gameRunning = useStore((s) => s.gameRunning)
  const play = useStore((s) => s.play)
  const ping = useStore((s) => s.ping)
  const experimental = useStore((s) => s.modpackVariant === 'experimental')
  const tr = useT()

  useEffect(() => {
    void ping()
  }, [ping])

  const busy = syncing || launching || gameRunning
  const label = gameRunning
    ? tr('home.jugando')
    : launching
      ? tr('comun.preparando')
      : syncing
        ? tr('home.sincronizando')
        : tr('home.jugar')

  return (
    <div className="relative h-full">
      <BuildTag />

      <div className="flex h-full flex-col items-center justify-center gap-7 px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-gold-deep mc-text-sm">
          {tr('home.bienvenido')}
        </p>

        <h1 className="mc-text -mt-1 text-[58px] font-bold uppercase leading-none tracking-tight text-gold">
          {account?.username ?? tr('home.jugador')}
        </h1>

        <div className="relative mt-2 grid place-items-center">
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

        {experimental && (
          <div className="mc-panel !border-red-600 max-w-lg px-4 py-2 text-center text-xs text-red-300">
            {tr('home.experimental')}
          </div>
        )}

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
  const lastCrash = useStore((s) => s.lastCrash)
  const openLog = useStore((s) => s.openLog)
  const dismissCrash = useStore((s) => s.dismissCrash)
  const tr = useT()

  if (syncing) return <SyncBar />
  if (launching) return <LaunchBar />

  if (lastCrash && !gameRunning) {
    return (
      <div className="mc-panel !border-red-600 mt-1 flex max-w-lg flex-col items-center gap-2 px-5 py-3 text-center">
        <p className="text-xs uppercase tracking-wider text-red-300 mc-text-sm">
          {tr('home.crash')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => void openLog()}
            className="mc-btn px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {tr('home.ver_log')}
          </button>
          <button
            onClick={dismissCrash}
            className="mc-btn px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {tr('home.descartar')}
          </button>
        </div>
      </div>
    )
  }

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
        {tr('home.en_marcha')}
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-2.5">
        <Chip online>{tr('home.mods_al_dia')}</Chip>
        <Chip>{ram} GB RAM</Chip>
        <ServerChip />
      </div>
      {summary && summary.version && (
        <p className="text-xs uppercase tracking-wider text-grass mc-text-sm">
          {tr('home.listo_version', { version: summary.version, updated: summary.updated })}
          {summary.removed > 0 ? tr('home.eliminados', { n: summary.removed }) : ''}
        </p>
      )}
    </div>
  )
}

function LaunchBar(): JSX.Element {
  const p = useStore((s) => s.launchProgress)
  const tr = useT()
  const pct = p?.percent ?? 0
  const hasPct = typeof p?.percent === 'number'

  const phaseText: Record<LaunchPhase, string> = {
    java: tr('launch.java'),
    version: tr('launch.version'),
    libraries: tr('launch.libraries'),
    natives: tr('launch.natives'),
    assets: tr('launch.assets'),
    client: tr('launch.client'),
    launching: tr('launch.launching'),
    running: tr('launch.running')
  }
  const label = p ? (phaseText[p.phase] ?? p.phase) : tr('comun.preparando')

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
  const tr = useT()
  // En descarga la barra va por bytes si el manifest trae tamaños; si no, por archivos.
  const byBytes = p?.phase === 'download' && !!p.bytesTotal
  const pct = byBytes
    ? Math.round(((p.bytesDone ?? 0) / p.bytesTotal!) * 100)
    : p && p.total > 0
      ? Math.round((p.done / p.total) * 100)
      : 0
  const file = p?.file ? p.file.split('/').pop() : ''
  const others = p?.inFlight ? ` +${p.inFlight}` : ''

  let label = tr('comun.preparando')
  if (p?.phase === 'check') label = tr('sync.comprobando')
  else if (p?.phase === 'download')
    label = file
      ? tr('sync.descargando_archivo', { file, others, done: p.done, total: p.total })
      : tr('sync.descargando', { done: p.done, total: p.total })
  else if (p?.phase === 'delete') label = tr('sync.limpiando', { done: p.done, total: p.total })
  else if (p?.phase === 'done') label = tr('sync.listo')

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
  const tr = useT()

  if (pinging && !status) return <Chip>{tr('home.servidor')}</Chip>
  if (status?.online) {
    return (
      <Chip online>
        {tr('home.en_linea', { players: status.players ?? 0, max: status.max ?? 0 })}
      </Chip>
    )
  }
  return <Chip>{tr('home.servidor_offline')}</Chip>
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
