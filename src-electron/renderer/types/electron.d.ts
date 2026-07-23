/**
 * 渲染进程 electronAPI 类型声明
 * 必须与 preload/index.ts 中暴露的API保持一致
 */

interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// ─── PDF转图片 ───
interface PdfConvertOptions {
  filePaths: string[]
  outputDir: string
  format: 'png' | 'jpg'
  scale: number
  quality?: number
  pageRange?: string
}

interface PdfConvertProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  currentPage: number
  totalPages: number
  overallProgress: number
  status: 'pending' | 'converting' | 'completed' | 'error'
  message?: string
}

// ─── 图片转PDF ───
interface ImageToPdfOptions {
  filePaths: string[]
  outputPath: string
  pageSize: 'fit' | 'a4' | 'letter'
  orientation: 'portrait' | 'landscape'
  margin: number
  quality: number
}

interface ImageToPdfProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  overallProgress: number
  status: 'pending' | 'converting' | 'completed' | 'error'
  message?: string
}

// ─── PDF合并 ───
interface PdfMergeOptions {
  filePaths: string[]
  outputPath: string
}

interface PdfMergeProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  overallProgress: number
  status: 'pending' | 'merging' | 'completed' | 'error'
  message?: string
}

// ─── PDF拆分 ───
interface PdfSplitOptions {
  filePath: string
  outputDir: string
  mode: 'range' | 'eachPage' | 'everyN'
  pageRanges?: string
  pagesPerFile?: number
  filePrefix?: string
}

interface PdfSplitProgress {
  currentPart: number
  totalParts: number
  overallProgress: number
  status: 'pending' | 'splitting' | 'completed' | 'error'
  message?: string
}

interface PdfSplitResult {
  success: boolean
  outputFiles: string[]
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
      pdfConvert: {
        convert: (options: PdfConvertOptions) => Promise<IpcResponse<{ outputImages: string[] }>>
        onProgress: (callback: (progress: PdfConvertProgress) => void) => () => void
        cancel: () => Promise<IpcResponse>
      }
      imageToPdf: {
        convert: (options: ImageToPdfOptions) => Promise<IpcResponse<{ outputPath: string }>>
        onProgress: (callback: (progress: ImageToPdfProgress) => void) => () => void
        cancel: () => Promise<IpcResponse>
      }
      pdfMerge: {
        merge: (options: PdfMergeOptions) => Promise<IpcResponse<{ outputPath: string; totalPages: number }>>
        mergeFromImages: (data: {
          pagesData: { imageData: string; width: number; height: number }[][]
          outputPath: string
          fileNames: string[]
        }) => Promise<IpcResponse<{ outputPath: string; totalPages: number }>>
        onProgress: (callback: (progress: PdfMergeProgress) => void) => () => void
        cancel: () => Promise<IpcResponse>
      }
      pdfSplit: {
        split: (options: PdfSplitOptions) => Promise<IpcResponse<PdfSplitResult>>
        splitFromImages: (data: {
          pagesData: { imageData: string; width: number; height: number }[]
          options: PdfSplitOptions
        }) => Promise<IpcResponse<PdfSplitResult>>
        onProgress: (callback: (progress: PdfSplitProgress) => void) => () => void
        cancel: () => Promise<IpcResponse>
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
      }
      file: {
        readImage: (filePath: string) => Promise<IpcResponse<string>>
        getFileInfo: (filePath: string) => Promise<IpcResponse<{ size: number; name: string }>>
        scanPdfsInDir: (folderPath: string) => Promise<IpcResponse<{ files: { path: string; name: string; size: number }[] }>>
      }
      app: {
        getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => Promise<string>
      }
      shell: {
        openPath: (path: string) => Promise<IpcResponse>
      }
    }
  }
}

export {}
