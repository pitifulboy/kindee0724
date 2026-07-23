import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
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
              external: ['electron', 'pdfjs-dist', '@napi-rs/canvas', 'pdf-lib']
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