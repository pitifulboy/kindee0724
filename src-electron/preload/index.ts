import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '../main/ipc/types'

/**
 * 暴露给渲染进程的安全API
 *
 * 安全原则：
 * - 仅暴露必要的API，不暴露 ipcRenderer 原始对象
 * - 所有API通过 contextBridge 隔离，渲染进程无法直接访问Node.js
 * - 参数和返回值都有类型约束
 */
const electronAPI = {
  // ─── 对话框 ───
  dialog: {
    openFiles: (options?: {
      filters?: { name: string; extensions: string[] }[]
      multiSelections?: boolean
    }): Promise<{ canceled: boolean; filePaths: string[] }> => {
      return ipcRenderer.invoke('dialog:openFiles', options || {})
    },

    openFolder: (): Promise<{ canceled: boolean; filePaths: string[] }> => {
      return ipcRenderer.invoke('dialog:openFolder')
    }
  },

  // ─── Excel批量合并 ───
  excelMerge: {
    // 字段发现
    getColumns: (filePath: string): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('excel-merge:getColumns', filePath)
    },

    // 工作表名 + 首行列名（合并前一致性检测用）
    getFileInfo: (filePath: string): Promise<IpcResponse<{ sheetNames: string[]; headerColumns: string[] }>> => {
      return ipcRenderer.invoke('excel-merge:getFileInfo', filePath)
    },

    // 合并执行
    merge: (params: any): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('excel-merge:merge', params)
    },

    // 第 2 步独立执行：合并辅助表
    joinAux: (params: any): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('excel-merge:joinAux', params)
    },

    onProgress: (callback: (progress: any) => void): (() => void) => {
      const handler = (_event: unknown, progress: any) => callback(progress)
      ipcRenderer.on('excel-merge:progress', handler)
      return () => {
        ipcRenderer.removeListener('excel-merge:progress', handler)
      }
    }
  },

  // ─── 金蝶导入 ───
  kingdeeImport: {
    getTable1Columns: (filePath: string): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('kingdee-import:getTable1Columns', filePath)
    },
    getTemplateColumns: (filePath: string, headerRowIndex: number): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('kingdee-import:getTemplateColumns', filePath, headerRowIndex)
    },
    step1: (params: {
      table1Path: string
      groupByColumn: string
      startBillNo: number
      billNoStep: number
      billNoBaseField: string
      outputDir: string
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step1', params)
    },
    step2a: (params: {
      table1Path: string
      table2Path: string
      groupByColumn: string
      matchFieldTable1: string
      matchFieldTable2: string
      startBillNo: number
      billNoStep: number
      billNoBaseField: string
      templateHeaderRowIndex: number
      templateDataStartRowIndex: number
      outputDir: string
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step2a', params)
    },
    step2b: (params: {
      inputDir: string
      outputDir: string
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step2b', params)
    },
    step2c: (params: {
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
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step2c', params)
    },
    step2d: (params: {
      inputDir: string
      table2Path: string
      templateHeaderRowIndex: number
      templateDataStartRowIndex: number
      outputDir: string
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step2d', params)
    },
    step3: (params: {
      table2Path: string
      filledTemplateFiles: { filePath: string }[]
      templateHeaderRowIndex: number
      templateDataStartRowIndex: number
      outputDir: string
      outputPrefix: string
      textFormatColumns: string[]
    }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:step3', params)
    }
  },

  // ─── 应用信息 ───
  app: {
    getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents'): Promise<string> => {
      return ipcRenderer.invoke('app:getPath', name)
    }
  },

  // ─── 文件工具 ───
  file: {
    listExcelFiles: (dirPath: string): Promise<IpcResponse<{ path: string; name: string }[]>> => {
      return ipcRenderer.invoke('file:listExcelFiles', dirPath)
    }
  },

  // ─── Shell ───
  shell: {
    openPath: (path: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('shell:openPath', path)
    },
    showItemInFolder: (path: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('shell:showItemInFolder', path)
    }
  },

  // ─── 项目管理 ───
  project: {
    list: (): Promise<IpcResponse<any[]>> => {
      return ipcRenderer.invoke('project:list')
    },
    get: (id: string): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('project:get', id)
    },
    save: (project: any): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:save', project)
    },
    delete: (id: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:delete', id)
    },
    rename: (id: string, newName: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:rename', id, newName)
    },
    updateStep1: (id: string, preset: any): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:updateStep1', id, preset)
    },
    updateStep2: (id: string, preset: any): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:updateStep2', id, preset)
    },
    export: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:export')
    },
    import: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:import')
    },
    importFromFile: (filePath: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('project:importFromFile', filePath)
    }
  }
}

// 通过contextBridge暴露API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript类型声明
export type ElectronAPI = typeof electronAPI
