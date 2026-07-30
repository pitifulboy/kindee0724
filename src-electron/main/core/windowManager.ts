import { BrowserWindow, shell, ipcMain, nativeImage } from 'electron'
import path from 'path'

/**
 * 获取应用图标路径
 * 生产环境：从 extra-resources 目录读取（electron-builder 会在安装时复制到 resources/icons/）
 * 开发环境：从 build 目录读取
 */
function getAppIconPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发环境：从 build 目录读取
    return path.join(process.cwd(), 'build/icon.ico')
  }
  // 生产环境：从 resources/icons/ 读取（electron-builder extraResources 配置）
  return path.join(process.resourcesPath, 'icons', 'icon.ico')
}

/**
 * 创建主窗口
 * 安全配置：上下文隔离开启、Node权限关闭、Preload脚本注入
 */
export function createMainWindow(): BrowserWindow {
  // 显式设置图标，确保桌面快捷方式图标、任务栏图标、窗口图标一致
  // 不依赖 Windows 从 exe 资源自动解析图标（某些 Windows 版本/缓存策略下不可靠）
  let icon: Electron.NativeImage | undefined
  try {
    icon = nativeImage.createFromPath(getAppIconPath())
    if (icon.isEmpty()) {
      // icon.ico 文件不存在或为空 → 回退到不设 icon（让 Electron 用 exe 内嵌图标）
      icon = undefined
    }
  } catch {
    icon = undefined
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '',
    icon,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e3a8a',
      symbolColor: '#bfdbfe',
      height: 40
    },
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#f8fafc'
  })

  // 窗口控制 IPC
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => {
    // 触发窗口关闭 → window-all-closed → safeQuit() 优雅退出
    win.close()
  })

  // 窗口关闭事件的退出保护：渲染进程阻止关闭时强制销毁窗口
  // 销毁窗口后会触发 window-all-closed → safeQuit() 退出进程
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  win.on('close', () => {
    if (closeTimer) return
    closeTimer = setTimeout(() => {
      try {
        if (!win.isDestroyed()) win.destroy()
      } catch { /* 忽略异常 */ }
    }, 5000)
  })

  // 窗口准备好后显示（避免白屏闪烁）
  win.once('ready-to-show', () => {
    win.show()
  })

  // 外部链接在系统默认浏览器中打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}
