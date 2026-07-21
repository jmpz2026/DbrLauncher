import { useStore } from '../store'

/** Aviso pixel de auto-actualización (esquina inferior derecha). */
export default function UpdateBanner(): JSX.Element | null {
  const status = useStore((s) => s.updateStatus)
  const install = useStore((s) => s.installUpdate)

  // Solo se muestra cuando hay algo accionable/relevante.
  if (!status || status.state === 'idle' || status.state === 'none' || status.state === 'checking') {
    return null
  }

  return (
    <div className="pointer-events-auto fixed bottom-20 right-6 z-50 max-w-xs">
      <div className="mc-panel p-4">
        {status.state === 'available' && (
          <p className="text-xs uppercase tracking-wider text-gold-light mc-text-sm">
            Actualización v{status.version} disponible — descargando…
          </p>
        )}

        {status.state === 'downloading' && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted mc-text-sm">
              Descargando actualización <span className="text-gold">{status.percent ?? 0}%</span>
            </p>
            <div className="mc-inset h-4 w-full overflow-hidden p-[2px]">
              <div
                className="h-full bg-gold transition-[width] duration-150"
                style={{ width: `${status.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {status.state === 'ready' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-wider text-grass mc-text-sm">
              v{status.version} lista para instalar
            </p>
            <button
              onClick={install}
              className="mc-btn-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.14em]"
            >
              Reiniciar e instalar
            </button>
          </div>
        )}

        {status.state === 'error' && (
          <p className="text-xs text-red-400">No se pudo actualizar: {status.error}</p>
        )}
      </div>
    </div>
  )
}
