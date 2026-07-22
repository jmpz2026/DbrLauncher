import { useEffect, useState } from 'react'
import type { FuseStatus } from '../../../shared/fuse'

// Aviso (solo Linux) de que falta libfuse2, con comando copiable y botón para instalarla
// con un clic vía pkexec. Solo aparece si la app arrancó sin fuse (modo extract-and-run):
// el caso normal es que fuse esté presente y este banner nunca se muestre.
export default function FuseBanner(): JSX.Element | null {
  const [status, setStatus] = useState<FuseStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setTimeout(() => setCopied(false), 1500)
  }

  const install = async (): Promise<void> => {
    setInstalling(true)
    setError(null)
    const res = await window.dbr.fuse.install()
    setInstalling(false)
    if (res.ok) setDismissed(true)
    else setError(res.error ?? 'No se pudo instalar')
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-gold/40 bg-bg/95 px-6 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mc-text-sm text-sm font-bold uppercase tracking-wide text-gold">
              Falta libfuse2
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Tu sistema no tiene libfuse2. Sin ella el launcher puede no abrir con doble-click.
              Instálala para que funcione y se actualice bien.
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-xs uppercase tracking-wider text-muted hover:text-text"
          >
            Cerrar
          </button>
        </div>

        {cmd && (
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-black/40 px-2 py-1 text-xs text-text">
              {cmd}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded border border-gold/40 px-2 py-1 text-xs uppercase tracking-wider text-gold hover:bg-gold/10"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        {status.canAutoInstall && (
          <button
            onClick={install}
            disabled={installing}
            className="self-start rounded bg-gold px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-bg hover:brightness-110 disabled:opacity-60"
          >
            {installing ? 'Instalando…' : 'Instalar ahora'}
          </button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
