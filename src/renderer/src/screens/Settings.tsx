import { useEffect, useState } from 'react'
import type { ModpackVariant } from '../../../shared/settings'
import { useStore } from '../store'
import { useT } from '../i18n'
import { LANGS, LANG_NAME, MC_LANG, existe, type Clave } from '../../../shared/i18n'

export default function Settings(): JSX.Element {
  const ram = useStore((s) => s.ramGb)
  const setRam = useStore((s) => s.setRamGb)
  const maxRam = useStore((s) => s.maxRamGb)
  const totalRam = useStore((s) => s.totalRamGb)
  const loadJava = useStore((s) => s.loadJava)
  const tr = useT()

  useEffect(() => {
    void loadJava()
  }, [loadJava])

  // El slider nunca deja pasar del tope del equipo, pero avisamos cuando el usuario ya está
  // en el máximo para que entienda por qué no puede subir más.
  const atMax = ram >= maxRam

  return (
    <div className="h-full space-y-4 overflow-y-auto px-12 py-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-5 w-2 bg-gold" />
        <h2 className="mc-text text-2xl font-bold uppercase tracking-wide text-gold">{tr('ajustes.titulo')}</h2>
      </div>

      {/* Idioma del launcher y del juego */}
      <IdiomaPanel />

      {/* Variante del modpack */}
      <ModpackPanel />

      {/* Actualización automática de mods */}
      <AutoSyncPanel />

      {/* Memoria RAM */}
      <div className="mc-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="ram" className="text-sm font-semibold uppercase tracking-wider">
            {tr('ajustes.ram')}
          </label>
          <span className="mc-text-sm text-lg font-bold text-gold">{ram} GB</span>
        </div>
        <input
          id="ram"
          type="range"
          min={2}
          max={Math.max(2, maxRam)}
          step={1}
          value={Math.min(ram, Math.max(2, maxRam))}
          onChange={(e) => setRam(Number(e.target.value))}
          className="mc-range"
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {totalRam > 0
            ? tr('ajustes.ram_equipo', { total: totalRam, max: maxRam })
            : tr('ajustes.ram_generico')}
          {atMax && totalRam > 0 && (
            <span className="text-gold">{tr('ajustes.ram_maximo')}</span>
          )}
        </p>
      </div>

      {/* Ventana y JVM */}
      <GamePanel />

      {/* Runtime de Java */}
      <JavaPanel />

      {/* Diagnóstico */}
      <DiagnosticsPanel />

      {/* Créditos y permisos de terceros */}
      <CreditsPanel />
    </div>
  )
}

// Permisos archivados en la documentación del proyecto (evidencias de KAMKEEL y JinGames).
const CREDITS: { title: string; text: Clave; links: { label: Clave | string; href: string }[] }[] = [
  {
    title: 'CustomNPC+ DBC Addon (npcdbc)',
    text: 'ajustes.credito_npcdbc',
    links: [
      { label: 'ajustes.proyecto_original', href: 'https://github.com/KAMKEEL/CustomNPC-DBC-Addon' },
      { label: 'ajustes.nuestro_fork', href: 'https://github.com/jmpz2026/CustomNPC-DBC-Addon' }
    ]
  },
  {
    title: 'JinGames · Dragon Block C',
    text: 'ajustes.credito_jingames',
    links: [{ label: 'JinGames', href: 'https://main.jingames.net' }]
  }
]

