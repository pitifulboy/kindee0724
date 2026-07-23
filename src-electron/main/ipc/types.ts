// IPC通信类型定义

// 通用响应类型
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// ─── PDF转图片 ───
export interface PdfConvertOptions {
  filePaths: string[]
  outputDir: string
  format: 'png' | 'jpg'
  scale: number
  quality?: number              // JPG质量 0.1~1.0，默认0.92
  pageRange?: string            // 页码范围，如 "1-3,5,7-9"，空表示全部
}

export interface PdfConvertProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  currentPage: number
  totalPages: number
  overallProgress: number
  status: 'pending' | 'converting' | 'completed' | 'error'
  message?: string
}

export interface PdfConvertResult {
  success: boolean
  outputImages: string[]
  error?: string
}

// ─── 图片转PDF ───
export interface ImageToPdfOptions {
  filePaths: string[]           // 图片文件路径列表（已排序）
  outputPath: string            // 输出PDF文件路径
  pageSize: 'fit' | 'a4' | 'letter'  // fit=适应图片尺寸, a4/letter=标准纸张
  orientation: 'portrait' | 'landscape'  // 页面方向（仅 a4/letter 有效）
  margin: number                // 页面边距（像素），0=无边距
  quality: number               // 图片压缩质量 0.1~1.0
}

export interface ImageToPdfProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  overallProgress: number
  status: 'pending' | 'converting' | 'completed' | 'error'
  message?: string
}

// ─── PDF合并 ───
export interface PdfMergeOptions {
  filePaths: string[]           // PDF文件路径列表（已排序）
  outputPath: string            // 输出PDF文件路径
}

export interface PdfMergeProgress {
  currentFile: string
  currentFileIndex: number
  totalFiles: number
  overallProgress: number
  status: 'pending' | 'merging' | 'completed' | 'error'
  message?: string
}

// ─── PDF渲染为图片（用于处理加密PDF）───
export interface PdfRenderOptions {
  filePath: string
  scale: number
}

export interface PdfRenderResult {
  success: boolean
  pageImages: string[]        // base64编码的图片数据
  pageSizes: { width: number; height: number }[]
  error?: string
}

// ─── PDF拆分 ───
export interface PdfSplitOptions {
  filePath: string              // 源PDF文件路径
  outputDir: string             // 输出目录
  mode: 'range' | 'eachPage' | 'everyN'  // 拆分模式：自定义范围/每页一个/每N页
  pageRanges?: string           // mode=range 时的页码范围，如 "1-3,4-6,7-9"
  pagesPerFile?: number         // mode=everyN 时的每文件页数
  filePrefix?: string           // 输出文件名前缀，默认用源文件名
}

export interface PdfSplitProgress {
  currentPart: number
  totalParts: number
  overallProgress: number
  status: 'pending' | 'splitting' | 'completed' | 'error'
  message?: string
}

export interface PdfSplitResult {
  success: boolean
  outputFiles: string[]
  error?: string
}

// ─── Excel批量合并 ──（重导出模块类型，方便统一引用）
export type {
  MatchPair,
  AuxTableConfig,
  PresetConfig,
  MergeParams,
  ExcelMergeProgress,
  ExcelMergeResult,
  PresetListItem
} from '../modules/excelMerge/types'

// ─── 金蝶导入 ──
export type {
  SourceType,
  FieldMapping,
  MaterialMatchConfig,
  KingdeeImportPreset,
  GenerateParams,
  KingdeeImportProgress,
  KingdeeImportResult
} from '../modules/kingdeeImport/types'
export type { PresetListItem as KingdeePresetListItem } from '../modules/kingdeeImport/types'
