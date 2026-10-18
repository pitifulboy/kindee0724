/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src-electron/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色统一为蓝色系（原 50~600 为青色、700/800 为蓝色，色相在 600→700 处断裂）。
        // 各阶映射到 CSS 变量（默认值见 index.css :root），个人设置的配色方案运行时覆盖。
        primary: {
          50: 'var(--ui-primary-soft)',
          100: 'var(--ui-primary-soft)',
          200: 'var(--ui-primary-border)',
          300: 'var(--ui-primary-300)',
          400: 'var(--ui-primary-400)',
          500: 'var(--ui-primary-500)',
          600: 'var(--ui-primary-600)',
          700: 'var(--ui-primary-hover)',
          800: 'var(--ui-primary)',
          900: 'var(--ui-primary-900)',
        },
        // 语义色（成功 / 警示 / 错误），供状态面板与 Toast 使用
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          700: '#15803d',
          800: '#166534',
        },
      }
    },
  },
  plugins: [],
}
