/**
 * Excel 合并模块类型定义
 */

// 匹配字段对
export interface MatchPair {
  orderCol: string   // 订单表字段名
  auxCol: string     // 辅助表字段名
}

// 辅助表配置
export interface AuxTableConfig {
  id: string                 // 唯一标识（前端生成）
  name: string               // 辅助表显示名称（如"产品信息"）
  fileName: string           // 辅助表文件名（仅文件名，不含路径）
  filePath: string           // 辅助表完整路径（用于预设保存/还原）
  matchPairs: MatchPair[]    // 匹配字段对列表（支持多字段联合匹配）
  how: 'left' | 'inner' | 'right'  // 连接方式，默认 left
}

// 订单文件信息（预设保存/还原用）
export interface OrderFileInfo {
  path: string               // 订单文件完整路径
  name: string               // 订单文件名
}

// 预设配置（完整业务场景）
export interface PresetConfig {
  name: string                       // 预设名称（如"京东万商"）
  orderSubFolder: string             // 订单文件子文件夹名（相对根目录）
  auxSubFolder: string               // 辅助表子文件夹名
  textColumns: string[]              // 强制转文本的列名列表
  auxiliaryTables: AuxTableConfig[]  // 辅助表配置列表
  outputFileName: string             // 输出文件名
  orderFilePaths: OrderFileInfo[]    // 订单文件路径列表（用于预设还原）
  outputDir: string                  // 输出目录（用于预设还原）
}

// 合并参数（执行时传入）
export interface MergeParams {
  orderFilePaths: string[]           // 订单文件完整路径列表
  auxFilePaths: Record<string, string>  // 辅助表ID → 完整文件路径
  config: PresetConfig               // 预设配置
  outputDir: string                  // 输出目录
}

// 合并进度
export interface ExcelMergeProgress {
  step: string                       // 当前步骤描述
  currentTable: string               // 当前处理的表名
  currentTableIndex: number          // 当前表索引
  totalTables: number                // 总表数（订单1 + 辅助表N）
  overallProgress: number            // 总进度 0~100
  status: 'pending' | 'reading' | 'merging' | 'writing' | 'completed' | 'error'
  message?: string                   // 详细消息
}

// 合并结果
export interface ExcelMergeResult {
  outputPath: string                 // 输出文件路径
  totalRows: number                  // 总行数
  totalColumns: number               // 总列数
  matchedCount: number               // 匹配成功行数
  unmatchedCount: number             // 未匹配行数
}

// 预设列表项
export interface PresetListItem {
  name: string
  auxiliaryTableCount: number
  lastModified: string               // ISO 时间戳
}
