import { BrowserWindow, shell, nativeImage } from 'electron'
import path from 'path'

/** 仅允许交给系统浏览器打开的外部协议（禁止 file:// 与自定义协议） */
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function openExternalIfSafe(url: string): void {
  let protocol = ''
  try {
    protocol = new URL(url).protocol
  } catch {
    return
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
    console.warn(`[windowManager] 已拦截非安全协议的外链: ${url}`)
    return
  }
  shell.openExternal(url).catch(err => {
    console.warn(`[windowManager] 打开外链失败: ${err?.message || err}`)
  })
}

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

  // 窗口控制由 titleBarOverlay 原生按钮提供；不再注册 window:minimize/maximize/close IPC。

  // 窗口准备好后显示（避免白屏闪烁）
  win.once('ready-to-show', () => {
    win.show()
  })

  // 兜底：5 秒后强制显示窗口
  // 防止渲染进程异常导致 ready-to-show 永远不触发，窗口不可见，用户以为"没打开"
  const forceShowTimer = setTimeout(() => {
    try {
      if (!win.isDestroyed() && !win.isVisible()) {
        console.log('[windowManager] 5秒兜底：强制显示窗口')
        win.show()
      }
    } catch { /* ignore */ }
  }, 5000)

  // 窗口销毁时清理兜底定时器，避免对已销毁窗口操作
  win.once('closed', () => clearTimeout(forceShowTimer))

  // 外部链接：仅安全协议交给系统浏览器，其余一律拦截
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url)
    return { action: 'deny' }
  })

  // 阻止页面内跳转离开本地应用（外链仍走系统浏览器）
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      openExternalIfSafe(url)
    }
  })

  return win
}
