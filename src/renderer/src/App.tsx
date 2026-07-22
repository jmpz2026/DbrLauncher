import { useEffect } from 'react'
import Background from './components/Background'
import TitleBar from './components/TitleBar'
import NavBar from './components/NavBar'
import Home from './screens/Home'
import News from './screens/News'
import Settings from './screens/Settings'
import Login from './screens/Login'
import UpdateOverlay from './components/UpdateOverlay'
import FuseBanner from './components/FuseBanner'
import { useStore } from './store'

export default function App(): JSX.Element {
  const tab = useStore((s) => s.tab)
  const ready = useStore((s) => s.ready)
  const account = useStore((s) => s.account)
  const hydrate = useStore((s) => s.hydrate)
  const setUpdateStatus = useStore((s) => s.setUpdateStatus)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Suscripción a la auto-actualización (dispara el chequeo en main).
  useEffect(() => {
    if (!window.dbr?.update) return
    const off = window.dbr.update.onStatus(setUpdateStatus)
    void window.dbr.update.check()
    return off
  }, [setUpdateStatus])

  return (
    <div className="relative h-full overflow-hidden text-text">
      <Background />
      <div className="relative z-10 flex h-full flex-col">
        <TitleBar />
        <main className="relative min-h-0 flex-1">
          {!ready ? (
            <Loading />
          ) : !account ? (
            <Login />
          ) : (
            <>
              {tab === 'home' && <Home />}
              {tab === 'news' && <News />}
              {tab === 'settings' && <Settings />}
            </>
          )}
        </main>
        {ready && account && <NavBar />}
      </div>
      <UpdateOverlay />
      <FuseBanner />
    </div>
  )
}

function Loading(): JSX.Element {
  return (
    <div className="grid h-full place-items-center">
      <p className="text-sm uppercase tracking-[0.3em] text-muted mc-text-sm">
        Cargando<span className="animate-blink">_</span>
      </p>
    </div>
  )
}
