import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './core/windowManager'

let mainWindow: BrowserWindow | null = null

// ═══════════════════════════════════════════════════════════════
// 启动日志：记录到 userData/startup.log，便于诊断"无法打开"问题
// ═══════════════════════════════════════════════════════════════
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try {
    const logPath = path.join(app.getPath('userData'), 'startup.log')
    fs.appendFileSync(logPath, line + '\n')
  } catch {}
}

// 禁用硬件加速，提高兼容性
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

log('=== 应用启动 ===')
log(`Electron ${process.versions.electron}, Node ${process.versions.node}, ${process.platform} ${process.arch}`)

// ═══════════════════════════════════════════════════════════════
// 锁文件 & 缓存清理（仅异常崩溃后执行）
// ═══════════════════════════════════════════════════════════════
// 正常退出时写 clean-exit 标记文件，下次启动跳过清理，显著加快启动速度。
// 异常崩溃/强制结束后无此标记，才执行完整清理。
function getCleanExitFlagPath(): string {
  return path.join(app.getPath('userData'), '.clean-exit')
}

function cleanupLockFiles() {
  try {
    const userDataPath = app.getPath('userData')
    // 锁文件：每次都清理（体积小，速度影响可忽略）
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      const f = path.join(userDataPath, name)
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }

    // GPU 缓存 & Session Storage：仅异常崩溃后清理（正常退出跳过）
    const needFullCleanup = !fs.existsSync(getCleanExitFlagPath())
    if (needFullCleanup) {
      log('检测到异常退出（无 clean-exit 标记），执行完整缓存清理')
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
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// 启动：清理残留 → 单实例锁
// ═══════════════════════════════════════════════════════════════
// 关键：获取锁失败时不退出！
// requestSingleInstanceLock() 在某些环境下会误判（锁文件残留、
// 安全软件干扰），如果 app.exit(0) 会导致"无法打开"。
// 无论是否获取到锁，都让应用正常启动。
cleanupLockFiles()
log('锁文件清理完成')

const gotTheLock = app.requestSingleInstanceLock()
log(`单实例锁: ${gotTheLock}`)

if (gotTheLock) {
  app.on('second-instance', () => {
    log('second-instance: 聚焦已有窗口')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// 退出机制
// ═══════════════════════════════════════════════════════════════
let exiting = false
function exitApp(reason: string) {
  if (exiting) return
  exiting = true
  log(`exitApp(${reason})`)

  mainWindow = null

  // 1) 写 clean-exit 标记（下次启动跳过 GPU 缓存清理，加快启动）
  try { fs.writeFileSync(getCleanExitFlagPath(), Date.now().toString()) } catch {}

  // 2) 释放单实例锁（让 OS 立即知道锁已释放）
  try { app.releaseSingleInstanceLock() } catch {}

  // 3) 清理锁文件
  cleanupLockFiles()

  // 4) 强制退出
  log('app.exit(0)')
  app.exit(0)

  // 5) 兜底：1 秒后 process.exit(0)（防止 app.exit 卡住）
  setTimeout(() => {
    log('兜底 process.exit(0)')
    process.exit(0)
  }, 1000)
}

// ═══════════════════════════════════════════════════════════════
// 应用初始化
// ═══════════════════════════════════════════════════════════════
function initApp() {
  log('initApp: 创建窗口')
  try {
    mainWindow = createMainWindow()
    registerIpcHandlers(mainWindow)

    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
      mainWindow.webContents.openDevTools()
    } else {
      mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    // 窗口关闭 → 退出应用
    mainWindow.on('closed', () => exitApp('window-closed'))

    log('initApp: 窗口创建成功')
  } catch (e: any) {
    log(`initApp 失败: ${e?.message || e}`)
    // 窗口创建失败也要退出，否则进程残留
    exitApp('init-failed')
  }
}

app.whenReady().then(() => {
  log('app.whenReady')
  initApp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initApp()
    }
  })
}).catch((e: any) => {
  log(`app.whenReady 异常: ${e?.message || e}`)
})

// Windows & Linux: 所有窗口关闭时退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    exitApp('window-all-closed')
  }
})

// 全局异常捕获
process.on('uncaughtException', (error) => {
  log(`未捕获异常: ${error?.message}`)
})

process.on('unhandledRejection', (reason) => {
  log(`未处理Promise拒绝: ${reason}`)
})

app.on('render-process-gone', (_event, details) => {
  log(`渲染进程异常: ${JSON.stringify(details)}`)
})
