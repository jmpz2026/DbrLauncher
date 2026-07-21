/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base piedra / deepslate (Minecraft neutro)
        bg: '#191614',
        stone: '#2b2b2b',
        stone2: '#3a3a3a',
        'stone-light': '#565656',
        'stone-dark': '#1a1a1a',
        line: '#000000',
        muted: '#9b968c',
        text: '#e8e2d4',
        // Acento oro (identidad Dbr / Ki) — plano, sin degradado
        accent: '#ffcf4a',
        gold: '#ffcf4a',
        'gold-deep': '#e0951b',
        'gold-light': '#ffe9a8',
        // Verde "grass" para estados online
        grass: '#5fa838'
      },
      fontFamily: {
        pixel: ['"Pixelify Sans"', 'monospace'],
        display: ['"Pixelify Sans"', 'monospace'],
        sans: ['"Pixelify Sans"', 'monospace']
      },
      keyframes: {
        // Splash pulsante estilo pantalla de título de Minecraft
        splashPulse: {
          '0%, 100%': { transform: 'rotate(-18deg) scale(1)' },
          '50%': { transform: 'rotate(-18deg) scale(1.08)' }
        },
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
        'splash-pulse': 'splashPulse 0.9s ease-in-out infinite',
        blink: 'blink 1s steps(1) infinite',
        'ki-rise': 'kiRise 7s steps(20) infinite'
      }
    }
  },
  plugins: []
}
