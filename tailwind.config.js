/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        monopoly: {
          brown: '#8B4513',
          lightblue: '#87CEEB',
          pink: '#DA70D6',
          orange: '#FFA500',
          red: '#FF0000',
          yellow: '#FFD700',
          green: '#008000',
          blue: '#0000FF',
          board: '#CDE6D0',
          boardDark: '#0f172a',
        }
      },
      animation: {
        'bounce-short': 'bounce 0.5s ease-in-out 2',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
