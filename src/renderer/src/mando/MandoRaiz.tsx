import { useEffect, useReducer, useRef, useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { Clave } from '../../../shared/i18n'
import { leer, Pulsaciones, type Boton, type Estilo } from './entrada'
import { dialogoAbierto, enfocar, enfocarInicio, focoValido, mover } from './navegar'
import { ACEPTAR, BORRAR, ESPACIO, MAYUS, SIMBOLOS, especial, filas, masCercana, type Tecla } from './teclado'
import Glifo from './Glifo'

// Navegación del launcher con mando (PLAN-canal-movil 8f.1). Se monta una vez en App.
// - Cruceta / stick izquierdo mueven el foco; A pulsa; B cierra el diálogo o vuelve a Inicio.
// - LB/RB cambian la pestaña principal; LT/RT las pestañas internas (Ajustes); Start juega.
// - Stick derecho desplaza. Sobre un campo de texto, A abre el teclado en pantalla.
// El modo mando (anillo de foco y pistas) se apaga al mover el ratón o usar el teclado.
// Con la ventana sin foco (juego abierto) no se lee nada.

type ModoTeclado = 'letras' | 'simbolos' | 'numeros'

interface EstadoTeclado {
  input: HTMLInputElement
  original: string
  modo: ModoTeclado
  mayus: boolean
  fila: number
  col: number
  cursor: number
}

type Contexto = 'normal' | 'dialogo' | 'teclado'

const TIPOS_TEXTO = new Set(['text', 'search', 'number', 'password', 'email', 'url', ''])

function esTexto(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && TIPOS_TEXTO.has(el.type) && !el.readOnly && !el.disabled
}

/** Cambia el valor de un input de forma que React lo vea (setter nativo + evento input). */
function setValor(input: HTMLInputElement, v: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function tecla(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

function ajustarRango(input: HTMLInputElement, pasos: number): void {
  const step = Number(input.step) || 1
  const min = input.min === '' ? 0 : Number(input.min)
  const max = input.max === '' ? 100 : Number(input.max)
  const v = Math.min(max, Math.max(min, Number(input.value) + pasos * step))
  if (String(v) !== input.value) setValor(input, String(v))
}

function desplazable(desde: Element | null): HTMLElement | null {
  for (let el = desde as HTMLElement | null; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
  }
  return (
    Array.from(document.querySelectorAll<HTMLElement>('main *')).find((el) => {
      const oy = getComputedStyle(el).overflowY
      return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight
    }) ?? null
  )
}

export default function MandoRaiz(): JSX.Element | null {
  const [activo, setActivo] = useState(false)
  const [estilo, setEstilo] = useState<Estilo>('xbox')
  const [contexto, setContexto] = useState<Contexto>('normal')
  const [, redibujar] = useReducer((n: number) => n + 1, 0)
  const teclado = useRef<EstadoTeclado | null>(null)
  const activoRef = useRef(false)

  // ---- teclado en pantalla ----
  const abrirTeclado = (input: HTMLInputElement): void => {
    const numeros = input.type === 'number'
    teclado.current = {
      input,
      original: input.value,
      modo: numeros ? 'numeros' : 'letras',
      mayus: false,
      fila: numeros ? 0 : 1,
      col: 0,
      cursor: input.value.length
    }
    redibujar()
  }

  const cerrarTeclado = (cancelar: boolean): void => {
    const k = teclado.current
    if (!k) return
    if (cancelar) setValor(k.input, k.original)
    else tecla(k.input, 'Enter')
    teclado.current = null
    if (k.input.isConnected) enfocar(k.input)
    redibujar()
  }

  const escribir = (texto: string): void => {
    const k = teclado.current
    if (!k) return
    const v = k.input.value
    const max = k.input.maxLength > 0 ? k.input.maxLength : Infinity
    if (v.length + texto.length > max) return
    k.cursor = Math.min(k.cursor, v.length)
    setValor(k.input, v.slice(0, k.cursor) + texto + v.slice(k.cursor))
    k.cursor += texto.length
    redibujar()
  }

  const borrar = (): void => {
    const k = teclado.current
    if (!k) return
    const v = k.input.value
    k.cursor = Math.min(k.cursor, v.length)
    if (k.cursor === 0) return
    setValor(k.input, v.slice(0, k.cursor - 1) + v.slice(k.cursor))
    k.cursor -= 1
    redibujar()
  }

  const pulsarTecla = (t: Tecla): void => {
    const k = teclado.current
    if (!k) return
    switch (t.valor) {
      case MAYUS:
        k.mayus = !k.mayus
        break
      case SIMBOLOS:
        k.modo = k.modo === 'letras' ? 'simbolos' : 'letras'
        k.col = Math.min(k.col, filas(k.modo)[k.fila].length - 1)
        break
      case BORRAR:
        borrar()
        return
      case ESPACIO:
        escribir(' ')
        return
      case ACEPTAR:
        cerrarTeclado(false)
        return
      default:
        escribir(k.mayus ? t.valor.toUpperCase() : t.valor)
        return
    }
    redibujar()
  }

  const manejarTeclado = (b: Boton): void => {
    const k = teclado.current
    if (!k) return
    const fs = filas(k.modo)
    switch (b) {
      case 'IZQUIERDA':
        k.col = (k.col - 1 + fs[k.fila].length) % fs[k.fila].length
        break
      case 'DERECHA':
        k.col = (k.col + 1) % fs[k.fila].length
        break
      case 'ARRIBA':
      case 'ABAJO': {
        const t = fs[k.fila][k.col]
        const nueva = (k.fila + (b === 'ARRIBA' ? -1 : 1) + fs.length) % fs.length
        k.col = masCercana(fs, nueva, t.x + t.w / 2)
        k.fila = nueva
        break
      }
      case 'A':
        pulsarTecla(fs[k.fila][k.col])
        return
      case 'X':
        borrar()
        return
      case 'Y':
        if (k.modo !== 'numeros') escribir(' ')
        return
      case 'START':
        cerrarTeclado(false)
        return
      case 'B':
        cerrarTeclado(true)
        return
      case 'LB':
        if (k.modo !== 'numeros') k.mayus = !k.mayus
        break
      case 'RB':
        if (k.modo !== 'numeros') pulsarTecla({ valor: SIMBOLOS, x: 0, w: 1 })
        return
      case 'LT':
        k.cursor = Math.max(0, Math.min(k.cursor, k.input.value.length) - 1)
        break
      case 'RT':
        k.cursor = Math.min(k.input.value.length, k.cursor + 1)
        break
      default:
        return
    }
    redibujar()
  }

  // ---- navegación ----
  const manejar = (b: Boton): void => {
    if (teclado.current) {
      manejarTeclado(b)
      return
    }
    const { account, tab, setTab } = useStore.getState()
    const dialogo = dialogoAbierto()
    const foco = focoValido()
    switch (b) {
      case 'ARRIBA':
      case 'ABAJO':
        mover(b)
        return
      case 'IZQUIERDA':
      case 'DERECHA':
        if (foco instanceof HTMLInputElement && foco.type === 'range') ajustarRango(foco, b === 'DERECHA' ? 1 : -1)
        else mover(b)
        return
      case 'A':
        if (!foco) enfocarInicio()
        else if (esTexto(foco)) abrirTeclado(foco)
        else foco.click()
        return
      case 'B':
        if (dialogo) tecla(document.activeElement ?? document, 'Escape')
        else if (account && tab !== 'home') {
          setTab('home')
          requestAnimationFrame(() => enfocarInicio())
        }
        return
      case 'LB':
      case 'RB':
        if (dialogo || !account) return
        setTab(tab === 'home' ? 'settings' : 'home')
        requestAnimationFrame(() => enfocarInicio())
        return
      case 'LT':
      case 'RT': {
        if (dialogo) return
        const lista = document.querySelector<HTMLElement>('main [role=tablist]')
        if (!lista) return
        const tabs = Array.from(lista.querySelectorAll<HTMLElement>('[role=tab]'))
        const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')
        const sig = tabs[(i + (b === 'RT' ? 1 : -1) + tabs.length) % tabs.length]
        sig?.click()
        enfocar(sig ?? null)
        return
      }
      case 'START': {
        if (dialogo) return
        const jugar = document.querySelector<HTMLButtonElement>('[data-mando-inicio]')
        if (jugar && !jugar.disabled) jugar.click()
        return
      }
      default:
        return
    }
  }

  const manejarRef = useRef(manejar)
  manejarRef.current = manejar

  // ---- bucle de lectura y modo mando/ratón ----
  useEffect(() => {
    const puls = new Pulsaciones()
    let raf = 0
    let estiloPrev: Estilo = 'xbox'
    let ctxPrev: Contexto = 'normal'

    const activar = (): void => {
      if (activoRef.current) return
      activoRef.current = true
      document.body.dataset.input = 'mando'
      setActivo(true)
      if (!focoValido()) enfocarInicio()
    }
    const desactivar = (): void => {
      if (!activoRef.current) return
      activoRef.current = false
      delete document.body.dataset.input
      setActivo(false)
    }

    const tick = (ahora: number): void => {
      raf = requestAnimationFrame(tick)
      const l = leer()
      if (!l || !document.hasFocus()) {
        puls.limpiar()
        return
      }
      if (l.estilo !== estiloPrev) {
        estiloPrev = l.estilo
        setEstilo(l.estilo)
      }
      const bs = puls.actualizar(l.apretados, ahora)
      if (bs.length > 0 || l.scroll !== 0) {
        const nuevo = !activoRef.current
        activar()
        // La primera pulsación solo despierta el modo mando (muestra el foco), salvo A en un foco ya elegido.
        if (!nuevo || bs.includes('A') || bs.includes('START')) for (const b of bs) manejarRef.current(b)
      }
      if (l.scroll !== 0 && !teclado.current) desplazable(document.activeElement)?.scrollBy(0, l.scroll * 14)
      const ctx: Contexto = teclado.current ? 'teclado' : dialogoAbierto() ? 'dialogo' : 'normal'
      if (ctx !== ctxPrev) {
        ctxPrev = ctx
        setContexto(ctx)
      }
    }
    raf = requestAnimationFrame(tick)

    const onMouse = (e: MouseEvent): void => {
      if (e.movementX !== 0 || e.movementY !== 0) desactivar()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.isTrusted) desactivar()
    }
    window.addEventListener('mousemove', onMouse)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('keydown', onKey, true)
      delete document.body.dataset.input
    }
  }, [])

  // Si el campo del teclado desaparece (cambio de pantalla), se cierra.
  useEffect(() => {
    const k = teclado.current
    if (k && !k.input.isConnected) {
      teclado.current = null
      redibujar()
    }
  })

  const k = teclado.current
  return (
    <>
      {k && <TecladoPantalla k={k} estilo={estilo} onTecla={pulsarTecla} onCerrar={() => cerrarTeclado(true)} />}
      {activo && <Pistas estilo={estilo} contexto={contexto} />}
    </>
  )
}

// ---- vistas ----

function Pistas({ estilo, contexto }: { estilo: Estilo; contexto: Contexto }): JSX.Element | null {
  const tr = useT()
  const account = useStore((s) => s.account)
  const tab = useStore((s) => s.tab)
  if (contexto === 'teclado') return null // el teclado lleva sus propias pistas
  const items: [Boton[], Clave][] = [[['A'], 'mando.elegir']]
  if (contexto === 'dialogo') items.push([['B'], 'mando.atras'])
  else {
    if (account && tab !== 'home') items.push([['B'], 'mando.atras'])
    if (account) items.push([['LB', 'RB'], 'mando.pestanas'])
    if (account && tab === 'home') items.push([['START'], 'mando.jugar'])
  }
  // Sin tocar la NavBar: con sesión va justo encima de ella.
  return (
    <div
      aria-hidden
      data-mando-fuera
      className={`pointer-events-none fixed right-3 z-[105] flex items-center gap-3 border-2 border-black bg-stone/90 px-3 py-1.5 text-xs text-text ${
        account ? 'bottom-[72px]' : 'bottom-3'
      }`}
    >
      {items.map(([bs, clave]) => (
        <span key={clave} className="flex items-center gap-1.5">
          {bs.map((b) => (
            <Glifo key={b} boton={b} estilo={estilo} />
          ))}
          {tr(clave)}
        </span>
      ))}
    </div>
  )
}

const NOMBRE: Record<string, Clave> = {
  [MAYUS]: 'mando.mayus',
  [BORRAR]: 'mando.borrar',
  [SIMBOLOS]: 'mando.simbolos',
  [ESPACIO]: 'mando.espacio',
  [ACEPTAR]: 'mando.aceptar'
}

const UNIDAD = 44 // px por unidad de tecla

function TecladoPantalla({
  k,
  estilo,
  onTecla,
  onCerrar
}: {
  k: EstadoTeclado
  estilo: Estilo
  onTecla: (t: Tecla) => void
  onCerrar: () => void
}): JSX.Element {
  const tr = useT()
  const fs = filas(k.modo)
  const ancho = Math.max(...fs.map((f) => f.reduce((s, t) => s + t.w, 0)))
  const v = k.input.value
  const cursor = Math.min(k.cursor, v.length)
  const etiqueta = k.input.getAttribute('aria-label') || k.input.placeholder || ''
  const oculto = k.input.type === 'password'
  const mostrar = oculto ? '•'.repeat(v.length) : v
  const pistas: [Boton[], Clave][] = [
    [['A'], 'mando.escribir'],
    [['X'], 'mando.borrar'],
    ...(k.modo === 'numeros'
      ? []
      : ([
          [['Y'], 'mando.espacio'],
          [['LB'], 'mando.mayus'],
          [['RB'], 'mando.simbolos']
        ] as [Boton[], Clave][])),
    [['LT', 'RT'], 'mando.cursor'],
    [['START'], 'mando.aceptar'],
    [['B'], 'comun.cancelar']
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('mando.teclado')}
      data-mando-fuera
      className="fixed inset-x-0 bottom-0 z-[110] flex justify-center bg-bg/60 pb-4 pt-2"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className="mc-panel flex flex-col gap-2 p-3">
        {etiqueta && <p className="text-[12px] text-muted">{etiqueta}</p>}
        <div className="mc-inset flex h-9 items-center overflow-hidden whitespace-pre px-3 text-text" style={{ width: ancho * UNIDAD }}>
          <span>{mostrar.slice(0, cursor)}</span>
          <span className="animate-blink -mx-[1px] inline-block h-5 w-[2px] bg-gold" />
          <span>{mostrar.slice(cursor)}</span>
        </div>
        {fs.map((fila, fi) => (
          <div key={fi} className="relative h-10" style={{ width: ancho * UNIDAD }}>
            {fila.map((t, ci) => {
              const sel = fi === k.fila && ci === k.col
              const on = (t.valor === MAYUS && k.mayus) || (t.valor === SIMBOLOS && k.modo === 'simbolos')
              const texto = especial(t) ? tr(NOMBRE[t.valor]) : k.mayus ? t.valor.toUpperCase() : t.valor
              return (
                <button
                  key={ci}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onTecla(t)}
                  className={`mc-btn${on ? ' mc-btn-on' : ''} absolute top-0 h-10 truncate px-1 text-sm font-semibold ${
                    sel ? 'z-10 outline outline-2 outline-offset-0 outline-[#ffcf4a]' : ''
                  } ${t.valor === ACEPTAR ? '!text-gold' : ''}`}
                  style={{ left: t.x * UNIDAD + 2, width: t.w * UNIDAD - 4 }}
                >
                  {texto}
                </button>
              )
            })}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted">
          {pistas.map(([bs, clave]) => (
            <span key={clave} className="flex items-center gap-1">
              {bs.map((b) => (
                <Glifo key={b} boton={b} estilo={estilo} />
              ))}
              {tr(clave)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

