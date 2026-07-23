import { ipcMain, BrowserWindow } from 'electron'
import {
  generateImportFile, getTable1Columns, getTemplateColumns, cancelGenerate,
  step1SplitOrders, step2aJoin, step2bDeleteUnmatched, step2cFillData, step2dRestoreStructure, step3MergeTemplates
} from './service'
import { listPresets, getPreset, savePreset, deletePreset } from './presetManager'

export function registerKingdeeImportHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('kingdee-import:listPresets', async () => {
    try {
      return { success: true, data: listPresets() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:getPreset', async (_event, name: string) => {
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

  ipcMain.handle('kingdee-import:savePreset', async (_event, config: any) => {
    try {
      savePreset(config)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:deletePreset', async (_event, name: string) => {
    try {
      const deleted = deletePreset(name)
      return { success: deleted, error: deleted ? undefined : `预设 "${name}" 不存在` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:getTable1Columns', async (_event, filePath: string) => {
    try {
      const columns = await getTable1Columns(filePath)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:getTemplateColumns', async (_event, filePath: string, headerRowIndex: number) => {
    try {
      const columns = await getTemplateColumns(filePath, headerRowIndex)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:generate', async (_event, params: { config: any }) => {
    try {
      const result = await generateImportFile(params.config, (progress) => {
        mainWindow.webContents.send('kingdee-import:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:cancel', async () => {
    cancelGenerate()
    return { success: true }
  })

  ipcMain.handle('kingdee-import:step1', async (_event, params: {
    table1Path: string
    groupByColumn: string
    startBillNo: number
    outputDir: string
  }) => {
    try {
      const result = await step1SplitOrders(
        params.table1Path,
        params.groupByColumn,
        params.startBillNo,
        params.outputDir
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:step2a', async (_event, params: {
    table1Path: string
    table2Path: string
    groupByColumn: string
    matchFieldTable1: string
    matchFieldTable2: string
    startBillNo: number
    templateHeaderRowIndex: number
    templateDataStartRowIndex: number
    outputDir: string
  }) => {
    try {
      const result = await step2aJoin(
        params.table1Path,
        params.table2Path,
        params.groupByColumn,
        params.matchFieldTable1,
        params.matchFieldTable2,
        params.startBillNo,
        params.templateHeaderRowIndex,
        params.templateDataStartRowIndex,
        params.outputDir
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:step2b', async (_event, params: {
    inputDir: string
    outputDir: string
  }) => {
    try {
      const result = await step2bDeleteUnmatched(params.inputDir, params.outputDir)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:step2c', async (_event, params: {
    inputDir: string
    fieldMappings: any[]
    date: string
    matchFieldTable1: string
    matchFieldTable2: string
    templateHeaderRowIndex: number
    templateDataStartRowIndex: number
    table2Path: string
    outputDir: string
  }) => {
    try {
      const result = await step2cFillData(
        params.inputDir,
        params.fieldMappings,
        params.date,
        params.matchFieldTable1,
        params.matchFieldTable2,
        params.templateHeaderRowIndex,
        params.templateDataStartRowIndex,
        params.table2Path,
        params.outputDir
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:step2d', async (_event, params: {
    inputDir: string
    table2Path: string
    templateHeaderRowIndex: number
    templateDataStartRowIndex: number
    outputDir: string
  }) => {
    try {
      const result = await step2dRestoreStructure(
        params.inputDir,
        params.table2Path,
        params.templateHeaderRowIndex,
        params.templateDataStartRowIndex,
        params.outputDir
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:step3', async (_event, params: {
    table2Path: string
    filledTemplateFiles: { filePath: string }[]
    templateHeaderRowIndex: number
    templateDataStartRowIndex: number
    outputDir: string
    outputPrefix: string
    textFormatColumns: string[]
  }) => {
    try {
      const result = await step3MergeTemplates(
        params.table2Path,
        params.filledTemplateFiles,
        params.templateHeaderRowIndex,
        params.templateDataStartRowIndex,
        params.outputDir,
        params.outputPrefix,
        params.textFormatColumns
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
