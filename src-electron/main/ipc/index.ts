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

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
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
      await projectManager.saveProject(project)
      return { success: true }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:delete', async (_event, id: string) => {
    try {
      const deleted = await projectManager.deleteProject(id)
      return { success: deleted, error: deleted ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:rename', async (_event, id: string, newName: string) => {
    try {
      const renamed = await projectManager.renameProject(id, newName)
      return { success: renamed, error: renamed ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:updateStep1', async (_event, id: string, preset: projectManager.Step1Preset) => {
    try {
      const ok = await projectManager.updateStep1Preset(id, preset)
      return { success: ok, error: ok ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:updateStep2', async (_event, id: string, preset: projectManager.Step2Preset) => {
    try {
      const ok = await projectManager.updateStep2Preset(id, preset)
      return { success: ok, error: ok ? undefined : `项目不存在` }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // ─── 项目导入 / 导出 ───
  ipcMain.handle('project:export', async () => {
    try {
      const data = projectManager.exportProjects()
      if (Object.keys(data).length === 0) {
        return { success: false, error: '暂无项目可导出' }
      }
      // 直接写入 temp（始终可写），返回路径给前端
      const fileName = `项目预设_${new Date().toISOString().slice(0, 10)}.json`
      const tmpPath = path.join(app.getPath('temp'), 'electron-office-projects', fileName)
      const tmpDir = path.dirname(tmpPath)
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true, data: { count: Object.keys(data).length, filePath: tmpPath } }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入项目预设',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false, error: '用户取消' }
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      const projects = JSON.parse(content)
      const count = await projectManager.importProjects(projects)
      return { success: true, data: { count } }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('project:importFromFile', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      const projects = JSON.parse(content)
      const count = await projectManager.importProjects(projects)
      return { success: true, data: { count } }
    } catch (error: any) { return { success: false, error: error.message } }
  })
}
