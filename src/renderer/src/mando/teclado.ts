// Disposición del teclado en pantalla del launcher. Copia la del teclado del mando del juego
// (DbrCore core.mando.TecladoDisposicion): QWERTY español con ñ, página de símbolos, 10 unidades
// de ancho por fila. Las teclas especiales empiezan por '#'.

export const MAYUS = '#mayus'
export const BORRAR = '#borrar'
export const SIMBOLOS = '#simbolos'
export const ESPACIO = '#espacio'
export const ACEPTAR = '#aceptar'

export interface Tecla {
  valor: string
  /** Posición y ancho en unidades de tecla. */
  x: number
  w: number
}

function armar(def: string[][]): Tecla[][] {
  return def.map((fila) => {
    let x = 0
    return fila.map((k) => {
      const [valor, ancho] = k.length > 2 && k.lastIndexOf(':') > 0 ? [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))] : [k, 1]
      const t = { valor, x, w: ancho }
      x += ancho
      return t
    })
  })
}

const LETRAS = armar([
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  [MAYUS + ':1.5', 'z', 'x', 'c', 'v', 'b', 'n', 'm', BORRAR + ':1.5'],
  [SIMBOLOS + ':1.5', '-', ESPACIO + ':3.5', '_', '.', ACEPTAR + ':2']
])

const SIMB = armar([
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '@', '#', '$', '%', '&', '*', '(', ')', '?'],
  ["'", '"', ':', ';', '_', '+', '=', '<', '>', '-'],
  ['¿:1.5', '[', ']', '{', '}', '\\', '|', '^', BORRAR + ':1.5'],
  [SIMBOLOS + ':1.5', '/', ESPACIO + ':3.5', ',', '~', ACEPTAR + ':2']
])

const NUMEROS = armar([
  ['1:2', '2:2', '3:2'],
  ['4:2', '5:2', '6:2'],
  ['7:2', '8:2', '9:2'],
  [BORRAR + ':2', '0:2', ACEPTAR + ':2']
])

export function filas(modo: 'letras' | 'simbolos' | 'numeros'): Tecla[][] {
  return modo === 'numeros' ? NUMEROS : modo === 'simbolos' ? SIMB : LETRAS
}

export function especial(t: Tecla): boolean {
  return t.valor.length > 1 && t.valor.startsWith('#')
}

/** Tecla de la fila `fila` cuyo centro queda más cerca de `centro` (al subir o bajar). */
export function masCercana(fs: Tecla[][], fila: number, centro: number): number {
  let mejor = 0
  let d = Infinity
  fs[fila].forEach((t, i) => {
    const dd = Math.abs(t.x + t.w / 2 - centro)
    if (dd < d) {
      d = dd
      mejor = i
    }
  })
  return mejor
}
