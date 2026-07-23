import { ipcMain, BrowserWindow } from 'electron'
import * as pdfConvertService from './service'
import type { PdfConvertOptions, PdfConvertProgress } from '../ipc/types'

// 注册PDF转换相关IPC处理程序
export function registerPdfConvertHandlers() {
  // 开始转换任务
  ipcMain.handle('pdf:convert', async (event, options: PdfConvertOptions) => {
    try {
      const result = await pdfConvertService.convertPdfToImages(options, (progress) => {
        // 发送进度更新到渲染进程
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) {
          win.webContents.send('pdf:convert:progress', progress)
        }
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // 取消转换任务
  ipcMain.handle('pdf:convert:cancel', () => {
    pdfConvertService.cancelConversion()
    return { success: true }
  })
}