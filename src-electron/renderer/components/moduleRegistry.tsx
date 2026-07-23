import React from 'react'

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

// PDF图标
const PdfIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 13h6M9 17h4" />
  </svg>
)

// 图片转PDF图标
const ImgToPdfIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

// Excel图标
const ExcelIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

// 数据分析图标
const ChartIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

/**
 * 全部模块注册表
 * 新增模块时在此数组添加一项即可
 * 阶段一仅 pdfConvert 启用，其余为占位
 */
export const moduleRegistry: ModuleDef[] = [
  {
    id: 'pdf-convert',
    name: 'PDF转图片',
    icon: PdfIcon,
    description: '批量将PDF文件转换为高清图片',
    enabled: true,
  },
  {
    id: 'img-to-pdf',
    name: '图片转PDF',
    icon: ImgToPdfIcon,
    description: '将多张图片合并为PDF文件',
    enabled: true,
  },
  {
    id: 'pdf-merge',
    name: 'PDF合并',
    icon: PdfIcon,
    description: '将多个PDF文件合并为一个',
    enabled: true,
  },
  {
    id: 'pdf-split',
    name: 'PDF拆分',
    icon: PdfIcon,
    description: '按页码范围拆分PDF文件',
    enabled: true,
  },
  {
    id: 'excel-merge',
    name: 'Excel批量合并',
    icon: ExcelIcon,
    description: '多表关联合并，支持预设记忆',
    enabled: true,
  },
  {
    id: 'kingdee-import',
    name: '金蝶导入',
    icon: ExcelIcon,
    description: '数据表转金蝶导入模板',
    enabled: true,
    badge: '新',
  },
  {
    id: 'excel-analysis',
    name: 'Excel数据分析',
    icon: ChartIcon,
    description: '多表关联、数据清洗、可视化分析',
    enabled: false,
    badge: '阶段四',
  },
]
