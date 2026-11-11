import type { Boton, Estilo } from './entrada'

// Glifos de los botones del mando dibujados con CSS (sin logos de marcas).

const CARAS: Record<'A' | 'B' | 'X' | 'Y', { xbox: string; ps: string; color: string }> = {
  A: { xbox: 'A', ps: '✕', color: '#5fbf3f' },
  B: { xbox: 'B', ps: '○', color: '#e0503c' },
  X: { xbox: 'X', ps: '□', color: '#3c8ce0' },
  Y: { xbox: 'Y', ps: '△', color: '#e8c33a' }
}

const TEXTO: Partial<Record<Boton, { xbox: string; ps: string }>> = {
  LB: { xbox: 'LB', ps: 'L1' },
  RB: { xbox: 'RB', ps: 'R1' },
  LT: { xbox: 'LT', ps: 'L2' },
  RT: { xbox: 'RT', ps: 'R2' },
  START: { xbox: 'Start', ps: 'Options' },
  BACK: { xbox: 'Back', ps: 'Share' }
}

export default function Glifo({ boton, estilo }: { boton: Boton; estilo: Estilo }): JSX.Element {
  if (boton === 'A' || boton === 'B' || boton === 'X' || boton === 'Y') {
    const c = CARAS[boton]
    return (
      <span
        aria-hidden
        className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-black text-[11px] font-bold leading-none text-white"
        style={{ background: c.color }}
      >
        {c[estilo]}
      </span>
    )
  }
  const t = TEXTO[boton]
  return (
    <span
      aria-hidden
      className="inline-grid h-5 min-w-[26px] shrink-0 place-items-center rounded-[4px] border-2 border-black bg-[#3a3a3a] px-1 text-[10px] font-bold leading-none text-white"
    >
      {t ? t[estilo] : boton}
    </span>
  )
}
