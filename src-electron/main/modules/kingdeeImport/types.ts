// billNo/detailSeq/financialSeq/materialCode/materialName 已废弃，改用 seq ID（如 seq-billNo）
// SourceType 仍保留用于 presetManager 的旧预设读取，新代码不再使用
type SourceType =
  | 'table1'
  | 'constant'
  // | 'billNo' | 'detailSeq' | 'financialSeq'
  | 'date'
  // | 'materialCode' | 'materialName'

interface FieldMapping {
  id: string
  templateCol: string
  sourceType: string  // 可以是固定类型(table1/constant/date) 或 seq 配置 ID（如 seq-billNo）
  table1Col?: string
  constantValue?: string
  // financialSeqOffset?: number  // 已废弃，偏移量统一在 seqConfig 中管理
}

interface SeqConfig {
  id: string
  name: string
  type: 'constant' | 'sequential' | 'fieldBased'
  constantValue: string
  start: number
  step: number
  baseField: string
}

interface MatchPair { orderCol: string; auxCol: string }
interface AuxTableConfig {
  id: string; name: string; fileName: string; filePath: string
  matchPairs: MatchPair[]; how: 'left' | 'inner' | 'right'
}
interface OrderFile { id: string; path: string; name: string }
// MaterialMatchConfig 已废弃，原物料编码/名称映射已改为通用 fieldMapping
// interface MaterialMatchConfig {
//   enabled: boolean
//   codeTable1Col: string
//   codeTemplateCol: string
//   nameTemplateCol: string
//   nameFallbackTable1Col: string
// }

// KingdeeImportPreset 为旧预设格式，仅 presetManager 向后兼容读取时使用
// startBillNo/billNoStep/detailSeqStart/detailSeqStep/financialSeqStep/materialMatch 为新代码中废弃的字段
interface KingdeeImportPreset {
  name: string
  table1Path: string
  table2Path: string
  outputDir: string
  outputPrefix: string

  // startBillNo: number    // 已废弃，改用 seqConfigs
  // billNoStep: number     // 已废弃
  // detailSeqStart: number // 已废弃
  // detailSeqStep: number  // 已废弃
  // financialSeqStep: number // 已废弃
  date: string
  matchMode: 'fill' | 'strict'
  groupByColumn: string

  templateHeaderRowIndex: number
  templateDataStartRowIndex: number

  // materialMatch: MaterialMatchConfig  // 已废弃

  fieldMappings: FieldMapping[]

  textFormatColumns: string[]

  // ─── Excel 合并配置（合并后的统一预设） ───
  orderFiles?: OrderFile[]
  auxTables?: AuxTableConfig[]
  auxFilePaths?: Record<string, string>
  orderColumns?: string[]
}

// GenerateParams 仅旧 generateImportFile 使用，已废弃
// interface GenerateParams {
//   config: KingdeeImportPreset
// }

// KingdeeImportProgress / KingdeeImportResult 仅旧 generateImportFile 使用，已废弃
// interface KingdeeImportProgress {
//   step: string
//   currentOrder: string
//   currentOrderIndex: number
//   totalOrders: number
//   overallProgress: number
//   status: 'pending' | 'reading' | 'generating' | 'writing' | 'completed' | 'error'
//   message?: string
// }

// interface KingdeeImportResult {
//   outputPath: string
//   totalOrders: number
//   totalRows: number
//   skippedRows: number
// }

interface PresetListItem {
  name: string
  lastModified: string
}

export type {
  // SourceType,           // 已废弃，保留给 presetManager 旧预设用
  FieldMapping,
  SeqConfig,
  MatchPair,
  AuxTableConfig,
  OrderFile,
  // MaterialMatchConfig, // 已废弃
  KingdeeImportPreset,
  // GenerateParams,      // 已废弃
  // KingdeeImportProgress,  // 已废弃
  // KingdeeImportResult,    // 已废弃
  PresetListItem
}
