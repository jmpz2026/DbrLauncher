import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import pista from '../assets/musica.ogg'

// Música de fondo opcional (Ajustes, apagada por defecto). Pista propia generada en local con
// Stable Audio Open (tools/musica_prompts.json de DbrServerPack, "launcher_menu"). Se calla
// mientras el juego arranca o corre y cuando la ventana está minimizada.
export default function MusicaFondo(): null {
  const activa = useStore((s) => s.musicaActiva)
  const volumen = useStore((s) => s.musicaVolumen)
  const ocupado = useStore((s) => s.launching || s.gameRunning)
  const [visible, setVisible] = useState(!document.hidden)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const onVis = (): void => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const sonar = activa && visible && !ocupado

  useEffect(() => {
    if (!sonar) {
      audio.current?.pause()
      return
    }
    // El elemento se crea la primera vez que hace falta: con la música apagada no se carga nada.
    if (!audio.current) {
      audio.current = new Audio(pista)
      audio.current.loop = true
    }
    audio.current.play().catch(() => {
      /* sin dispositivo de audio: silencio */
    })
  }, [sonar])

  useEffect(() => {
    if (audio.current) audio.current.volume = volumen
  }, [volumen, sonar])

  useEffect(
    () => () => {
      audio.current?.pause()
      audio.current = null
    },
    []
  )

  return null
}
