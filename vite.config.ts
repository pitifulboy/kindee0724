import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// 版本号单一来源：直接读取 package.json，构建期注入 __APP_VERSION__，
// 界面显示版本由该常量派生，避免 package.json 与 appText.ts 双源不同步。
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    electron([
      {
        // 主进程入口（使用绝对路径）
        entry: path.resolve(__dirname, 'src-electron/main/index.ts'),
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        // Preload脚本入口（使用绝对路径）
        entry: path.resolve(__dirname, 'src-electron/preload/index.ts'),
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/preload')
          }
        }
      }
    ]),
    renderer()
  ],
  base: './',
  root: 'src-electron/renderer',
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src-electron/renderer')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 5173
  }
})