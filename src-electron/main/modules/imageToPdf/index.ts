import { ipcMain, BrowserWindow } from 'electron'
import { convertImagesToPdf, cancelConversion } from './service'
import type { ImageToPdfOptions } from '../ipc/types'

export function registerImageToPdfHandlers(mainWindow: BrowserWindow) {
  // 图片转PDF
  ipcMain.handle('image:convertToPdf', async (event, options: ImageToPdfOptions) => {
    try {
      const result = await convertImagesToPdf(options, (progress) => {
        // 推送进度到渲染进程
      mainWindow.webContents.send('image:convertToPdf:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 取消转换
  ipcMain.handle('image:convertToPdf:cancel', async () => {
    cancelConversion()
    return { success: true }
  })
}
