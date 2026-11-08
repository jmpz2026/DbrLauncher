import { useEffect, useRef, useState } from 'react'
import type { DeviceCodeInfo } from '../../../shared/account'
import { useStore } from '../store'
import { useT } from '../i18n'
import { isPremiumEnabled } from '../../../shared/config'

/** mm:ss que quedan hasta `deadline` (ms epoch), refrescado cada segundo. */
function useCountdown(deadline: number | null): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])
  if (!deadline) return ''
  const s = Math.max(0, Math.round((deadline - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Login(): JSX.Element {
  const setAccount = useStore((s) => s.setAccount)
  const tr = useT()

  const [name, setName] = useState('')
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const left = useCountdown(deadline)

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  function copy(code: string): void {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true)
        clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        /* sin permiso de portapapeles: el código sigue en pantalla */
      })
  }

  async function loginPirata(): Promise<void> {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const res = await window.dbr.auth.loginPirata(name)
      if (res.ok) setAccount(res.account)
      else setError(res.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function loginPremium(): Promise<void> {
    if (busy) return
    setError('')
    setBusy(true)
    setDevice(null)
    const off = window.dbr.auth.onDeviceCode((info) => {
      setDevice(info)
      setDeadline(Date.now() + info.expiresIn * 1000)
      // El jugador va a pegarlo en el navegador que se acaba de abrir: copiarlo ya.
      copy(info.userCode)
    })
    try {
      const res = await window.dbr.auth.loginPremium()
      if (res.ok) setAccount(res.account)
      else if (!res.cancelled) setError(res.error)
    } catch (e) {
      setError(String(e))
    } finally {
      off()
      setBusy(false)
      setDevice(null)
      setDeadline(null)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-gold-deep mc-text-sm">
          {tr('login.elige')}
        </p>
        <h1 className="mc-text mt-2 text-4xl font-bold uppercase tracking-tight text-gold">
          {tr('login.titulo')}
        </h1>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-5">
        {/* --- No-Premium --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <span className="h-4 w-2 bg-muted" />
            <h2 className="mc-text-sm text-lg font-bold uppercase tracking-wide text-text">
              {tr('login.no_premium')}
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-muted">{tr('login.no_premium_desc')}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loginPirata()}
            placeholder={tr('login.tu_nombre')}
            aria-label={tr('login.tu_nombre')}
            maxLength={16}
            className="mc-inset w-full px-3 py-2.5 text-text outline-none placeholder:text-muted/60"
          />
          <button
            onClick={loginPirata}
            disabled={busy}
            className="mc-btn-gold w-full py-3 text-base font-bold uppercase tracking-[0.14em] disabled:opacity-50"
          >
            {tr('login.entrar')}
          </button>
        </section>

        {/* --- Premium --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <span className="h-4 w-2 bg-gold" />
            <h2 className="mc-text-sm text-lg font-bold uppercase tracking-wide text-gold">
              {tr('login.premium')}
            </h2>
          </div>

          {!device ? (
            <>
              <p className="text-xs leading-relaxed text-muted">{tr('login.premium_desc')}</p>
              <div className="flex-1" />
              <button
                onClick={loginPremium}
                disabled={busy || !isPremiumEnabled()}
                className="mc-btn w-full py-3 text-base font-bold uppercase tracking-[0.14em] disabled:opacity-50"
              >
                {busy ? tr('login.conectando') : tr('login.con_microsoft')}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-muted">{tr('login.pega_codigo')}</p>
              <div className="mc-inset flex items-center justify-between gap-3 px-4 py-3">
                <span
                  className="mc-text select-all text-3xl font-bold tracking-[0.2em] text-gold"
                  aria-label={tr('login.codigo')}
                >
                  {device.userCode}
                </span>
                <button
                  type="button"
                  onClick={() => copy(device.userCode)}
                  className="mc-btn shrink-0 px-3 py-1.5 text-xs font-semibold uppercase"
                >
                  {copied ? `✓ ${tr('comun.copiado')}` : tr('comun.copiar')}
                </button>
              </div>
              <div className="flex gap-2">
                <a
                  href={device.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="mc-btn flex-1 py-2 text-center text-xs font-semibold uppercase"
                >
                  {tr('login.abrir_enlace')}
                </a>
                <button
                  type="button"
                  onClick={() => void window.dbr.auth.cancelPremium()}
                  className="mc-btn flex-1 py-2 text-xs font-semibold uppercase"
                >
                  {tr('comun.cancelar')}
                </button>
              </div>
              <p className="flex justify-between text-xs text-muted">
                <span>
                  {tr('login.esperando')}
                  <span className="animate-blink">…</span>
                </span>
                <span>{tr('login.caduca', { t: left })}</span>
              </p>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div role="alert" className="mc-panel !border-red-600 max-w-3xl px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
