/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#eaefff',
          100: '#d4dffe',
          500: '#2355f5',
          600: '#1c47d4',
          700: '#163aae',
          blue:        '#2355f5',
          'blue-light':'#eaefff',
          green:       '#0ea854',
          'green-light':'#e6f7ee',
          orange:      '#e8610a',
          'orange-light':'#fdeede',
          red:         '#e02020',
          'red-light': '#fde8e8',
          purple:      '#7132e8',
          'purple-light':'#f0e8ff',
          amber:       '#c97c08',
          'amber-light':'#fcf2dc',
          teal:        '#0b9384',
          'teal-light':'#e0f5f2',
        },
        bg:        '#f2f4f8',
        card:      '#ffffff',
        surface:   '#f7f8fb',
        border:    '#e4e7f0',
        text: {
          DEFAULT:   '#141626',
          secondary: '#505575',
          muted:     '#9399b8',
        },
      },
    },
  },
  plugins: [],
}
