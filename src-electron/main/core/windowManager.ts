import { BrowserWindow, shell, ipcMain, nativeImage } from 'electron'
import path from 'path'

/**
 * 获取应用图标路径
 * 生产环境：从 extra-resources 目录读取（electron-builder 会在安装时复制到 resources/icons/）
 * 开发环境：从 build 目录读取
 */
function getAppIconPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), 'build/icon.ico')
  }
  return path.join(process.resourcesPath, 'icons', 'icon.ico')
}

/**
 * 创建主窗口
 * 安全配置：上下文隔离、Node权限关闭、Preload脚本注入
 */
export function createMainWindow(): BrowserWindow {
  let icon: Electron.NativeImage | undefined
  try {
    icon = nativeImage.createFromPath(getAppIconPath())
    if (icon.isEmpty()) icon = undefined
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
      color: '#000000',
      symbolColor: '#ffffff',
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

  // 窗口控制 IPC（titleBarOverlay 已提供原生标题按钮，这里作为备用）
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => {
    win.close()
  })

  // 窗口准备好后显示（避免白屏闪烁）
  win.once('ready-to-show', () => {
    win.show()
  })

  // 兜底：5 秒后强制显示窗口
  // 防止渲染进程异常导致 ready-to-show 永远不触发，窗口不可见，用户以为"没打开"
  setTimeout(() => {
    try {
      if (!win.isDestroyed() && !win.isVisible()) {
        console.log('[windowManager] 5秒兜底：强制显示窗口')
        win.show()
      }
    } catch {}
  }, 5000)

  // 外部链接在系统默认浏览器中打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}
