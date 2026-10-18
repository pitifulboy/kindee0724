/**
 * Excel 合并模块 IPC handlers
 */
import { ipcMain, BrowserWindow } from 'electron'
import { mergeExcelData, joinAuxExcelData, getExcelColumns, getExcelFileInfo } from './service'
import type { MergeParams, JoinAuxParams } from './types'

export function registerExcelMergeHandlers(mainWindow: BrowserWindow) {
  // ─── 字段发现 ───

  // 读取 Excel 列名
  ipcMain.handle('excel-merge:getColumns', async (_event, filePath: string) => {
    try {
      const columns = await getExcelColumns(filePath)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 读取表格文件元信息（工作表名 + 首行列名），供第 1 步合并前检测使用
  ipcMain.handle('excel-merge:getFileInfo', async (_event, filePath: string) => {
    try {
      const info = await getExcelFileInfo(filePath)
      return { success: true, data: info }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ─── 合并执行 ───

  // 执行合并
  ipcMain.handle('excel-merge:merge', async (_event, params: MergeParams) => {
    try {
      const result = await mergeExcelData(params, (progress) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('excel-merge:progress', progress)
        }
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 第 2 步独立执行：在「合并原表」产物上合并辅助表
  ipcMain.handle('excel-merge:joinAux', async (_event, params: JoinAuxParams) => {
    try {
      const result = await joinAuxExcelData(params, (progress) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('excel-merge:progress', progress)
        }
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
