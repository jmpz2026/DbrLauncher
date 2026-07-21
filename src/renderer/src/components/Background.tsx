import { useMemo } from 'react'

interface Spark {
  left: string
  duration: number
  delay: number
}

export default function Background(): JSX.Element {
  // Chispas de ki en formato pixel (cuadrados duros que suben a saltos)
  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        left: `${(i * 9.7 + 5) % 100}%`,
        duration: 6 + ((i * 3) % 6),
        delay: (i * 0.9) % 6
      })),
    []
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Textura de bloques deepslate, escalada y pixelada */}
      <div className="bg-blocks absolute inset-0" />
      {/* Oscurecido plano estilo menú de Minecraft (sin degradado suave) */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Chispas de ki pixeladas */}
      {sparks.map((s, i) => (
        <span
          key={i}
          className="ki-pixel animate-ki-rise"
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
