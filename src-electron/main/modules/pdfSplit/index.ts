import { ipcMain, BrowserWindow } from 'electron'
import { splitPdf, splitPdfFromImages, cancelSplit, type PdfPageImageData } from './service'
import type { PdfSplitOptions } from '../../ipc/types'

export function registerPdfSplitHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('pdf:split', async (event, options: PdfSplitOptions) => {
    try {
      const result = await splitPdf(options, (progress) => {
        mainWindow.webContents.send('pdf:split:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('pdf:split:fromImages', async (event, data: {
    pagesData: PdfPageImageData[]
    options: PdfSplitOptions
  }) => {
    try {
      const result = await splitPdfFromImages(data.pagesData, data.options, (progress) => {
        mainWindow.webContents.send('pdf:split:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('pdf:split:cancel', async () => {
    cancelSplit()
    return { success: true }
  })
}
