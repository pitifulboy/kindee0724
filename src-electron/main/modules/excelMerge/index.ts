/**
 * Excel 合并模块 IPC handlers
 */
import { ipcMain, BrowserWindow } from 'electron'
import { mergeExcelData, getExcelColumns, cancelMerge } from './service'
import { listPresets, getPreset, savePreset, deletePreset } from './presetManager'
import type { MergeParams } from './types'

export function registerExcelMergeHandlers(mainWindow: BrowserWindow) {
  // ─── 预设管理 ───

  // 列出所有预设
  ipcMain.handle('excel-merge:listPresets', async () => {
    try {
      return { success: true, data: listPresets() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取单个预设
  ipcMain.handle('excel-merge:getPreset', async (_event, name: string) => {
    try {
      const preset = getPreset(name)
      if (!preset) {
        return { success: false, error: `预设 "${name}" 不存在` }
      }
      return { success: true, data: preset }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 保存预设
  ipcMain.handle('excel-merge:savePreset', async (_event, config: any) => {
    try {
      savePreset(config)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 删除预设
  ipcMain.handle('excel-merge:deletePreset', async (_event, name: string) => {
    try {
      const deleted = deletePreset(name)
      return { success: deleted, error: deleted ? undefined : `预设 "${name}" 不存在` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

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

  // ─── 合并执行 ───

  // 执行合并
  ipcMain.handle('excel-merge:merge', async (_event, params: MergeParams) => {
    try {
      const result = await mergeExcelData(params, (progress) => {
        mainWindow.webContents.send('excel-merge:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 取消合并
  ipcMain.handle('excel-merge:cancel', async () => {
    cancelMerge()
    return { success: true }
  })
}
