/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base piedra / deepslate (Minecraft neutro)
        bg: '#191614',
        stone: '#2b2b2b',
        muted: '#a8a296',
        text: '#e8e2d4',
        // Paleta Saga: naranja = acción principal, azul = seleccionado, oro ki = estados y valores
        saga: '#f26a1b',
        'saga-light': '#ff8a3d',
        azul: '#1f4fa8',
        'azul-light': '#4f7fd6',
        gold: '#ffcf4a',
        'gold-deep': '#e0951b',
        // Verde "grass" para estados online / al día
        grass: '#5fa838',
        // Único color de error
        error: '#f0625a'
      },
      fontFamily: {
        // Pixelify solo para títulos y el botón Jugar; el resto, una sans legible del sistema
        pixel: ['"Pixelify Sans"', 'monospace'],
        sans: ['"Segoe UI"', 'system-ui', '"Noto Sans"', 'Ubuntu', '"DejaVu Sans"', 'sans-serif']
      },
      keyframes: {
        // Barra indeterminada: un bloque que recorre el carril
        indeterminate: { '0%': { left: '-30%' }, '100%': { left: '100%' } },
        // Parpadeo de cursor / indicadores
        blink: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0.25' } },
        // Partícula de ki pixelada que asciende a saltos
        kiRise: {
          '0%': { transform: 'translateY(24px)', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateY(-320px)', opacity: '0' }
        }
      },
      animation: {
        indeterminate: 'indeterminate 1.4s steps(28) infinite',
        blink: 'blink 1s steps(1) infinite',
        'ki-rise': 'kiRise 7s steps(20) infinite'
      }
    }
  },
  plugins: []
}
