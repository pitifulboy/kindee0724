/**
 * 金蝶导入模块类型定义
 *
 * 说明：旧的一键生成入口（generateImportFile）及其配套类型
 * （KingdeeImportPreset / GenerateParams / KingdeeImportProgress / KingdeeImportResult）
 * 已随分步执行（step1~step3）的落地而废弃移除。
 */

/** 字段映射：模板列 ← 数据来源（固定类型或自定义填充规则的 seq id） */
export interface FieldMapping {
  id: string
  templateCol: string
  /** 固定类型（table1 / constant / date）或自定义填充规则的 id（如 seq-billNo） */
  sourceType: string
  table1Col?: string
  constantValue?: string
}

/** 目标表匹配键（第 4 步）：两侧字段成对，多组时按组合值联合匹配 */
export interface TemplateMatchPair {
  /** 合并结果（明细）侧字段 */
  mergedCol: string
  /** 目标表（模板）侧字段 */
  templateCol: string
}

/** 自定义填充规则（原「序号自增配置」） */
export interface SeqConfig {
  id: string
  name: string
  type: 'constant' | 'sequential' | 'fieldBased'
  constantValue: string
  start: number
  step: number
  baseField: string
}
