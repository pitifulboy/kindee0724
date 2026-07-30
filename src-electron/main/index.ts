import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './core/windowManager'

let mainWindow: BrowserWindow | null = null

// 禁用硬件加速，提高兼容性（部分Windows环境GPU驱动不稳定）
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

// ═══════════════════════════════════════════════════════════════
// 锁文件 & 缓存清理
// ═══════════════════════════════════════════════════════════════
function cleanupLockFiles() {
  try {
    const userDataPath = app.getPath('userData')
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      const f = path.join(userDataPath, name)
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
    for (const dir of ['GPUCache', 'DawnCache', 'ShaderCache']) {
      const d = path.join(userDataPath, dir)
      try { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }) } catch {}
    }
    const sessionDir = path.join(userDataPath, 'Session Storage')
    try {
      if (fs.existsSync(sessionDir)) {
        for (const entry of fs.readdirSync(sessionDir)) {
          try { fs.unlinkSync(path.join(sessionDir, entry)) } catch {}
        }
      }
    } catch {}
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// 启动：清理残留 → 单实例锁（不阻塞启动）
// ═══════════════════════════════════════════════════════════════
// 关键设计：获取锁失败时不退出应用！
// requestSingleInstanceLock() 在某些环境下会误判（锁文件残留、文件系统缓存、
// 安全软件干扰），如果此时 app.exit(0) 会导致应用"无法打开"。
// 正确做法：无论是否获取到锁，都让应用正常启动。
// 如果真的有另一个实例在运行，用户会看到两个窗口，但这比"无法打开"好得多。
cleanupLockFiles()

const gotTheLock = app.requestSingleInstanceLock()

if (gotTheLock) {
  // 成功获取锁 → 注册 second-instance 处理（聚焦已有窗口）
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
// 获取锁失败 → 不退出，继续启动
// 下次启动时 cleanupLockFiles() 会清理残留锁，最终能获取到锁

// ═══════════════════════════════════════════════════════════════
// 退出机制
// ═══════════════════════════════════════════════════════════════
let exiting = false
function safeQuit() {
  if (exiting) return
  exiting = true
  mainWindow = null
  // 1) 释放单实例锁
  try { app.releaseSingleInstanceLock() } catch {}
  // 2) 清理锁文件
  cleanupLockFiles()
  // 3) 强制退出
  app.exit(0)
}

// ═══════════════════════════════════════════════════════════════
// 应用初始化
// ═══════════════════════════════════════════════════════════════
function initApp() {
  mainWindow = createMainWindow()
  registerIpcHandlers(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initApp()
    }
  })
})

// Windows & Linux: 所有窗口关闭时退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    safeQuit()
  }
})

// 全局异常捕获
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason)
})
