import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron'
import { registerPdfConvertHandlers } from '../modules/pdfConvert'
import { registerImageToPdfHandlers } from '../modules/imageToPdf'
import { registerPdfMergeHandlers } from '../modules/pdfMerge'
import { registerPdfSplitHandlers } from '../modules/pdfSplit'
import { registerExcelMergeHandlers } from '../modules/excelMerge'
import { registerKingdeeImportHandlers } from '../modules/kingdeeImport'

/**
 * 注册所有IPC处理程序
 * @param mainWindow 主窗口实例（用于向渲染进程推送进度等）
 */
export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // 注册各业务模块的IPC处理程序
  registerPdfConvertHandlers()
  registerImageToPdfHandlers(mainWindow)
  registerPdfMergeHandlers(mainWindow)
  registerPdfSplitHandlers(mainWindow)
  registerExcelMergeHandlers(mainWindow)
  registerKingdeeImportHandlers(mainWindow)

  // ─── 通用IPC接口 ───

  // 选择文件
  ipcMain.handle('dialog:openFiles', async (_event, options: {
    filters?: { name: string; extensions: string[] }[]
    multiSelections?: boolean
  }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: options?.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options?.filters
    })
    return result
  })

  // 选择文件夹
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result
  })

  // 获取系统路径
  ipcMain.handle('app:getPath', (_event, name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => {
    return app.getPath(name)
  })

  // 在资源管理器中打开文件夹
  ipcMain.handle('shell:openPath', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
    return { success: true }
  })

  // 读取图片文件（用于前端预览，返回base64）
  ipcMain.handle('file:readImage', async (_event, filePath: string) => {
    try {
      const fs = require('fs')
      const buffer = fs.readFileSync(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase()
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
      return {
        success: true,
        data: `data:${mimeType};base64,${buffer.toString('base64')}`
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取文件信息
  ipcMain.handle('file:getFileInfo', async (_event, filePath: string) => {
    try {
      const fs = require('fs')
      const path = require('path')
      const stat = fs.statSync(filePath)
      return {
        success: true,
        data: {
          size: stat.size,
          name: path.basename(filePath)
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 递归扫描文件夹中的所有PDF文件
  ipcMain.handle('file:scanPdfsInDir', async (_event, folderPath: string) => {
    try {
      const fs = require('fs')
      const path = require('path')

      // 校验路径是否为目录
      const rootStat = fs.statSync(folderPath)
      if (!rootStat.isDirectory()) {
        return { success: true, data: { files: [] } }
      }

      const results: { path: string; name: string; size: number }[] = []

      // 递归遍历目录（防符号链接循环 + 深度限制）
      const scanDir = (dir: string, depth: number = 0, visited: Set<string> = new Set()) => {
        if (depth > 20) return  // 递归深度限制
        const realPath = fs.realpathSync(dir)
        if (visited.has(realPath)) return  // 防循环
        visited.add(realPath)

        let entries: string[]
        try {
          entries = fs.readdirSync(dir)
        } catch {
          return  // 跳过不可访问的目录
        }
        for (const entry of entries) {
          const fullPath = path.join(dir, entry)
          let stat
          try {
            stat = fs.lstatSync(fullPath)
          } catch {
            continue  // 跳过无法访问的项
          }
          if (stat.isSymbolicLink()) {
            continue  // 跳过符号链接，防止循环
          }
          if (stat.isDirectory()) {
            scanDir(fullPath, depth + 1, visited)
          } else if (entry.toLowerCase().endsWith('.pdf')) {
            results.push({
              path: fullPath,
              name: entry,
              size: stat.size
            })
          }
        }
      }

      scanDir(folderPath)

      // 按文件名排序
      results.sort((a, b) => a.name.localeCompare(b.name))

      return {
        success: true,
        data: { files: results }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
