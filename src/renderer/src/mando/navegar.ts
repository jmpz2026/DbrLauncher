import { FOCUSABLE } from '../components/ui'

// Navegación espacial con el mando: desde el elemento con foco, elige el más cercano en la
// dirección pedida. La parte de geometría es pura (elegir) para poder probarla sin DOM.

export type Dir = 'ARRIBA' | 'ABAJO' | 'IZQUIERDA' | 'DERECHA'

export interface Caja {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Índice del candidato más cercano a `desde` en la dirección `dir`, o -1 si no hay ninguno
 * de ese lado. Puntaje: distancia en el eje de la dirección + 2 × desvío en el otro eje,
 * medidos entre centros; solo cuentan los que están por delante del borde de `desde`.
 */
export function elegir(desde: Caja, candidatos: Caja[], dir: Dir): number {
  const cx = desde.x + desde.w / 2
  const cy = desde.y + desde.h / 2
  let mejor = -1
  let puntaje = Infinity
  candidatos.forEach((c, i) => {
    const ox = c.x + c.w / 2
    const oy = c.y + c.h / 2
    let principal: number
    let lateral: number
    switch (dir) {
      case 'ARRIBA':
        if (oy >= cy || c.y + c.h > desde.y + desde.h / 2) return
        principal = cy - oy
        lateral = Math.abs(ox - cx)
        break
      case 'ABAJO':
        if (oy <= cy || c.y < desde.y + desde.h / 2) return
        principal = oy - cy
        lateral = Math.abs(ox - cx)
        break
      case 'IZQUIERDA':
        if (ox >= cx || c.x + c.w > desde.x + desde.w / 2) return
        principal = cx - ox
        lateral = Math.abs(oy - cy)
        break
      case 'DERECHA':
        if (ox <= cx || c.x < desde.x + desde.w / 2) return
        principal = ox - cx
        lateral = Math.abs(oy - cy)
        break
    }
    const p = principal + 2 * lateral
    if (p < puntaje) {
      puntaje = p
      mejor = i
    }
  })
  return mejor
}

/** Diálogo abierto de más arriba (el último en el DOM), si hay uno. */
export function dialogoAbierto(): HTMLElement | null {
  const ds = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog],[role=alertdialog]')).filter(visible)
  return ds[ds.length - 1] ?? null
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  return getComputedStyle(el).visibility !== 'hidden'
}

/** Elementos enfocables visibles, dentro del diálogo de arriba si hay uno abierto. */
export function candidatos(): HTMLElement[] {
  const raiz: ParentNode = dialogoAbierto() ?? document
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => visible(el) && !el.closest('[data-mando-fuera]')
  )
}

function caja(el: HTMLElement): Caja {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** Foco al elemento de inicio ([data-mando-inicio]) o al primero. */
export function enfocarInicio(): HTMLElement | null {
  const cs = candidatos()
  const el = cs.find((c) => c.hasAttribute('data-mando-inicio')) ?? cs[0] ?? null
  enfocar(el)
  return el
}

export function enfocar(el: HTMLElement | null): void {
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** ¿El foco actual es válido para navegar desde él? */
export function focoValido(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null
  if (!a || a === document.body) return null
  return candidatos().includes(a) ? a : null
}

/** Mueve el foco en una dirección. Sin foco válido, va al de inicio. */
export function mover(dir: Dir): void {
  const actual = focoValido()
  if (!actual) {
    enfocarInicio()
    return
  }
  const cs = candidatos().filter((c) => c !== actual)
  const i = elegir(caja(actual), cs.map(caja), dir)
  if (i >= 0) enfocar(cs[i])
}
