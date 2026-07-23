import { contextBridge, ipcRenderer } from 'electron'
import type {
  PdfConvertOptions,
  PdfConvertProgress,
  ImageToPdfOptions,
  ImageToPdfProgress,
  PdfMergeOptions,
  PdfMergeProgress,
  PdfSplitOptions,
  PdfSplitProgress,
  PdfSplitResult,
  IpcResponse
} from '../main/ipc/types'

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

  // ─── PDF转图片 ───
  pdfConvert: {
    convert: (options: PdfConvertOptions): Promise<IpcResponse<{ outputImages: string[] }>> => {
      return ipcRenderer.invoke('pdf:convert', options)
    },

    onProgress: (callback: (progress: PdfConvertProgress) => void): (() => void) => {
      const handler = (_event: unknown, progress: PdfConvertProgress) => callback(progress)
      ipcRenderer.on('pdf:convert:progress', handler)
      return () => {
        ipcRenderer.removeListener('pdf:convert:progress', handler)
      }
    },

    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('pdf:convert:cancel')
    }
  },

  // ─── 图片转PDF ───
  imageToPdf: {
    convert: (options: ImageToPdfOptions): Promise<IpcResponse<{ outputPath: string }>> => {
      return ipcRenderer.invoke('image:convertToPdf', options)
    },

    onProgress: (callback: (progress: ImageToPdfProgress) => void): (() => void) => {
      const handler = (_event: unknown, progress: ImageToPdfProgress) => callback(progress)
      ipcRenderer.on('image:convertToPdf:progress', handler)
      return () => {
        ipcRenderer.removeListener('image:convertToPdf:progress', handler)
      }
    },

    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('image:convertToPdf:cancel')
    }
  },

  // ─── PDF合并 ───
  pdfMerge: {
    merge: (options: PdfMergeOptions): Promise<IpcResponse<{ outputPath: string; totalPages: number }>> => {
      return ipcRenderer.invoke('pdf:merge', options)
    },

    mergeFromImages: (data: {
      pagesData: { imageData: string; width: number; height: number }[][]
      outputPath: string
      fileNames: string[]
    }): Promise<IpcResponse<{ outputPath: string; totalPages: number }>> => {
      return ipcRenderer.invoke('pdf:merge:fromImages', data)
    },

    onProgress: (callback: (progress: PdfMergeProgress) => void): (() => void) => {
      const handler = (_event: unknown, progress: PdfMergeProgress) => callback(progress)
      ipcRenderer.on('pdf:merge:progress', handler)
      return () => {
        ipcRenderer.removeListener('pdf:merge:progress', handler)
      }
    },

    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('pdf:merge:cancel')
    }
  },

  // ─── PDF拆分 ───
  pdfSplit: {
    split: (options: PdfSplitOptions): Promise<IpcResponse<PdfSplitResult>> => {
      return ipcRenderer.invoke('pdf:split', options)
    },

    splitFromImages: (data: {
      pagesData: { imageData: string; width: number; height: number }[]
      options: PdfSplitOptions
    }): Promise<IpcResponse<PdfSplitResult>> => {
      return ipcRenderer.invoke('pdf:split:fromImages', data)
    },

    onProgress: (callback: (progress: PdfSplitProgress) => void): (() => void) => {
      const handler = (_event: unknown, progress: PdfSplitProgress) => callback(progress)
      ipcRenderer.on('pdf:split:progress', handler)
      return () => {
        ipcRenderer.removeListener('pdf:split:progress', handler)
      }
    },

    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('pdf:split:cancel')
    }
  },

  // ─── Excel批量合并 ───
  excelMerge: {
    // 预设管理
    listPresets: (): Promise<IpcResponse<any[]>> => {
      return ipcRenderer.invoke('excel-merge:listPresets')
    },

    getPreset: (name: string): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('excel-merge:getPreset', name)
    },

    savePreset: (config: any): Promise<IpcResponse> => {
      return ipcRenderer.invoke('excel-merge:savePreset', config)
    },

    deletePreset: (name: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('excel-merge:deletePreset', name)
    },

    // 字段发现
    getColumns: (filePath: string): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('excel-merge:getColumns', filePath)
    },

    // 合并执行
    merge: (params: any): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('excel-merge:merge', params)
    },

    onProgress: (callback: (progress: any) => void): (() => void) => {
      const handler = (_event: unknown, progress: any) => callback(progress)
      ipcRenderer.on('excel-merge:progress', handler)
      return () => {
        ipcRenderer.removeListener('excel-merge:progress', handler)
      }
    },

    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('excel-merge:cancel')
    }
  },

  // ─── 金蝶导入 ───
  kingdeeImport: {
    listPresets: (): Promise<IpcResponse<any[]>> => {
      return ipcRenderer.invoke('kingdee-import:listPresets')
    },
    getPreset: (name: string): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:getPreset', name)
    },
    savePreset: (config: any): Promise<IpcResponse> => {
      return ipcRenderer.invoke('kingdee-import:savePreset', config)
    },
    deletePreset: (name: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('kingdee-import:deletePreset', name)
    },
    getTable1Columns: (filePath: string): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('kingdee-import:getTable1Columns', filePath)
    },
    getTemplateColumns: (filePath: string, headerRowIndex: number): Promise<IpcResponse<string[]>> => {
      return ipcRenderer.invoke('kingdee-import:getTemplateColumns', filePath, headerRowIndex)
    },
    generate: (params: { config: any }): Promise<IpcResponse<any>> => {
      return ipcRenderer.invoke('kingdee-import:generate', params)
    },
    onProgress: (callback: (progress: any) => void): (() => void) => {
      const handler = (_event: unknown, progress: any) => callback(progress)
      ipcRenderer.on('kingdee-import:progress', handler)
      return () => { ipcRenderer.removeListener('kingdee-import:progress', handler) }
    },
    cancel: (): Promise<IpcResponse> => {
      return ipcRenderer.invoke('kingdee-import:cancel')
    },
    step1: (params: {
      table1Path: string
      groupByColumn: string
      startBillNo: number
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

  // ─── 文件操作 ───
  file: {
    readImage: (filePath: string): Promise<IpcResponse<string>> => {
      return ipcRenderer.invoke('file:readImage', filePath)
    },

    getFileInfo: (filePath: string): Promise<IpcResponse<{ size: number; name: string }>> => {
      return ipcRenderer.invoke('file:getFileInfo', filePath)
    },

    scanPdfsInDir: (folderPath: string): Promise<IpcResponse<{ files: { path: string; name: string; size: number }[] }>> => {
      return ipcRenderer.invoke('file:scanPdfsInDir', folderPath)
    }
  },

  // ─── 应用信息 ───
  app: {
    getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents'): Promise<string> => {
      return ipcRenderer.invoke('app:getPath', name)
    }
  },

  // ─── Shell ───
  shell: {
    openPath: (path: string): Promise<IpcResponse> => {
      return ipcRenderer.invoke('shell:openPath', path)
    }
  }
}

// 通过contextBridge暴露API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript类型声明
export type ElectronAPI = typeof electronAPI
