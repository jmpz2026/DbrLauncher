// Propuesta de pasar a la variante Lite en equipos justos. Plan en
// DbrServerPack/docs/rendimiento/PLAN.md (fase 4).

/** Respuesta guardada en los ajustes: la propuesta por hardware sale una sola vez. */
export type LiteProposalAnswer = 'none' | 'accepted' | 'rejected'

export interface LiteProposal {
  propose: boolean
  // Texto para el jugador: por qué se propone.
  reason: string
  // true = la pidió el juego (el mod activó su modo ligero y dejó la marca recomendarLite).
  fromGame: boolean
}
