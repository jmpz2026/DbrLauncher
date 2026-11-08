import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ModpackVariant } from '../../../shared/settings'
import { useStore } from '../store'
import { useT } from '../i18n'
import { LANGS, LANG_NAME, MC_LANG, existe, type Clave } from '../../../shared/i18n'
import { Btn, Modal, PanelTitle, Progress, Toggle, btnClass } from '../components/ui'

type TabId = 'juego' | 'modpack' | 'sistema'
const TABS: { id: TabId; label: Clave }[] = [
  { id: 'juego', label: 'ajustes.tab_juego' },
  { id: 'modpack', label: 'ajustes.tab_modpack' },
  { id: 'sistema', label: 'ajustes.tab_sistema' }
]

export default function Settings(): JSX.Element {
  const loadJava = useStore((s) => s.loadJava)
  const [tab, setTab] = useState<TabId>('juego')
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ juego: null, modpack: null, sistema: null })
  const tr = useT()

  useEffect(() => {
    void loadJava()
  }, [loadJava])

  // Flechas izquierda/derecha entre pestañas (patrón WAI-ARIA de tabs).
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="flex h-full flex-col px-12 pt-8">
      <div className="mb-4 flex items-center gap-6">
        <PanelTitle size="lg">{tr('ajustes.titulo')}</PanelTitle>
        <div role="tablist" aria-label={tr('ajustes.titulo')} className="flex gap-2" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => (tabRefs.current[t.id] = el)}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={btnClass({ size: 'md', on: tab === t.id, className: 'px-5' })}
            >
              {tr(t.label)}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pr-1"
      >
        {tab === 'juego' && (
          <>
            <RamPanel />
            <GamePanel />
            <JavaPanel />
          </>
        )}
        {tab === 'modpack' && (
          <>
            <ModpackPanel />
            <AutoSyncPanel />
          </>
        )}
        {tab === 'sistema' && (
          <>
            <IdiomaPanel />
            <MusicaPanel />
            <DiagnosticsPanel />
            <CreditsPanel />
          </>
        )}
      </div>
    </div>
  )
}