function CreditsPanel(): JSX.Element {
  const tr = useT()
  return (
    <div className="mc-panel space-y-4 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.creditos')}</span>
      {CREDITS.map((c) => (
        <div key={c.title} className="space-y-1.5">
          <span className="mc-text-sm block text-sm font-bold text-gold">{c.title}</span>
          <p className="text-xs leading-relaxed text-muted">{tr(c.text)}</p>
          <div className="flex flex-wrap gap-2">
            {c.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="mc-btn px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
              >
                {existe(l.label) ? tr(l.label) : l.label}
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted">
        {tr('ajustes.independiente')}
      </p>
    </div>
  )
}

function IdiomaPanel(): JSX.Element {
  const lang = useStore((s) => s.lang)
  const juego = useStore((s) => s.idiomaJuego)
  const setIdioma = useStore((s) => s.setIdioma)
  const tr = useT()
  // El jugador eligió otro idioma dentro de Minecraft (de_DE, fr_FR...): el juego lo
  // conserva y el launcher cae en inglés hasta que elija uno de los tres.
  const otro = juego !== null && !LANGS.some((l) => MC_LANG[l] === juego)

  return (
    <div className="mc-panel space-y-3 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.idioma')}</span>
      <div className="flex gap-3">
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => void setIdioma(l)}
            className={`mc-btn flex-1 px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${
              lang === l && !otro ? 'mc-btn-on' : ''
            }`}
          >
            {LANG_NAME[l]}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {tr('ajustes.idioma_desc')}
        {otro && <span className="text-gold"> {tr('ajustes.idioma_otro', { juego })}</span>}
      </p>
    </div>
  )
}

function DiagnosticsPanel(): JSX.Element {
  const openLog = useStore((s) => s.openLog)
  const tr = useT()

  return (
    <div className="mc-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.diagnostico')}</span>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {tr('ajustes.diagnostico_desc')}
          </p>
        </div>
        <button
          onClick={() => void openLog()}
          className="mc-btn shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
        >
          {tr('ajustes.ver_ultimo_log')}
        </button>
      </div>
    </div>
  )
}

function ModpackPanel(): JSX.Element {
  const variant = useStore((s) => s.modpackVariant)
  const setSetting = useStore((s) => s.setSetting)
  // Variante que el jugador acaba de pulsar, pendiente de confirmar si aplica también la
  // configuración recomendada de esa variante (gráficos y .cfg marcados como `once`).
  const [pending, setPending] = useState<ModpackVariant | null>(null)
  // La experimental exige marcar que se entiende que no sirve para el servidor.
  const [ackExperimental, setAckExperimental] = useState(false)
  const tr = useT()

  const options: { id: ModpackVariant; label: string; desc: string }[] = [
    { id: 'full', label: tr('ajustes.full'), desc: tr('ajustes.full_desc') },
    { id: 'lite', label: tr('ajustes.lite'), desc: tr('ajustes.lite_desc') },
    { id: 'experimental', label: tr('ajustes.experimental'), desc: tr('ajustes.experimental_desc') }
  ]
  const labelOf = (id: ModpackVariant): string => options.find((o) => o.id === id)?.label ?? id
  const blocked = pending === 'experimental' && !ackExperimental

  const choose = (id: ModpackVariant): void => {
    setAckExperimental(false)
    setPending(id)
  }

  const apply = (seed: boolean): void => {
    if (!pending || blocked) return
    void setSetting({ modpackVariant: pending, ...(seed ? { modpackSeedPending: true } : {}) })
    setPending(null)
  }

  return (
    <div className="mc-panel space-y-3 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.modpack')}</span>
      <div className="flex gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              if (o.id !== variant) choose(o.id)
            }}
            className={`mc-btn flex-1 px-4 py-3 text-left ${variant === o.id ? 'mc-btn-on' : ''}`}
          >
            <span className="block text-sm font-semibold uppercase tracking-[0.12em]">
              {o.label}
            </span>
            <span className="mt-0.5 block text-xs normal-case tracking-normal text-muted">
              {o.desc}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {tr('ajustes.modpack_nota')}
      </p>

      {pending && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-bg/80 p-8">
          <div className="mc-panel flex w-full max-w-md flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <span className="h-5 w-2 bg-gold" />
              <h2 className="mc-text text-lg font-bold uppercase tracking-wide text-gold">
                {tr('ajustes.cambiar_a', { variante: labelOf(pending) })}
              </h2>
            </div>
            {pending === 'experimental' && (
              <div className="mc-inset space-y-2 !border-red-600 p-3">
                <p className="text-xs font-semibold leading-relaxed text-red-300">
                  {tr('ajustes.exp_aviso')}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {tr('ajustes.exp_detalle')}
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ackExperimental}
                    onChange={(e) => setAckExperimental(e.target.checked)}
                  />
                  {tr('ajustes.exp_entiendo')}
                </label>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted">
              {tr('ajustes.config_recomendada')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => apply(true)}
                disabled={blocked}
                className="mc-btn mc-btn-gold px-4 py-2 disabled:opacity-50 text-xs font-semibold uppercase tracking-[0.12em]"
              >
                {tr('ajustes.si_aplicar')}
              </button>
              <button
                onClick={() => apply(false)}
                disabled={blocked}
                className="mc-btn px-4 py-2 disabled:opacity-50 text-xs font-semibold uppercase tracking-[0.12em]"
              >
                {tr('ajustes.conservar')}
              </button>
              <button
                onClick={() => setPending(null)}
                className="mc-btn ml-auto px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
              >
                {tr('comun.cancelar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AutoSyncPanel(): JSX.Element {
  const autoSync = useStore((s) => s.autoSyncMods)
  const setSetting = useStore((s) => s.setSetting)
  const tr = useT()

  return (
    <div className="mc-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wider">
            {tr('ajustes.autosync')}
          </span>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {autoSync
              ? tr('ajustes.autosync_on')
              : tr('ajustes.autosync_off')}
          </p>
        </div>
        <button
          onClick={() => void setSetting({ autoSyncMods: !autoSync })}
          className={`mc-btn shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
            autoSync ? 'mc-btn-on' : ''
          }`}
        >
          {autoSync ? tr('ajustes.activada') : tr('ajustes.desactivada')}
        </button>
      </div>
    </div>
  )
}

function GamePanel(): JSX.Element {
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const fullscreen = useStore((s) => s.fullscreen)
  const jvmArgs = useStore((s) => s.jvmArgs)
  const setSetting = useStore((s) => s.setSetting)
  const tr = useT()

  return (
    <div className="mc-panel space-y-4 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.ventana')}</span>

      <div className="flex items-end gap-4">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-muted">
          {tr('ajustes.ancho')}
          <input
            type="number"
            min={640}
            value={width}
            disabled={fullscreen}
            onChange={(e) => void setSetting({ width: Number(e.target.value) })}
            className="mc-inset w-24 px-2 py-1.5 text-text outline-none disabled:opacity-50"
          />
        </label>
        <span className="pb-2 text-muted">×</span>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-muted">
          {tr('ajustes.alto')}
          <input
            type="number"
            min={480}
            value={height}
            disabled={fullscreen}
            onChange={(e) => void setSetting({ height: Number(e.target.value) })}
            className="mc-inset w-24 px-2 py-1.5 text-text outline-none disabled:opacity-50"
          />
        </label>
        <button
          onClick={() => void setSetting({ fullscreen: !fullscreen })}
          className={`mc-btn ml-auto px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
            fullscreen ? 'mc-btn-on' : ''
          }`}
        >
          {tr('ajustes.pantalla_completa')}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-muted">
        {tr('ajustes.jvm')}
        <input
          type="text"
          value={jvmArgs}
          placeholder="-XX:+UseG1GC …"
          onChange={(e) => void setSetting({ jvmArgs: e.target.value })}
          className="mc-inset w-full px-3 py-2 font-mono text-xs text-text outline-none placeholder:text-muted/50"
        />
      </label>
    </div>
  )
}

function JavaPanel(): JSX.Element {
  const info = useStore((s) => s.javaInfo)
  const busy = useStore((s) => s.javaBusy)
  const progress = useStore((s) => s.javaProgress)
  const error = useStore((s) => s.javaError)
  const ensureJava = useStore((s) => s.ensureJava)
  const tr = useT()

  let phaseLabel = tr('comun.preparando')
  if (progress?.phase === 'download') phaseLabel = tr('ajustes.java_descargando', { pct: progress.percent ?? 0 })
  else if (progress?.phase === 'extract') phaseLabel = tr('ajustes.java_extrayendo')
  else if (progress?.phase === 'verify') phaseLabel = tr('ajustes.java_verificando')
  const pct = progress?.phase === 'download' ? (progress.percent ?? 0) : 100
  const indeterminate = !progress || progress.phase !== 'download'

  return (
    <div className="mc-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider">{tr('ajustes.java')}</span>
        {info ? (
          <span className="mc-inset flex items-center gap-2 px-2.5 py-1 text-xs text-grass">
            <span className="h-2 w-2 bg-grass" />
            {info.version} · {info.arch}
          </span>
        ) : (
          <span className="mc-inset px-2.5 py-1 text-xs text-muted">{tr('ajustes.java_no_instalado')}</span>
        )}
      </div>

      {busy ? (
        <div className="w-full">
          <div className="mc-inset h-5 w-full overflow-hidden p-[2px]">
            <div
              className="h-full bg-gold transition-[width] duration-150"
              style={{ width: indeterminate ? '25%' : `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs uppercase tracking-wider text-muted mc-text-sm">{phaseLabel}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs leading-relaxed text-muted">
            {info
              ? tr('ajustes.java_listo')
              : tr('ajustes.java_auto')}
          </p>
          <button
            onClick={() => void ensureJava()}
            className="mc-btn shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {info ? tr('ajustes.java_reinstalar') : tr('ajustes.java_descargar')}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}
