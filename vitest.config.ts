import { defineConfig } from 'vitest/config'

// 单测放在顶层 tests/ 目录：不进入 tsconfig 的 typecheck 范围，
// 避免「未安装 vitest 时无法 typecheck」的耦合；运行 `npm test` 前需先 `npm install`。
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
