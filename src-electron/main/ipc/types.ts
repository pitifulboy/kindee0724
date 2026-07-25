// IPC通信类型定义

// 通用响应类型
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
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
