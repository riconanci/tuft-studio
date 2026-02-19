/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tuft: {
          bg: '#0A0A0A',
          surface: '#141414',
          'surface-raised': '#1C1C1C',
          border: '#2A2A2A',
          'border-active': '#404040',
          text: '#E8E8E8',
          'text-muted': '#808080',
          'text-dim': '#505050',
          accent: '#D4FF00',
          'accent-muted': '#A3C700',
          danger: '#FF4444',
          warning: '#FFAA00',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Consolas', 'monospace'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
};
