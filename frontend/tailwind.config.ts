import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: { DEFAULT: '#1E2A5A', soft: '#2E3C7A' },
        saffron: { DEFAULT: '#F2A900', deep: '#B97F00' },
        mist: '#EEF1F8',
        slate2: '#232846',
        line: '#D9DEEC',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        body: ['"DM Sans Variable"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
