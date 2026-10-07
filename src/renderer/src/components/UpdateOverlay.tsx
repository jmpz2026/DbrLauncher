import { useState } from 'react'
import { useStore } from '../store'
import logo from '../assets/logo.png'

// Pantalla bloqueante de actualización forzada (Opción B): si hay versión nueva, el launcher
// la descarga y se reinicia solo. El jugador no puede saltársela. En el .deb (status.manual)
// instalar pide la contraseña del sistema, así que espera a que el jugador pulse el botón.
export default function UpdateOverlay(): JSX.Element | null {
  const status = useStore((s) => s.updateStatus)
  const installUpdate = useStore((s) => s.installUpdate)
  const [installing, setInstalling] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!status || !['available', 'downloading', 'ready'].includes(status.state)) return null

  const ready = status.state === 'ready'
  const manual = ready && !!status.manual
  const pct = ready ? 100 : (status.percent ?? 0)
  const label = !ready
    ? 'Descargando actualización…'
    : !manual
      ? 'Reiniciando…'
      : installing
        ? 'Instalando…'
        : 'Lista para instalar'

  const install = async (): Promise<void> => {
    setInstalling(true)
    setFailed(false)
    // Si sale bien la app se cierra; solo volvemos aquí si falló o se canceló la contraseña.
    const ok = await installUpdate()
    setInstalling(false)
    setFailed(!ok)
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-8">
        <img src={logo} alt="" className="h-16 w-16 object-contain [image-rendering:auto]" />
        <div className="text-center">
          <h1 className="mc-text text-2xl font-bold uppercase tracking-wide text-gold">
            Actualizando launcher
          </h1>
          {status.version && (
            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-gold-deep mc-text-sm">
              v{status.version}
            </p>
          )}
        </div>

        <div className="w-full">
          <div className="mc-inset h-5 w-full overflow-hidden p-[2px]">
            <div
              className="h-full bg-gold transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs uppercase tracking-wider text-muted mc-text-sm">
            {label} <span className="ml-1 text-gold">{pct}%</span>
          </p>
        </div>

        {manual && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={install}
              disabled={installing}
              className="mc-btn mc-btn-gold px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-60"
            >
              {installing ? 'Instalando…' : failed ? 'Reintentar' : 'Actualizar ahora'}
            </button>
            <p className="text-center text-xs text-muted">
              {failed
                ? 'No se pudo instalar. Vuelve a intentarlo e introduce tu contraseña.'
                : 'Se pedirá la contraseña de tu usuario para instalar el paquete.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
