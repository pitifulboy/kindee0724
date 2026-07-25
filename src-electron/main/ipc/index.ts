import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { registerExcelMergeHandlers } from '../modules/excelMerge'
import { registerKingdeeImportHandlers } from '../modules/kingdeeImport'
import * as projectManager from '../modules/projectManager'

/**
 * 注册所有IPC处理程序
 * @param mainWindow 主窗口实例（用于向渲染进程推送进度等）
 */
export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // 注册各业务模块的IPC处理程序
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

  // 扫描目录中的Excel文件（支持拖拽文件夹）
  ipcMain.handle('file:listExcelFiles', async (_event, dirPath: string) => {
    try {
      const stat = fs.statSync(dirPath)
      if (stat.isDirectory()) {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
          .map(f => ({ path: path.join(dirPath, f), name: f }))
        return { success: true, data: files }
      } else if (stat.isFile() && (dirPath.endsWith('.xlsx') || dirPath.endsWith('.xls'))) {
        const name = path.basename(dirPath)
        return { success: true, data: [{ path: dirPath, name }] }
      }
      return { success: true, data: [] }
    } catch {
      return { success: false, error: '无法读取路径' }
    }
  })

  // ─── 项目管理 ───
  ipcMain.handle('project:list', async () => {
    try { return { success: true, data: projectManager.listProjects() } }
    catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:get', async (_event, id: string) => {
    try {
      const project = projectManager.getProject(id)
      if (!project) return { success: false, error: `项目 "${id}" 不存在` }
      return { success: true, data: project }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:save', async (_event, project: projectManager.ProjectItem) => {
    try {
      projectManager.saveProject(project)
      return { success: true }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:delete', async (_event, id: string) => {
    try {
      const deleted = projectManager.deleteProject(id)
      return { success: deleted, error: deleted ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:rename', async (_event, id: string, newName: string) => {
    try {
      const renamed = projectManager.renameProject(id, newName)
      return { success: renamed, error: renamed ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:updateStep1', async (_event, id: string, preset: projectManager.Step1Preset) => {
    try {
      const ok = projectManager.updateStep1Preset(id, preset)
      return { success: ok, error: ok ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:updateStep2', async (_event, id: string, preset: projectManager.Step2Preset) => {
    try {
      const ok = projectManager.updateStep2Preset(id, preset)
      return { success: ok, error: ok ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })
}
