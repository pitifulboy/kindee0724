import { ipcMain, BrowserWindow } from 'electron'
import {
  getTable1Columns, getTemplateColumns,
  step1SplitOrders, step2aJoin, step2bDeleteUnmatched, step2cFillData, step2dRestoreStructure, step3MergeTemplates
} from './service'
import type { TemplateMatchPair } from './types'

// 说明：mainWindow 目前不再使用（旧的一键生成入口已废弃，进度改由前端分步轮询/日志呈现）。
// 保留形参以兼容 registerIpcHandlers 的统一调用签名。
export function registerKingdeeImportHandlers(_mainWindow: BrowserWindow) {
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

  ipcMain.handle('kingdee-import:step1', async (_event, params: {
    table1Path: string
    groupByColumn: string
    startBillNo: number
    billNoStep: number
    billNoBaseField: string
    outputDir: string
  }) => {
    try {
      const result = await step1SplitOrders(
        params.table1Path,
        params.groupByColumn,
        params.startBillNo,
        params.billNoStep,
        params.billNoBaseField,
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
    matchPairs: TemplateMatchPair[]
    startBillNo: number
    billNoStep: number
    billNoBaseField: string
    templateHeaderRowIndex: number
    templateDataStartRowIndex: number
    outputDir: string
  }) => {
    try {
      const result = await step2aJoin(
        params.table1Path,
        params.table2Path,
        params.groupByColumn,
        params.matchPairs,
        params.startBillNo,
        params.billNoStep,
        params.billNoBaseField,
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
    seqConfigs: any[]
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
        params.outputDir,
        params.seqConfigs
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
    transforms?: import('./transform').TransformRule[]
  }) => {
    try {
      const result = await step3MergeTemplates(
        params.table2Path,
        params.filledTemplateFiles,
        params.templateHeaderRowIndex,
        params.templateDataStartRowIndex,
        params.outputDir,
        params.outputPrefix,
        params.textFormatColumns,
        params.transforms ?? []
      )
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
