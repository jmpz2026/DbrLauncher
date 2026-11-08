import { useState } from 'react'
import { useStore } from '../store'
import { useT } from '../i18n'
import logo from '../assets/logo.png'
import { Btn, Progress } from './ui'

// Pantalla bloqueante de actualización forzada (Opción B): si hay versión nueva, el launcher
// la descarga y se reinicia solo. El jugador no puede saltársela. En el .deb (status.manual)
// instalar pide la contraseña del sistema, así que espera a que el jugador pulse el botón.
export default function UpdateOverlay(): JSX.Element | null {
  const status = useStore((s) => s.updateStatus)
  const installUpdate = useStore((s) => s.installUpdate)
  const [installing, setInstalling] = useState(false)
  const [failed, setFailed] = useState(false)
  const tr = useT()
  if (!status || !['available', 'downloading', 'ready'].includes(status.state)) return null

  const ready = status.state === 'ready'
  const manual = ready && !!status.manual
  const pct = ready ? 100 : (status.percent ?? 0)
  const label = !ready
    ? tr('update.descargando')
    : !manual
      ? tr('update.reiniciando')
      : installing
        ? tr('comun.instalando')
        : tr('update.lista')

  const install = async (): Promise<void> => {
    setInstalling(true)
    setFailed(false)
    // Si sale bien la app se cierra; solo volvemos aquí si falló o se canceló la contraseña.
    const ok = await installUpdate()
    setInstalling(false)
    setFailed(!ok)
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-label={tr('update.titulo')} className="fixed inset-0 z-[100] grid place-items-center bg-bg">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-8">
        <img src={logo} alt="" className="h-16 w-16 object-contain [image-rendering:auto]" />
        <div className="text-center">
          <h1 className="mc-text font-pixel text-2xl font-bold text-gold">{tr('update.titulo')}</h1>
          {status.version && <p className="mt-1 text-sm text-muted">v{status.version}</p>}
        </div>

        <div className="w-full">
          <Progress value={pct} label={label} />
          <p className="mt-2 text-center text-xs text-muted">
            {label} <span className="ml-1 font-semibold text-gold">{pct}%</span>
          </p>
        </div>

        {manual && (
          <div className="flex flex-col items-center gap-2">
            <Btn variant="primary" size="md" onClick={install} disabled={installing}>
              {installing ? tr('comun.instalando') : failed ? tr('update.reintentar') : tr('update.ahora')}
            </Btn>
            <p className="text-center text-xs text-muted">
              {failed
                ? tr('update.fallo')
                : tr('update.password')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
