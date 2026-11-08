import { useEffect, useState } from 'react'
import type { LiteProposal } from '../../../shared/perf'
import { useStore } from '../store'
import { useT } from '../i18n'
import { Btn, Modal } from './ui'

// Propuesta de pasar a la versión Lite en equipos justos (DbrServerPack/docs/rendimiento).
// Sale una vez por arranque como mucho: la decide main/perf (hardware una sola vez, o la marca
// que deja el juego al activar su modo ligero). Aceptar = el mismo cambio que el selector de
// Ajustes con "aplicar la configuración recomendada", que trae el modo ligero del mod.
export default function LiteProposalModal(): JSX.Element | null {
  const setSetting = useStore((s) => s.setSetting)
  const [proposal, setProposal] = useState<LiteProposal | null>(null)
  const tr = useT()

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
    // Escape o clic fuera = seguir como está (la misma respuesta que el botón).
    <Modal title={tr('lite.titulo')} onClose={() => answer(false)}>
      <p className="text-[13px] leading-relaxed text-muted">{tr('lite.texto')}</p>
      <p className="text-[13px] leading-relaxed text-muted">{proposal.reason}</p>
      <div className="flex flex-wrap gap-3">
        <Btn variant="primary" size="md" onClick={() => answer(true)}>
          {tr('lite.pasar')}
        </Btn>
        <Btn size="md" onClick={() => answer(false)}>
          {tr('lite.seguir')}
        </Btn>
      </div>
    </Modal>
  )
}
