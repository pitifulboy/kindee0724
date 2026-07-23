type SourceType =
  | 'table1'
  | 'constant'
  | 'billNo'
  | 'detailSeq'
  | 'financialSeq'
  | 'date'
  | 'materialCode'
  | 'materialName'

interface FieldMapping {
  id: string
  templateCol: string
  sourceType: SourceType
  table1Col?: string
  constantValue?: string
  financialSeqOffset?: number
}

interface MaterialMatchConfig {
  enabled: boolean
  codeTable1Col: string
  codeTemplateCol: string
  nameTemplateCol: string
  nameFallbackTable1Col: string
}

interface KingdeeImportPreset {
  name: string
  table1Path: string
  table2Path: string
  outputDir: string
  outputPrefix: string

  startBillNo: number
  date: string
  matchMode: 'fill' | 'strict'
  groupByColumn: string

  templateHeaderRowIndex: number
  templateDataStartRowIndex: number

  materialMatch: MaterialMatchConfig

  fieldMappings: FieldMapping[]

  textFormatColumns: string[]
}

interface GenerateParams {
  config: KingdeeImportPreset
}

interface KingdeeImportProgress {
  step: string
  currentOrder: string
  currentOrderIndex: number
  totalOrders: number
  overallProgress: number
  status: 'pending' | 'reading' | 'generating' | 'writing' | 'completed' | 'error'
  message?: string
}

interface KingdeeImportResult {
  outputPath: string
  totalOrders: number
  totalRows: number
  skippedRows: number
}

interface PresetListItem {
  name: string
  lastModified: string
}

export type {
  SourceType,
  FieldMapping,
  MaterialMatchConfig,
  KingdeeImportPreset,
  GenerateParams,
  KingdeeImportProgress,
  KingdeeImportResult,
  PresetListItem
}