/** Panel de ajustes: título en sans, contenido debajo. */
function Panel({ title, children, aside }: { title: ReactNode; children?: ReactNode; aside?: ReactNode }): JSX.Element {
  return (
    <section className="mc-panel space-y-3 p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-text">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Panel con descripción a la izquierda y un control (interruptor o botón) a la derecha. */
function RowPanel({ title, desc, control }: { title: ReactNode; desc: ReactNode; control: ReactNode }): JSX.Element {
  return (
    <section className="mc-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-text">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{desc}</p>
        </div>
        {control}
      </div>
    </section>
  )
}

function RamPanel(): JSX.Element {
  const ram = useStore((s) => s.ramGb)
  const setRam = useStore((s) => s.setRamGb)
  const maxRam = useStore((s) => s.maxRamGb)
  const totalRam = useStore((s) => s.totalRamGb)
  const tr = useT()
  // El slider nunca deja pasar del tope del equipo, pero avisamos cuando el usuario ya está
  // en el máximo para que entienda por qué no puede subir más.
  const atMax = ram >= maxRam

  return (
    <Panel
      title={<label htmlFor="ram">{tr('ajustes.ram')}</label>}
      aside={<span className="text-lg font-bold text-gold">{ram} GB</span>}
    >
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
      <p className="text-[13px] leading-relaxed text-muted">
        {totalRam > 0 ? tr('ajustes.ram_equipo', { total: totalRam, max: maxRam }) : tr('ajustes.ram_generico')}
        {atMax && totalRam > 0 && <span className="text-gold">{tr('ajustes.ram_maximo')}</span>}
      </p>
    </Panel>
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
    title: 'Stable Audio Open',
    text: 'ajustes.credito_musica',
    links: [{ label: 'Powered by Stability AI', href: 'https://stability.ai/license' }]
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
    <Panel title={tr('ajustes.creditos')}>
      {CREDITS.map((c) => (
        <div key={c.title} className="space-y-1.5">
          <span className="block text-sm font-semibold text-gold">{c.title}</span>
          <p className="text-[13px] leading-relaxed text-muted">{tr(c.text)}</p>
          <div className="flex flex-wrap gap-2">
            {c.links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className={btnClass()}>
                {existe(l.label) ? tr(l.label) : l.label}
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[13px] leading-relaxed text-muted">{tr('ajustes.independiente')}</p>
    </Panel>
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
    <Panel title={tr('ajustes.idioma')}>
      <div className="flex gap-3">
        {LANGS.map((l) => (
          <Btn
            key={l}
            size="md"
            on={lang === l && !otro}
            aria-pressed={lang === l && !otro}
            onClick={() => void setIdioma(l)}
            className="flex-1 py-3"
          >
            {LANG_NAME[l]}
          </Btn>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        {tr('ajustes.idioma_desc')}
        {otro && <span className="text-gold"> {tr('ajustes.idioma_otro', { juego })}</span>}
      </p>
    </Panel>
  )
}

function DiagnosticsPanel(): JSX.Element {
  const openLog = useStore((s) => s.openLog)
  const tr = useT()

  return (
    <RowPanel
      title={tr('ajustes.diagnostico')}
      desc={tr('ajustes.diagnostico_desc')}
      control={
        <Btn size="md" onClick={() => void openLog()} className="shrink-0">
          {tr('ajustes.ver_ultimo_log')}
        </Btn>
      }
    />
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
    <Panel title={tr('ajustes.modpack')}>
      <div className="flex gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={variant === o.id}
            onClick={() => {
              if (o.id !== variant) choose(o.id)
            }}
            className={`${btnClass({ size: 'md', on: variant === o.id })} flex-1 py-3 text-left`}
          >
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className={`mt-0.5 block text-[13px] font-normal ${variant === o.id ? 'text-white/85' : 'text-[#d2cbbd]'}`}>
              {o.desc}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{tr('ajustes.modpack_nota')}</p>

      {pending && (
        <Modal title={tr('ajustes.cambiar_a', { variante: labelOf(pending) })} onClose={() => setPending(null)}>
          {pending === 'experimental' && (
            <div className="mc-inset space-y-2 !border-error p-3">
              <p className="text-[13px] font-semibold leading-relaxed text-error">{tr('ajustes.exp_aviso')}</p>
              <p className="text-[13px] leading-relaxed text-muted">{tr('ajustes.exp_detalle')}</p>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={ackExperimental}
                  onChange={(e) => setAckExperimental(e.target.checked)}
                />
                {tr('ajustes.exp_entiendo')}
              </label>
            </div>
          )}
          <p className="text-[13px] leading-relaxed text-muted">{tr('ajustes.config_recomendada')}</p>
          <div className="flex flex-wrap gap-3">
            <Btn variant="primary" size="md" onClick={() => apply(true)} disabled={blocked}>
              {tr('ajustes.si_aplicar')}
            </Btn>
            <Btn size="md" onClick={() => apply(false)} disabled={blocked}>
              {tr('ajustes.conservar')}
            </Btn>
            <Btn size="md" onClick={() => setPending(null)} className="ml-auto">
              {tr('comun.cancelar')}
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  )
}

function AutoSyncPanel(): JSX.Element {
  const autoSync = useStore((s) => s.autoSyncMods)
  const setSetting = useStore((s) => s.setSetting)
  const tr = useT()

  return (
    <RowPanel
      title={tr('ajustes.autosync')}
      desc={autoSync ? tr('ajustes.autosync_on') : tr('ajustes.autosync_off')}
      control={
        <Toggle
          on={autoSync}
          onChange={(v) => void setSetting({ autoSyncMods: v })}
          label={tr('ajustes.autosync')}
          text={autoSync ? tr('ajustes.activada') : tr('ajustes.desactivada')}
        />
      }
    />
  )
}

function MusicaPanel(): JSX.Element {
  const activa = useStore((s) => s.musicaActiva)
  const volumen = useStore((s) => s.musicaVolumen)
  const setSetting = useStore((s) => s.setSetting)
  const tr = useT()
  // Mientras se arrastra solo cambia el store (el audio responde al momento); se guarda al soltar.
  const guardar = (): void => void setSetting({ musicaVolumen: useStore.getState().musicaVolumen })

  return (
    <section className="mc-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-text">{tr('ajustes.musica')}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{tr('ajustes.musica_desc')}</p>
        </div>
        <Toggle
          on={activa}
          onChange={(v) => void setSetting({ musicaActiva: v })}
          label={tr('ajustes.musica')}
          text={activa ? tr('ajustes.activada') : tr('ajustes.desactivada')}
        />
      </div>
      {activa && (
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="musica-vol" className="text-[13px] text-muted">
            {tr('ajustes.volumen')}
          </label>
          <input
            id="musica-vol"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumen}
            onChange={(e) => useStore.setState({ musicaVolumen: Number(e.target.value) })}
            onPointerUp={guardar}
            onKeyUp={guardar}
            className="mc-range flex-1"
          />
          <span className="w-12 text-right text-sm font-bold text-gold">{Math.round(volumen * 100)}%</span>
        </div>
      )}
    </section>
  )
}

/**
 * Campo que guarda al salir (blur) o con Enter, no en cada tecla: así un número a medio
 * escribir ('' o '6') no llega al main, y el saneado de los flags JVM no pisa lo tecleado.
 */
function CommitInput({
  value,
  onCommit,
  numeric,
  ...rest
}: {
  value: string | number
  onCommit: (v: string) => void
  numeric?: boolean
} & Omit<JSX.IntrinsicElements['input'], 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = (): void => {
    const v = draft.trim()
    if (numeric && (v === '' || !Number.isFinite(Number(v)))) {
      setDraft(String(value)) // vacío o basura: vuelve al valor guardado
      return
    }
    if (v !== String(value)) onCommit(v)
  }
  return (
    <input
      {...rest}
      type={numeric ? 'number' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') setDraft(String(value))
      }}
    />
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
    <Panel title={tr('ajustes.ventana')}>
      <div className="flex items-end gap-4">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {tr('ajustes.ancho')}
          <CommitInput
            numeric
            min={640}
            value={width}
            disabled={fullscreen}
            onCommit={(v) => void setSetting({ width: Number(v) })}
            className="mc-inset w-24 px-2 py-1.5 text-text outline-none disabled:opacity-50"
          />
        </label>
        <span className="pb-2 text-muted" aria-hidden>
          ×
        </span>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {tr('ajustes.alto')}
          <CommitInput
            numeric
            min={480}
            value={height}
            disabled={fullscreen}
            onCommit={(v) => void setSetting({ height: Number(v) })}
            className="mc-inset w-24 px-2 py-1.5 text-text outline-none disabled:opacity-50"
          />
        </label>
        <div className="ml-auto flex items-center gap-3 pb-1">
          <span className="text-[13px] text-muted">{tr('ajustes.pantalla_completa')}</span>
          <Toggle
            on={fullscreen}
            onChange={(v) => void setSetting({ fullscreen: v })}
            label={tr('ajustes.pantalla_completa')}
            text={fullscreen ? tr('ajustes.activada') : tr('ajustes.desactivada')}
          />
        </div>
      </div>

      <label className="flex flex-col gap-1 text-[13px] text-muted">
        {tr('ajustes.jvm')}
        <CommitInput
          value={jvmArgs}
          placeholder="-XX:+UseG1GC …"
          onCommit={(v) => void setSetting({ jvmArgs: v })}
          className="mc-inset w-full px-3 py-2 font-mono text-xs text-text outline-none placeholder:text-muted/50"
        />
      </label>
    </Panel>
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
  const downloading = progress?.phase === 'download'

  return (
    <Panel
      title={tr('ajustes.java')}
      aside={
        info ? (
          <span className="mc-inset flex items-center gap-2 px-2.5 py-1 text-xs text-grass">
            <span className="h-2 w-2 bg-grass" aria-hidden />
            {info.version} · {info.arch}
          </span>
        ) : (
          <span className="mc-inset px-2.5 py-1 text-xs text-muted">{tr('ajustes.java_no_instalado')}</span>
        )
      }
    >
      {busy ? (
        <div className="w-full">
          <Progress value={downloading ? (progress.percent ?? 0) : null} label={phaseLabel} />
          <p className="mt-2 text-xs text-muted">{phaseLabel}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] leading-relaxed text-muted">
            {info ? tr('ajustes.java_listo') : tr('ajustes.java_auto')}
          </p>
          <Btn size="md" onClick={() => void ensureJava(!!info)} className="shrink-0">
            {info ? tr('ajustes.java_reinstalar') : tr('ajustes.java_descargar')}
          </Btn>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}
    </Panel>
  )
}
