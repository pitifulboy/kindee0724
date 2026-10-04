/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src-electron/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色取自参考图片中的青色 #60c7e0（primary-500）
        primary: {
          50: '#f0fafd',
          100: '#d9f2f9',
          200: '#b3e6f3',
          300: '#80d6ea',
          400: '#7dd0e6',
          500: '#60c7e0',
          600: '#3eaecb',
          700: '#2563eb',
          800: '#1d4ed8',
          900: '#0e4d62',
        }
      }
    },
  },
  plugins: [],
}