import { useMemo } from 'react'

interface Spark {
  left: string
  duration: number
  delay: number
}

export default function Background(): JSX.Element {
  // Pocas chispas de ki, tenues (minimalista, sin ruido de fondo)
  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        left: `${(i * 15 + 8) % 100}%`,
        duration: 8 + ((i * 3) % 6),
        delay: (i * 1.4) % 7
      })),
    []
  )

  return (
    <div className="bg-bg pointer-events-none absolute inset-0 overflow-hidden">
      {/* Viñeteado sutil para dar profundidad, sin textura ruidosa */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(115% 85% at 50% 32%, transparent 58%, rgba(0,0,0,0.5) 100%)'
        }}
      />

      {/* Chispas de ki pixeladas */}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="ki-pixel animate-ki-rise opacity-70"
          style={{
            left: s.left,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}
    </div>
  )
}
