import { useEffect, useState } from 'react'
import type { LiteProposal } from '../../../shared/perf'
import { useStore } from '../store'

// Propuesta de pasar a la versión Lite en equipos justos (DbrServerPack/docs/rendimiento).
// Sale una vez por arranque como mucho: la decide main/perf (hardware una sola vez, o la marca
// que deja el juego al activar su modo ligero). Aceptar = el mismo cambio que el selector de
// Ajustes con "aplicar la configuración recomendada", que trae el modo ligero del mod.
export default function LiteProposalModal(): JSX.Element | null {
  const setSetting = useStore((s) => s.setSetting)
  const [proposal, setProposal] = useState<LiteProposal | null>(null)

  useEffect(() => {
    if (!window.dbr?.perf) return
    void window.dbr.perf.check().then((p) => {
      if (p.propose) setProposal(p)
    })
  }, [])

  if (!proposal) return null

  const answer = (accept: boolean): void => {
    setProposal(null)
    void window.dbr.perf.answer(accept)
    if (accept) void setSetting({ modpackVariant: 'lite', modpackSeedPending: true })
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-bg/80 p-8">
      <div className="mc-panel flex w-full max-w-md flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="h-5 w-2 bg-gold" />
          <h2 className="mc-text text-lg font-bold uppercase tracking-wide text-gold">
            Tu equipo parece justo
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          ¿Pasar a la versión Lite? Usa ajustes gráficos más ligeros y activa el modo ligero
          del juego, así irá más fluido. Aplica su configuración recomendada (opciones
          gráficas y ajustes de mods). Puedes volver a Completo cuando quieras desde Ajustes.
        </p>
        <p className="text-xs leading-relaxed text-muted">{proposal.reason}</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => answer(true)}
            className="mc-btn mc-btn-gold px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            Pasar a Lite
          </button>
          <button
            onClick={() => answer(false)}
            className="mc-btn px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            Seguir en Completo
          </button>
        </div>
      </div>
    </div>
  )
}
