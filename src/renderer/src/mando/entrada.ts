// Lectura del mando (Gamepad API, mapeo "standard" de Chromium) para navegar el launcher.
// Junta todos los mandos conectados, convierte el stick izquierdo en direcciones y entrega
// pulsaciones con repetición al mantener (400 ms y luego cada 120 ms), como el teclado del
// mando del juego (DbrCore core.mando).

export type Boton =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LB'
  | 'RB'
  | 'LT'
  | 'RT'
  | 'BACK'
  | 'START'
  | 'ARRIBA'
  | 'ABAJO'
  | 'IZQUIERDA'
  | 'DERECHA'

export type Estilo = 'xbox' | 'ps'

/** Índices del mapeo standard (W3C Gamepad). */
const INDICES: [Boton, number][] = [
  ['A', 0],
  ['B', 1],
  ['X', 2],
  ['Y', 3],
  ['LB', 4],
  ['RB', 5],
  ['LT', 6],
  ['RT', 7],
  ['BACK', 8],
  ['START', 9],
  ['ARRIBA', 12],
  ['ABAJO', 13],
  ['IZQUIERDA', 14],
  ['DERECHA', 15]
]

/** Botones que se repiten al mantenerlos. */
const REPITEN = new Set<Boton>(['ARRIBA', 'ABAJO', 'IZQUIERDA', 'DERECHA', 'X', 'LT', 'RT'])

const ZONA_STICK = 0.5
const UMBRAL_GATILLO = 0.5
const ESPERA_REPETIR_MS = 400
const CADA_REPETIR_MS = 120

export interface Lectura {
  /** Botones apretados ahora. */
  apretados: Set<Boton>
  /** Eje vertical del stick derecho (-1 arriba, 1 abajo), ya sin zona muerta. */
  scroll: number
  estilo: Estilo
}

/** Lee y junta todos los mandos conectados. Null si no hay ninguno. */
export function leer(): Lectura | null {
  const pads = navigator.getGamepads?.() ?? []
  let alguno = false
  const apretados = new Set<Boton>()
  let scroll = 0
  let estilo: Estilo = 'xbox'
  for (const p of pads) {
    if (!p || !p.connected) continue
    alguno = true
    if (/054c|playstation|dualsense|dualshock/i.test(p.id)) estilo = 'ps'
    for (const [b, i] of INDICES) {
      const btn = p.buttons[i]
      if (!btn) continue
      const gatillo = b === 'LT' || b === 'RT'
      if (gatillo ? btn.value > UMBRAL_GATILLO : btn.pressed) apretados.add(b)
    }
    const x = p.axes[0] ?? 0
    const y = p.axes[1] ?? 0
    if (Math.max(Math.abs(x), Math.abs(y)) > ZONA_STICK) {
      if (Math.abs(x) > Math.abs(y)) apretados.add(x > 0 ? 'DERECHA' : 'IZQUIERDA')
      else apretados.add(y > 0 ? 'ABAJO' : 'ARRIBA')
    }
    const ry = p.axes[3] ?? 0
    if (Math.abs(ry) > 0.2 && Math.abs(ry) > Math.abs(scroll)) scroll = ry
  }
  return alguno ? { apretados, scroll, estilo } : null
}

/**
 * Convierte lecturas sucesivas en pulsaciones: una al bajar el botón y, para los que repiten,
 * otra cada {@link CADA_REPETIR_MS} después de {@link ESPERA_REPETIR_MS} sostenido.
 */
export class Pulsaciones {
  private desde = new Map<Boton, number>()
  private ultima = new Map<Boton, number>()

  actualizar(apretados: Set<Boton>, ahora: number): Boton[] {
    const out: Boton[] = []
    for (const b of Array.from(this.desde.keys())) {
      if (!apretados.has(b)) {
        this.desde.delete(b)
        this.ultima.delete(b)
      }
    }
    for (const b of apretados) {
      const d = this.desde.get(b)
      if (d === undefined) {
        this.desde.set(b, ahora)
        this.ultima.set(b, ahora)
        out.push(b)
      } else if (REPITEN.has(b) && ahora - d >= ESPERA_REPETIR_MS && ahora - (this.ultima.get(b) ?? d) >= CADA_REPETIR_MS) {
        this.ultima.set(b, ahora)
        out.push(b)
      }
    }
    return out
  }

  /** Olvida lo apretado (al perder el foco la ventana), para que nada quede repitiendo. */
  limpiar(): void {
    this.desde.clear()
    this.ultima.clear()
  }
}
