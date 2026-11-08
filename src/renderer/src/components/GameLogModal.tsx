import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import { Btn, Modal } from './ui'

// Visor del log del último arranque de Minecraft. Se abre desde el aviso de crash (Home)
// o desde Ajustes. Solo lectura: mostrar, copiar y abrir la carpeta del juego.
export default function GameLogModal(): JSX.Element | null {
  const open = useStore((s) => s.logOpen)
  const log = useStore((s) => s.gameLog)
  const close = useStore((s) => s.closeLog)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const tr = useT()

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!open) return null

  const copy = (): void => {
    void navigator.clipboard.writeText(log).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Modal
      title={tr('log.titulo')}
      onClose={close}
      width="max-w-2xl"
      z="z-[90]"
      actions={<Btn onClick={close}>{tr('comun.cerrar')}</Btn>}
    >
      <pre
        tabIndex={0}
        className="mc-inset h-[45vh] select-text overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-text"
      >
        {log || tr('log.vacio')}
      </pre>

      <div className="flex gap-3">
        <Btn size="md" onClick={copy}>
          {copied ? `${tr('comun.copiado')} ✓` : tr('comun.copiar')}
        </Btn>
        <Btn size="md" onClick={() => window.dbr.openGameFolder()}>
          {tr('log.abrir_carpeta')}
        </Btn>
      </div>
    </Modal>
  )
}
