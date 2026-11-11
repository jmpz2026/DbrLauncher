import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Piezas comunes de la interfaz: un solo botón, un solo diálogo, una sola barra de progreso
// y un solo título de panel, para que todas las pantallas se vean y se comporten igual.

type Variant = 'stone' | 'primary'
type Size = 'sm' | 'md'

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm'
}

/** Clases de botón, también para enlaces <a> que se ven como botón. */
export function btnClass(opts: { variant?: Variant; size?: Size; on?: boolean; className?: string } = {}): string {
  const { variant = 'stone', size = 'sm', on = false, className = '' } = opts
  const base = variant === 'primary' ? 'mc-btn-primary' : `mc-btn${on ? ' mc-btn-on' : ''}`
  return `${base} ${SIZE[size]} font-semibold ${className}`.trim()
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Opción elegida (pestaña, idioma): se pinta en azul. */
  on?: boolean
}

export function Btn({ variant, size, on, className, type = 'button', ...rest }: BtnProps): JSX.Element {
  return <button type={type} className={btnClass({ variant, size, on, className })} {...rest} />
}

/** Interruptor de encendido/apagado; el estado va en aria-pressed. */
export function Toggle({
  on,
  onChange,
  label,
  text
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  text: string
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex shrink-0 items-center gap-2.5 text-sm text-text"
    >
      <span className="mc-switch" aria-hidden />
      <span className={`w-20 text-left ${on ? 'text-text' : 'text-muted'}`}>{text}</span>
    </button>
  )
}

/** Título de panel o diálogo: barra de color + texto en Pixelify. */
export function PanelTitle({
  children,
  id,
  size = 'md',
  as: Tag = 'h2'
}: {
  children: ReactNode
  id?: string
  size?: 'sm' | 'md' | 'lg'
  as?: 'h2' | 'h3'
}): JSX.Element {
  const text = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-base'
  const bar = size === 'lg' ? 'h-5' : 'h-4'
  return (
    <Tag id={id} className={`mc-text-sm flex items-center gap-2.5 font-pixel font-bold text-text ${text}`}>
      <span className={`${bar} w-2 shrink-0 bg-saga`} aria-hidden />
      {children}
    </Tag>
  )
}

/** Barra de progreso. `value` null = indeterminada (un bloque que recorre el carril). */
export function Progress({ value, label }: { value: number | null; label?: string }): JSX.Element {
  const pct = value === null ? undefined : Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="mc-inset relative h-5 w-full overflow-hidden p-[2px]"
    >
      {pct === undefined ? (
        <div className="progress-indet animate-indeterminate bg-gold" />
      ) : (
        <div className="h-full bg-gold transition-[width] duration-150" style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}

export const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Diálogo modal: role=dialog, Escape cierra, el foco no sale del diálogo y vuelve a donde
 * estaba al cerrar. Sin `onClose` no se puede cerrar con Escape ni con clic fuera.
 */
export function Modal({
  title,
  onClose,
  children,
  actions,
  width = 'max-w-md',
  z = 'z-[95]'
}: {
  title: ReactNode
  onClose?: () => void
  children: ReactNode
  /** Botones a la derecha del título (p. ej. Cerrar). */
  actions?: ReactNode
  width?: string
  z?: string
}): JSX.Element {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = panel.current
    const first = el?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? el)?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && closeRef.current) {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === firstEl || !el.contains(document.activeElement))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (document.activeElement === lastEl || !el.contains(document.activeElement))) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [])

  return (
    <div
      className={`fixed inset-0 ${z} grid place-items-center bg-bg/80 p-8`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`mc-panel flex w-full ${width} flex-col gap-3 p-5 outline-none`}
      >
        <div className="flex items-center gap-3">
          <PanelTitle id={titleId}>{title}</PanelTitle>
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}
