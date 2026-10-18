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
