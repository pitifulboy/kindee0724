import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      'node_cache/**',
      'build/**',
      'public/**',
      'extra-resources/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 项目存在大量 electron / exceljs 动态值，保留 any 以匹配现有风格
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 主进程多处 switch-case 内含 let/const，属既有风格，降为提示
      'no-case-declarations': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // 构建 / 打包脚本与配置文件：CommonJS + Node 全局变量
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
)
