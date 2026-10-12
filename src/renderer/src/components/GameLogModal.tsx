import { useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'

// Visor del log del último arranque de Minecraft. Se abre desde el aviso de crash (Home)
// o desde Ajustes. Solo lectura: mostrar, copiar y abrir la carpeta del juego.
export default function GameLogModal(): JSX.Element | null {
  const open = useStore((s) => s.logOpen)
  const log = useStore((s) => s.gameLog)
  const close = useStore((s) => s.closeLog)
  const [copied, setCopied] = useState(false)
  const tr = useT()

  if (!open) return null

  const copy = (): void => {
    void navigator.clipboard.writeText(log).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-bg/80 p-8" onClick={close}>
      <div
        className="mc-panel flex w-full max-w-2xl flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="h-5 w-2 bg-gold" />
          <h2 className="mc-text text-lg font-bold uppercase tracking-wide text-gold">
            {tr('log.titulo')}
          </h2>
          <button
            onClick={close}
            className="mc-btn ml-auto px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {tr('comun.cerrar')}
          </button>
        </div>

        <pre className="mc-inset h-[45vh] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-text">
          {log || tr('log.vacio')}
        </pre>

        <div className="flex gap-3">
          <button
            onClick={copy}
            className="mc-btn px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {copied ? `${tr('comun.copiado')} ✓` : tr('comun.copiar')}
          </button>
          <button
            onClick={() => window.dbr.openGameFolder()}
            className="mc-btn px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            {tr('log.abrir_carpeta')}
          </button>
        </div>
      </div>
    </div>
  )
}
