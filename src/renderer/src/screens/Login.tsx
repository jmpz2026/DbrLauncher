import { useState } from 'react'
import type { DeviceCodeInfo } from '../../../shared/account'
import { useStore } from '../store'

export default function Login(): JSX.Element {
  const setAccount = useStore((s) => s.setAccount)

  const [name, setName] = useState('')
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loginPirata(): Promise<void> {
    setError('')
    const res = await window.dbr.auth.loginPirata(name)
    if (res.ok) setAccount(res.account)
    else setError(res.error)
  }

  async function loginPremium(): Promise<void> {
    setError('')
    setBusy(true)
    setDevice(null)
    const off = window.dbr.auth.onDeviceCode((info) => setDevice(info))
    try {
      const res = await window.dbr.auth.loginPremium()
      if (res.ok) setAccount(res.account)
      else setError(res.error)
    } finally {
      off()
      setBusy(false)
      setDevice(null)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-gold-deep mc-text-sm">
          Elige cómo entrar
        </p>
        <h1 className="mc-text mt-2 text-4xl font-bold uppercase tracking-tight text-gold">
          Iniciar sesión
        </h1>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-5">
        {/* --- Pirata --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <span className="h-4 w-2 bg-muted" />
            <h2 className="mc-text-sm text-lg font-bold uppercase tracking-wide text-text">Pirata</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Sin cuenta de Mojang. Solo elige tu nombre en el servidor.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loginPirata()}
            placeholder="Tu nombre"
            maxLength={16}
            className="mc-inset w-full px-3 py-2.5 text-text outline-none placeholder:text-muted/60"
          />
          <button
            onClick={loginPirata}
            disabled={busy}
            className="mc-btn-gold w-full py-3 text-base font-bold uppercase tracking-[0.14em] disabled:opacity-50"
          >
            Entrar
          </button>
        </section>

        {/* --- Premium --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <span className="h-4 w-2 bg-gold" />
            <h2 className="mc-text-sm text-lg font-bold uppercase tracking-wide text-gold">
              Premium
            </h2>
          </div>

          {!device ? (
            <>
              <p className="text-xs leading-relaxed text-muted">
                Cuenta oficial de Minecraft (Microsoft). Se abrirá tu navegador.
              </p>
              <div className="flex-1" />
              <button
                onClick={loginPremium}
                disabled={busy}
                className="mc-btn w-full py-3 text-base font-bold uppercase tracking-[0.14em] disabled:opacity-50"
              >
                {busy ? 'Conectando…' : 'Entrar con Microsoft'}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-muted">
                Abre <span className="text-gold-light">{device.verificationUri}</span> e introduce
                este código:
              </p>
              <div className="mc-inset grid place-items-center py-3">
                <span className="mc-text text-3xl font-bold tracking-[0.3em] text-gold">
                  {device.userCode}
                </span>
              </div>
              <p className="text-xs uppercase tracking-wider text-muted">
                Esperando autorización<span className="animate-blink">…</span>
              </p>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="mc-panel !border-red-600 max-w-3xl px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
