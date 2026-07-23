import { BrowserWindow, shell } from 'electron'
import path from 'path'

/**
 * 创建主窗口
 * 安全配置：上下文隔离开启、Node权限关闭、Preload脚本注入
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '离线办公工具',
    icon: path.join(__dirname, '../../build/icon.ico'),
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
