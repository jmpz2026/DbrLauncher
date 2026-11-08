import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LaunchPhase } from '../../../shared/launch'
import { mustSync, useStore } from '../store'
import { useT } from '../i18n'
import { Btn, Progress } from '../components/ui'

export default function Home(): JSX.Element {
  const account = useStore((s) => s.account)
  const ram = useStore((s) => s.ramGb)
  const syncing = useStore((s) => s.syncing)
  const launching = useStore((s) => s.launching)
  const gameRunning = useStore((s) => s.gameRunning)
  const play = useStore((s) => s.play)
  const relogin = useStore((s) => s.relogin)
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
        <div className="text-center">
          <p className="text-sm text-muted">{tr('home.bienvenido')}</p>
          <h1 className="mc-text mt-1 font-pixel text-[58px] font-bold leading-none text-gold">
            {account?.username ?? tr('home.jugador')}
          </h1>
        </div>

        <div className="relative mt-2 grid place-items-center">
          <button
            onClick={() => void play()}
            disabled={busy}
            className="mc-btn-primary mc-btn-play flex items-center gap-3 px-16 py-5 font-pixel text-2xl font-bold uppercase tracking-[0.18em]"
          >
            <svg
              aria-hidden
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

        {account?.needsRelogin && (
          <div
            role="alert"
            className="mc-panel flex max-w-lg items-center gap-4 !border-gold-deep px-4 py-3 text-sm text-text"
          >
            <span className="flex-1">{tr('home.sesion_caducada')}</span>
            <Btn variant="primary" onClick={relogin} className="shrink-0">
              {tr('home.volver_entrar')}
            </Btn>
          </div>
        )}

        {experimental && (
          <div className="mc-panel max-w-lg !border-error px-4 py-2 text-center text-sm text-error">
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
      <div role="alert" className="mc-panel mt-1 flex max-w-lg flex-col items-center gap-2 !border-error px-5 py-3 text-center">
        <p className="text-sm text-error">{tr('home.crash')}</p>
        <div className="flex gap-3">
          <Btn onClick={() => void openLog()}>{tr('home.ver_log')}</Btn>
          <Btn onClick={dismissCrash}>{tr('home.descartar')}</Btn>
        </div>
      </div>
    )
  }

  const error = launchError || syncError
  if (error) {
    return (
      <div role="alert" className="mc-panel mt-1 max-w-lg !border-error px-4 py-2 text-center text-sm text-error">
        {error}
      </div>
    )
  }

  if (gameRunning) {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-grass">
        <span className="h-2 w-2 animate-blink bg-grass" aria-hidden />
        {tr('home.en_marcha')}
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-2.5">
        <ModsChip />
        <Chip>{tr('home.ram', { gb: ram })}</Chip>
        <ServerChip />
      </div>
      {summary && summary.version && (
        <p className="text-xs text-grass">
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
      <Progress value={hasPct ? pct : null} label={label} />
      <p className="mt-2 truncate text-center text-xs text-muted">
        {label}
        {hasPct && <span className="ml-2 font-semibold text-gold">{pct}%</span>}
        {p?.detail ? <span className="ml-2 text-muted/70">{p.detail}</span> : null}
      </p>
    </div>
  )
}

/** 1536 -> "1.5 KB"; para la línea de bytes de la sync. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** Velocidad de descarga en bytes/s, media de los últimos ~3 s. */
function useSpeed(bytesDone: number | undefined): number {
  const samples = useRef<Array<[number, number]>>([])
  if (bytesDone === undefined) {
    samples.current = []
    return 0
  }
  const now = Date.now()
  const s = samples.current
  if (s.length === 0 || s[s.length - 1][0] !== bytesDone) s.push([bytesDone, now])
  while (s.length > 2 && now - s[0][1] > 3000) s.shift()
  const [b0, t0] = s[0]
  return now > t0 ? Math.max(0, ((bytesDone - b0) * 1000) / (now - t0)) : 0
}

function SyncBar(): JSX.Element {
  const p = useStore((s) => s.syncProgress)
  const cancelSync = useStore((s) => s.cancelSync)
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
  const speed = useSpeed(byBytes ? p.bytesDone : undefined)

  return (
    <div className="mt-1 w-full max-w-md">
      <Progress value={indeterminate ? null : pct} label={label} />
      <p className="mt-2 text-center text-xs text-muted">
        {label}
        {!indeterminate && <span className="ml-2 font-semibold text-gold">{pct}%</span>}
      </p>
      {byBytes && (
        <p className="mt-1 text-center text-xs text-muted">
          {formatBytes(p.bytesDone ?? 0)} / {formatBytes(p.bytesTotal!)}
          {speed > 0 && ` · ${formatBytes(Math.round(speed))}/s`}
        </p>
      )}
      <div className="mt-2 flex flex-col items-center gap-1">
        <Btn onClick={cancelSync}>{tr('comun.cancelar')}</Btn>
        <p className="text-center text-[11px] text-muted">{tr('sync.cancelar_hint')}</p>
      </div>
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
      <Chip tone="ok">
        {tr('home.en_linea', { players: status.players ?? 0, max: status.max ?? 0 })}
      </Chip>
    )
  }
  return <Chip>{tr('home.servidor_offline')}</Chip>
}

/** Estado real de los mods: al día solo si la última sync terminó bien. */
function ModsChip(): JSX.Element {
  const tr = useT()
  const must = useStore(mustSync)
  const error = useStore((s) => s.syncError)
  const summary = useStore((s) => s.syncSummary)
  const checking = useStore((s) => s.prewarming || s.syncing)

  if (!must) return <Chip tone="idle">{tr('home.mods_sync_off')}</Chip>
  if (error) return <Chip tone="error">{tr('home.mods_error')}</Chip>
  if (summary) return <Chip tone="ok">{tr('home.mods_al_dia')}</Chip>
  if (checking) return <Chip tone="busy">{tr('home.mods_comprobando')}</Chip>
  return <Chip tone="idle">{tr('home.mods_sin_comprobar')}</Chip>
}

type Tone = 'ok' | 'busy' | 'error' | 'idle'
const DOT: Record<Tone, string> = {
  ok: 'bg-grass',
  busy: 'bg-gold animate-blink',
  error: 'bg-error',
  idle: 'bg-muted'
}

function Chip({ children, tone }: { children: ReactNode; tone?: Tone }): JSX.Element {
  return (
    <span className="mc-inset flex items-center gap-2 px-3 py-1.5 text-xs text-text">
      {tone && <span className={`h-2 w-2 ${DOT[tone]}`} aria-hidden />}
      {children}
    </span>
  )
}

function BuildTag(): JSX.Element {
  // La versión se lee en runtime desde app.getVersion() (package.json),
  // así el tag se actualiza solo en cada release. No hardcodear.
  const [version, setVersion] = useState('')
  const tr = useT()

  useEffect(() => {
    void window.dbr?.getVersion?.().then(setVersion)
  }, [])

  return (
    <div className="pointer-events-none absolute bottom-6 right-8 text-right text-[11px] leading-relaxed text-muted">
      {version && <div>{tr('home.build', { v: version })}</div>}
      <div>Forge 1.7.10 · Java 8</div>
    </div>
  )
}
