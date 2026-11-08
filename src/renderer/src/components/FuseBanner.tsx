import { useEffect, useRef, useState } from 'react'
import type { FuseStatus } from '../../../shared/fuse'
import { useT } from '../i18n'
import { Btn } from './ui'

// Aviso (solo Linux) de que falta libfuse2, con comando copiable y botón para instalarla
// con un clic vía pkexec. Solo aparece si la app arrancó sin fuse (modo extract-and-run):
// el caso normal es que fuse esté presente y este banner nunca se muestre.
export default function FuseBanner(): JSX.Element | null {
  const [status, setStatus] = useState<FuseStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const tr = useT()

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (window.dbr?.platform !== 'linux' || !window.dbr?.fuse) return
    void window.dbr.fuse.status().then(setStatus)
  }, [])

  if (dismissed || !status?.missing) return null

  const cmd = status.installCmd ? `sudo ${status.installCmd}` : null

  const copy = (): void => {
    if (!cmd) return
    void navigator.clipboard.writeText(cmd)
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  const install = async (): Promise<void> => {
    setInstalling(true)
    setError(null)
    const res = await window.dbr.fuse.install()
    setInstalling(false)
    if (res.ok) setDismissed(true)
    else setError(res.error ?? tr('fuse.no_instalada'))
  }

  return (
    <div role="region" aria-label={tr('fuse.titulo')} className="fixed inset-x-0 bottom-0 z-[90] border-t-2 border-black bg-stone px-6 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gold">{tr('fuse.titulo')}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {tr('fuse.texto')}
            </p>
          </div>
          <Btn onClick={() => setDismissed(true)} className="shrink-0">
            {tr('comun.cerrar')}
          </Btn>
        </div>

        {cmd && (
          <div className="flex items-center gap-2">
            <code className="mc-inset flex-1 select-text overflow-x-auto px-2 py-1 font-mono text-xs text-text">
              {cmd}
            </code>
            <Btn onClick={copy} className="shrink-0">
              {copied ? tr('comun.copiado') : tr('comun.copiar')}
            </Btn>
          </div>
        )}

        {status.canAutoInstall && (
          <Btn variant="primary" onClick={install} disabled={installing} className="self-start">
            {installing ? tr('comun.instalando') : tr('fuse.instalar')}
          </Btn>
        )}

        {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
      </div>
    </div>
  )
}
