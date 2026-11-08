import { useEffect, useRef, useState } from 'react'
import type { DeviceCodeInfo } from '../../../shared/account'
import { useStore } from '../store'
import { useT } from '../i18n'
import { isPremiumEnabled } from '../../../shared/config'
import { Btn, PanelTitle, btnClass } from '../components/ui'

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
        <p className="text-sm text-muted">{tr('login.elige')}</p>
        <h1 className="mc-text mt-1 font-pixel text-4xl font-bold text-gold">{tr('login.titulo')}</h1>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-5">
        {/* --- No-Premium --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <PanelTitle>{tr('login.no_premium')}</PanelTitle>
          <p className="text-[13px] leading-relaxed text-muted">{tr('login.no_premium_desc')}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loginPirata()}
            placeholder={tr('login.tu_nombre')}
            aria-label={tr('login.tu_nombre')}
            maxLength={16}
            className="mc-inset w-full px-3 py-2.5 text-text outline-none placeholder:text-muted/60"
          />
          <Btn variant="primary" size="md" onClick={loginPirata} disabled={busy} className="w-full py-3 text-base font-bold">
            {tr('login.entrar')}
          </Btn>
        </section>

        {/* --- Premium --- */}
        <section className="mc-panel flex flex-col gap-4 p-6">
          <PanelTitle>{tr('login.premium')}</PanelTitle>

          {!device ? (
            <>
              <p className="text-[13px] leading-relaxed text-muted">{tr('login.premium_desc')}</p>
              <div className="flex-1" />
              <Btn
                size="md"
                onClick={loginPremium}
                disabled={busy || !isPremiumEnabled()}
                className="w-full py-3 text-base font-bold"
              >
                {busy ? tr('login.conectando') : tr('login.con_microsoft')}
              </Btn>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-muted">{tr('login.pega_codigo')}</p>
              <div className="mc-inset flex items-center justify-between gap-3 px-4 py-3">
                <span
                  className="mc-text select-all font-mono text-3xl font-bold tracking-[0.2em] text-gold"
                  aria-label={tr('login.codigo')}
                >
                  {device.userCode}
                </span>
                <Btn onClick={() => copy(device.userCode)} className="shrink-0">
                  {copied ? `✓ ${tr('comun.copiado')}` : tr('comun.copiar')}
                </Btn>
              </div>
              <div className="flex gap-2">
                <a
                  href={device.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className={btnClass({ className: 'flex-1 py-2 text-center' })}
                >
                  {tr('login.abrir_enlace')}
                </a>
                <Btn onClick={() => void window.dbr.auth.cancelPremium()} className="flex-1 py-2">
                  {tr('comun.cancelar')}
                </Btn>
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
        <div role="alert" className="mc-panel max-w-3xl !border-error px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}
    </div>
  )
}
