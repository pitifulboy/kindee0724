import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './core/windowManager'

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
