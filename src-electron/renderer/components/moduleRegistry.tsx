import React from 'react'
import { moduleRegistry as t } from '../config/appText'

/**
 * 模块定义接口
 * 新增模块时，在 pageRegistry 中注册即可自动出现在侧边栏
 */
export interface ModuleDef {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  enabled: boolean          // false = 显示但灰色不可点击（后续阶段模块）
  badge?: string            // 可选角标，如「新」「开发中」
}

/**
 * SVG图标统一尺寸
 */
const iconClass = 'w-5 h-5'

// Excel图标
const ExcelIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

/**
 * 全部模块注册表
 * 新增模块时在此数组添加一项即可
 */
export const moduleRegistry: ModuleDef[] = [
  {
    id: 'excel-kingdee',
    name: t.excelKingdee.name,
    icon: ExcelIcon,
    description: t.excelKingdee.description,
    enabled: true,
  },
]
