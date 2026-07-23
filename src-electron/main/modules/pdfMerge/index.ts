import { ipcMain, BrowserWindow } from 'electron'
import { mergePdfs, mergePdfsFromImages, cancelMerge, type PdfPageImageData } from './service'
import type { PdfMergeOptions } from '../../ipc/types'

export function registerPdfMergeHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('pdf:merge', async (event, options: PdfMergeOptions) => {
    try {
      const result = await mergePdfs(options, (progress) => {
        mainWindow.webContents.send('pdf:merge:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('pdf:merge:fromImages', async (event, data: {
    pagesData: PdfPageImageData[][]
    outputPath: string
    fileNames: string[]
  }) => {
    try {
      const result = await mergePdfsFromImages(data.pagesData, data.outputPath, data.fileNames, (progress) => {
        mainWindow.webContents.send('pdf:merge:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('pdf:merge:cancel', async () => {
    cancelMerge()
    return { success: true }
  })
}
