/**
 * 渲染进程 electronAPI 类型声明
 * 必须与 preload/index.ts 中暴露的API保持一致
 */

interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      dialog: {
        openFiles: (options?: {
          filters?: { name: string; extensions: string[] }[]
          multiSelections?: boolean
        }) => Promise<{ canceled: boolean; filePaths: string[] }>
        openFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>
      }
      excelMerge: {
        listPresets: () => Promise<IpcResponse<any[]>>
        getPreset: (name: string) => Promise<IpcResponse<any>>
        savePreset: (config: any) => Promise<IpcResponse>
        deletePreset: (name: string) => Promise<IpcResponse>
        getColumns: (filePath: string) => Promise<IpcResponse<string[]>>
        merge: (params: any) => Promise<IpcResponse<any>>
        onProgress: (callback: (progress: any) => void) => () => void
        cancel: () => Promise<IpcResponse>
      }
      kingdeeImport: {
        listPresets: () => Promise<IpcResponse<any[]>>
        getPreset: (name: string) => Promise<IpcResponse<any>>
        savePreset: (config: any) => Promise<IpcResponse>
        deletePreset: (name: string) => Promise<IpcResponse>
        getTable1Columns: (filePath: string) => Promise<IpcResponse<string[]>>
        getTemplateColumns: (filePath: string, headerRowIndex: number) => Promise<IpcResponse<string[]>>
        generate: (params: { config: any }) => Promise<IpcResponse<any>>
        onProgress: (callback: (progress: any) => void) => () => void
        cancel: () => Promise<IpcResponse>
        step1: (params: {
          table1Path: string
          groupByColumn: string
          startBillNo: number
          outputDir: string
        }) => Promise<IpcResponse<any>>
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
        }) => Promise<IpcResponse<any>>
        step2b: (params: {
          inputDir: string
          outputDir: string
        }) => Promise<IpcResponse<any>>
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
        }) => Promise<IpcResponse<any>>
        step2d: (params: {
          inputDir: string
          table2Path: string
          templateHeaderRowIndex: number
          templateDataStartRowIndex: number
          outputDir: string
        }) => Promise<IpcResponse<any>>
        step3: (params: {
          table2Path: string
          filledTemplateFiles: { filePath: string }[]
          templateHeaderRowIndex: number
          templateDataStartRowIndex: number
          outputDir: string
          outputPrefix: string
          textFormatColumns: string[]
        }) => Promise<IpcResponse<any>>
      }
      app: {
        getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => Promise<string>
      }
      file: {
        listExcelFiles: (dirPath: string) => Promise<IpcResponse<{ path: string; name: string }[]>>
      }
      shell: {
        openPath: (path: string) => Promise<IpcResponse>
      }
      project: {
        list: () => Promise<IpcResponse<any[]>>
        get: (id: string) => Promise<IpcResponse<any>>
        save: (project: any) => Promise<IpcResponse>
        delete: (id: string) => Promise<IpcResponse>
        rename: (id: string, newName: string) => Promise<IpcResponse>
        updateStep1: (id: string, preset: any) => Promise<IpcResponse>
        updateStep2: (id: string, preset: any) => Promise<IpcResponse>
      }
    }
  }
}

export {}
