import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './core/windowManager'

// ============================================================================
// Polyfills — Node.js 22+ API 兼容（Electron 29 / Node.js 20.x）
// ============================================================================
// 背景：pdfjs-dist v4.10.38 在 Node.js 环境中使用了以下 Node.js 22+ API：
//   1. process.getBuiltinModule("fs" | "module" | "url")  — Node.js 22.9.0 引入
//   2. Promise.withResolvers()                             — Node.js 22.0.0 引入
//
// Electron 29 内置 Node.js 20.x，不支持上述 API，运行时抛出：
//   "process.getBuiltinModule is not a function"
//
// pdfjs-dist 是运行时通过 await import('pdfjs-dist') 动态加载的，
// ES module 的 import 语句虽然会被提升执行，但它们不涉及 pdfjs-dist，
// 因此 polyfill 只需放在 import 之后、其他代码之前即可保证在
// pdfjs-dist 加载前生效。
// ============================================================================

/**
 * Polyfill: process.getBuiltinModule (Node.js 22.9.0+)
 *
 * pdfjs-dist 通过 process.getBuiltinModule("fs"|"module"|"url") 获取
 * Node.js 内置模块。该 API 在 Node.js 22.9.0 才引入，Electron 29 的
 * Node.js 20.x 不支持。
 *
 * 主进程经 Vite 打包后输出为 CJS 格式，运行时 require 全局可用。
 * 使用 eval('require') 而非直接 require，可避免 TypeScript ESM 模式
 * 及 bundler 静态分析阶段的干扰，确保在运行时获取真实的 CJS require。
 */
if (typeof (process as any).getBuiltinModule !== 'function') {
  // eslint-disable-next-line no-eval
  const _require: NodeRequire = eval('require')
  ;(process as any).getBuiltinModule = (name: string): any => {
    return _require(name)
  }
}

/**
 * Polyfill: Promise.withResolvers (ES2024 / Node.js 22.0.0+)
 *
 * pdfjs-dist 在 PDFStream / ChunkedStream 等类中使用
 * Promise.withResolvers() 创建带 resolve / reject 控制器的 Promise。
 * 该 API 在 Node.js 22.0.0 才引入，Electron 29 的 Node.js 20.x 不支持。
 *
 * 此为 TC39 提案标准实现，返回 { promise, resolve, reject } 三元组。
 */
if (typeof (Promise as any).withResolvers !== 'function') {
  ;(Promise as any).withResolvers = function <T>(): {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: any) => void
  } {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

// ============================================================================
// End of Polyfills
// ============================================================================

let mainWindow: BrowserWindow | null = null

// 禁用硬件加速，提高兼容性（部分Windows环境GPU驱动不稳定）
app.disableHardwareAcceleration()

function initApp() {
  // 创建主窗口
  mainWindow = createMainWindow()

  // 注册IPC处理程序（传入窗口实例用于进度推送）
  registerIpcHandlers(mainWindow)

  // 开发环境加载Vite开发服务器，生产环境加载打包文件
  // vite-plugin-electron 会设置 VITE_DEV_SERVER_URL 环境变量
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

// 应用就绪
app.whenReady().then(() => {
  initApp()

  // macOS: 点击Dock图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initApp()
    }
  })
})

// Windows & Linux: 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 全局异常捕获 —— 防止单模块异常导致整个应用崩溃
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason)
})
