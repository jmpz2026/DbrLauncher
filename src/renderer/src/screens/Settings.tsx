import { useEffect } from 'react'
import { useStore } from '../store'

export default function Settings(): JSX.Element {
  const ram = useStore((s) => s.ramGb)
  const setRam = useStore((s) => s.setRamGb)
  const maxRam = useStore((s) => s.maxRamGb)
  const totalRam = useStore((s) => s.totalRamGb)
  const loadJava = useStore((s) => s.loadJava)

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
        <h2 className="mc-text text-2xl font-bold uppercase tracking-wide text-gold">Ajustes</h2>
      </div>

      {/* Variante del modpack */}
      <ModpackPanel />

      {/* Memoria RAM */}
      <div className="mc-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="ram" className="text-sm font-semibold uppercase tracking-wider">
            Memoria RAM
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
            ? `Tu equipo tiene ${totalRam} GB. Máximo asignable: ${maxRam} GB (se reservan 2 GB para el sistema).`
            : 'Asigna solo parte de tu RAM; deja memoria libre para el sistema.'}
          {atMax && totalRam > 0 && (
            <span className="text-gold"> Estás en el máximo recomendado para tu equipo.</span>
          )}
        </p>
      </div>

      {/* Ventana y JVM */}
      <GamePanel />

      {/* Runtime de Java */}
      <JavaPanel />
    </div>
  )
}

function ModpackPanel(): JSX.Element {
  const variant = useStore((s) => s.modpackVariant)
  const setSetting = useStore((s) => s.setSetting)

  const options = [
    { id: 'full' as const, label: 'Completo', desc: 'Todos los mods (recomendado)' },
    { id: 'lite' as const, label: 'Lite', desc: 'Menos mods, para equipos justos' }
  ]

  return (
    <div className="mc-panel space-y-3 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">Versión del modpack</span>
      <div className="flex gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => void setSetting({ modpackVariant: o.id })}
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
        Al cambiar de versión, los mods se re-sincronizan la próxima vez que le des a Jugar.
      </p>
    </div>
  )
}

function GamePanel(): JSX.Element {
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const fullscreen = useStore((s) => s.fullscreen)
  const jvmArgs = useStore((s) => s.jvmArgs)
  const setSetting = useStore((s) => s.setSetting)

  return (
    <div className="mc-panel space-y-4 p-5">
      <span className="text-sm font-semibold uppercase tracking-wider">Ventana y JVM</span>

      <div className="flex items-end gap-4">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-muted">
          Ancho
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
          Alto
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
          Pantalla completa
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wider text-muted">
        Argumentos JVM extra
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

  let phaseLabel = 'Preparando…'
  if (progress?.phase === 'download') phaseLabel = `Descargando… ${progress.percent ?? 0}%`
  else if (progress?.phase === 'extract') phaseLabel = 'Extrayendo…'
  else if (progress?.phase === 'verify') phaseLabel = 'Verificando…'
  const pct = progress?.phase === 'download' ? (progress.percent ?? 0) : 100
  const indeterminate = !progress || progress.phase !== 'download'

  return (
    <div className="mc-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider">Java 8 (runtime)</span>
        {info ? (
          <span className="mc-inset flex items-center gap-2 px-2.5 py-1 text-xs text-grass">
            <span className="h-2 w-2 bg-grass" />
            {info.version} · {info.arch}
          </span>
        ) : (
          <span className="mc-inset px-2.5 py-1 text-xs text-muted">No instalado</span>
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
              ? 'Listo. Se usará para lanzar Minecraft 1.7.10.'
              : 'Se descargará automáticamente (Temurin/Adoptium) según tu sistema.'}
          </p>
          <button
            onClick={() => void ensureJava()}
            className="mc-btn shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {info ? 'Reinstalar' : 'Descargar Java 8'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}
