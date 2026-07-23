# 金蝶导入模板生成模块 - 开发任务文档

> **文档用途**：供多 AI Agent 协作开发的自包含规格文档。任何 AI 拿到此文档即可直接编码，无需额外查看现有代码。
>
> **项目路径**：`D:\111111vc`
> **模块 ID**：`kingdee-import`
> **模块名称**：金蝶导入

---

## 一、项目背景

### 1.1 项目概况

Electron 离线办公工具（Electron 29 + React 19 + TypeScript + Tailwind CSS + Vite 5）。纯本地离线运行，无网络请求，Windows NSIS 安装包。

现有模块：PDF转图片、图片转PDF、PDF合并、PDF拆分、Excel批量合并。

### 1.2 本次需求

新增「金蝶导入」模块，**独立页面**，不影响现有功能模块。

核心功能：将数据表（Table1，如"整理后采购单.xlsx"）的数据，按模板表（Table2，如"辅助表-引入模板.xlsx"）的格式要求，转换生成金蝶 ERP 可导入的 Excel 文件。

**关键要求**：原 Python 代码中的所有硬编码常量和变量，全部改为用户输入或下拉选择。支持预设记忆，可保存多个业务场景配置。

### 1.3 原 Python 代码逻辑摘要

原代码（Python + pandas + openpyxl）的核心流程：

1. 读取 Table1（整理后采购单.xlsx），按"采购单号"分组
2. 读取 Table2（辅助表-引入模板.xlsx），第2行（0-indexed=1）为列名行，第3行起为数据
3. 构建 Table2 的列名→列索引映射字典
4. 构建 物料编码→模板整行数据 的查找索引
5. 遍历每个订单分组：
   - 分配单号（从 START_BILL_NO 自增，每订单+1）
   - 财务序号 = 单号 + 1（同订单所有明细共用）
   - 遍历每条明细：
     - 取物料编码
     - 严格模式：物料不在模板中则跳过整行，使用模板行作为基础行
     - 填充模式：使用模板样例行作为基础行，物料编码取自 Table1
     - 物料名称：优先查模板，查不到用 Table1 商品名称兜底
     - 填充各字段（单号、日期、交货地点、地址、客户单号、明细序号、财务序号、数量、要货日期等）
     - 明细序号全局自增
6. 输出：保留模板前2行表头，追加数据行，指定列设为文本格式

---

## 二、技术选型

| 项 | 选择 | 原因 |
|----|------|------|
| Excel 库 | `exceljs@4.4.0`（已安装） | 项目已在用，无原生编译 |
| 数据处理 | 原生 JS（Map + Array） | 无 pandas 等价物，但逻辑简单 |
| 预设存储 | `userData/kingdee-import-presets.json` | 与 excelMerge 模块一致 |
| 技术栈 | Electron + React + TypeScript | 与项目完全一致 |

---

## 三、现有架构模式（新代码必须遵循）

### 3.1 模块目录结构

```
src-electron/main/modules/<moduleName>/
├── types.ts           # 类型定义
├── service.ts         # 核心业务逻辑
├── presetManager.ts   # 预设管理（CRUD + JSON持久化）
└── index.ts           # IPC handlers 注册函数
```

### 3.2 IPC 注册模式

在 `src-electron/main/ipc/index.ts` 中导入并调用注册函数：

```typescript
import { registerKingdeeImportHandlers } from '../modules/kingdeeImport'

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ...现有模块...
  registerKingdeeImportHandlers(mainWindow)
  // ...通用IPC...
}
```

### 3.3 IPC 响应格式

所有 IPC handler 返回统一格式：

```typescript
{ success: boolean, data?: T, error?: string }
```

### 3.4 Preload 暴露模式

在 `src-electron/preload/index.ts` 的 `electronAPI` 对象中添加新命名空间：

```typescript
kingdeeImport: {
  listPresets: (): Promise<IpcResponse<any[]>> => 
    ipcRenderer.invoke('kingdee-import:listPresets'),
  // ...其他方法
  onProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: unknown, progress: any) => callback(progress)
    ipcRenderer.on('kingdee-import:progress', handler)
    return () => { ipcRenderer.removeListener('kingdee-import:progress', handler) }
  },
}
```

### 3.5 类型声明模式

在 `src-electron/renderer/types/electron.d.ts` 的 `Window.electronAPI` 接口中添加：

```typescript
kingdeeImport: {
  listPresets: () => Promise<IpcResponse<any[]>>
  getPreset: (name: string) => Promise<IpcResponse<any>>
  savePreset: (config: any) => Promise<IpcResponse>
  deletePreset: (name: string) => Promise<IpcResponse>
  getTable1Columns: (filePath: string) => Promise<IpcResponse<string[]>>
  getTemplateColumns: (filePath: string, headerRowIndex: number) => Promise<IpcResponse<string[]>>
  generate: (params: any) => Promise<IpcResponse<any>>
  onProgress: (callback: (progress: any) => void) => () => void
  cancel: () => Promise<IpcResponse>
}
```

### 3.6 模块注册模式

在 `src-electron/renderer/components/moduleRegistry.tsx` 中添加：

```typescript
{
  id: 'kingdee-import',
  name: '金蝶导入',
  icon: ExcelIcon,  // 复用现有 Excel 图标
  description: '数据表转金蝶导入模板',
  enabled: true,
}
```

### 3.7 路由接入模式

在 `src-electron/renderer/App.tsx` 中添加：

```typescript
import KingdeeImportPage from './pages/KingdeeImportPage'
// switch 中添加：
case 'kingdee-import':
  return <KingdeeImportPage />
```

### 3.8 exceljs 读取模式（从 excelMerge/service.ts 提取）

```typescript
import ExcelJS from 'exceljs'

// 读取 Excel
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(filePath)
const sheet = workbook.worksheets[0]

// 读取表头（第一行）
const headerRow = sheet.getRow(1)
headerRow.eachCell((cell, colNumber) => {
  columns[colNumber - 1] = String(cell.value || '').trim()
})

// 读取数据行
for (let r = 2; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r)
  const cell = row.getCell(i + 1)  // getCell 是 1-based
  // 处理单元格值类型：{ text }, { result }, { richText }, { hyperlink }
}

// 写入 Excel
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Sheet1')
ws.addRow(rowData)
// 设置文本格式
cell.numFmt = '@'
await wb.xlsx.writeFile(outputPath)
```

### 3.9 预设管理模式（从 excelMerge/presetManager.ts 提取）

```typescript
import { app } from 'electron'
const PRESETS_FILE = path.join(app.getPath('userData'), 'kingdee-import-presets.json')

function loadAllPresets(): Record<string, any> {
  if (!fs.existsSync(PRESETS_FILE)) return {}
  return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf-8'))
}

function saveAllPresets(presets: Record<string, any>): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf-8')
}
```

### 3.10 SearchableSelect 组件

项目已有可搜索下拉组件 `src-electron/renderer/components/SearchableSelect.tsx`，直接使用：

```tsx
import SearchableSelect from '../components/SearchableSelect'

<SearchableSelect
  value={selectedCol}
  options={columnList}
  onChange={(val) => setSelectedCol(val)}
  placeholder="— 选择列 —"
  disabled={isGenerating}
/>
```

### 3.11 electron-builder 打包配置

`electron-builder.config.js` 的 `files` 数组已包含 exceljs 全部依赖树（55个包），新模块复用 exceljs，**无需额外添加打包配置**。

---

## 四、文件结构

### 4.1 新建文件（5个）

```
src-electron/main/modules/kingdeeImport/
├── types.ts              # 类型定义
├── presetManager.ts      # 预设管理 CRUD
├── service.ts            # 核心生成引擎
└── index.ts              # IPC handlers 注册
src-electron/renderer/pages/
└── KingdeeImportPage.tsx # 前端页面
```

### 4.2 增量修改文件（6个）

```
src-electron/main/ipc/index.ts              # 注册 kingdeeImport IPC
src-electron/main/ipc/types.ts              # 类型重导出
src-electron/preload/index.ts               # 暴露 kingdeeImport API
src-electron/renderer/types/electron.d.ts   # 类型声明
src-electron/renderer/components/moduleRegistry.tsx  # 添加模块
src-electron/renderer/App.tsx               # 路由接入
```

---

## 五、类型定义（types.ts）

```typescript
/**
 * 金蝶导入模块类型定义
 */

// ─── 字段映射 ───

// 数据来源类型
type SourceType =
  | 'table1'          // 数据表直接取值
  | 'constant'        // 常量值
  | 'billNo'          // 单号自增（每订单+1，从 startBillNo 开始）
  | 'detailSeq'       // 明细序号自增（全局，从1开始）
  | 'financialSeq'    // 财务序号（= 单号 + offset，同订单共用）
  | 'date'            // 配置的日期
  | 'materialCode'    // 物料编码（取自数据表，同时作为物料匹配键）
  | 'materialName'    // 物料名称（查模板，兜底取数据表）

// 单个字段映射
interface FieldMapping {
  id: string                          // 唯一标识（前端生成）
  templateCol: string                 // 模板表目标列名
  sourceType: SourceType              // 数据来源类型
  table1Col?: string                  // sourceType=table1/materialCode/materialName 时的数据表列名
  constantValue?: string              // sourceType=constant 时的常量值
  financialSeqOffset?: number         // sourceType=financialSeq 时的偏移量（默认1）
}

// ─── 物料匹配配置 ───

interface MaterialMatchConfig {
  enabled: boolean                    // 是否启用物料匹配
  codeTable1Col: string               // 数据表物料编码列名
  codeTemplateCol: string             // 模板表物料编码列名（用于构建查找索引）
  nameTemplateCol: string             // 模板表物料名称列名（查找结果）
  nameFallbackTable1Col: string       // 数据表兜底名称列名
}

// ─── 预设配置 ───

interface KingdeeImportPreset {
  name: string                        // 预设名称
  table1Path: string                  // 数据表文件路径
  table2Path: string                  // 模板表文件路径
  outputDir: string                   // 输出目录
  outputPrefix: string                // 输出文件名前缀

  // 基本设置
  startBillNo: number                 // 起始单号
  date: string                        // 日期（YYYY-MM-DD）
  matchMode: 'fill' | 'strict'        // 匹配模式：填充/严格
  groupByColumn: string               // 数据表分组列名

  // 模板结构
  templateHeaderRowIndex: number      // 模板表头行索引（0-based，默认1）
  templateDataStartRowIndex: number   // 模板数据起始行索引（0-based，默认2）

  // 物料匹配
  materialMatch: MaterialMatchConfig

  // 字段映射列表
  fieldMappings: FieldMapping[]

  // 文本格式列（模板列名列表）
  textFormatColumns: string[]
}

// ─── 生成参数 ───

interface GenerateParams {
  config: KingdeeImportPreset         // 完整配置
}

// ─── 生成进度 ───

interface KingdeeImportProgress {
  step: string                        // 当前步骤
  currentOrder: string                // 当前订单号
  currentOrderIndex: number           // 当前订单序号
  totalOrders: number                 // 总订单数
  overallProgress: number             // 总进度 0~100
  status: 'pending' | 'reading' | 'generating' | 'writing' | 'completed' | 'error'
  message?: string                    // 详细消息
}

// ─── 生成结果 ───

interface KingdeeImportResult {
  outputPath: string                  // 输出文件路径
  totalOrders: number                 // 订单数
  totalRows: number                   // 输出明细行数
  skippedRows: number                 // 跳过行数（严格模式未匹配）
}

// ─── 预设列表项 ───

interface PresetListItem {
  name: string
  lastModified: string                // ISO 时间戳
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
```

---

## 六、详细实现规格

### 6.1 presetManager.ts

与 `excelMerge/presetManager.ts` 结构完全一致，仅改文件名和类型。

```typescript
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { KingdeeImportPreset, PresetListItem } from './types'

const PRESETS_FILE_NAME = 'kingdee-import-presets.json'

function getPresetsFilePath(): string {
  return path.join(app.getPath('userData'), PRESETS_FILE_NAME)
}

function loadAllPresets(): Record<string, KingdeeImportPreset & { _lastModified: string }> {
  const filePath = getPresetsFilePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveAllPresets(presets: Record<string, any>): void {
  fs.writeFileSync(getPresetsFilePath(), JSON.stringify(presets, null, 2), 'utf-8')
}

export function listPresets(): PresetListItem[] {
  const presets = loadAllPresets()
  return Object.entries(presets)
    .map(([name, config]) => ({
      name,
      lastModified: config._lastModified || ''
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

export function getPreset(name: string): KingdeeImportPreset | null {
  const presets = loadAllPresets()
  const preset = presets[name]
  if (!preset) return null
  const { _lastModified, ...config } = preset
  return config as KingdeeImportPreset
}

export function savePreset(config: KingdeeImportPreset): void {
  const presets = loadAllPresets()
  presets[config.name] = { ...config, _lastModified: new Date().toISOString() }
  saveAllPresets(presets)
}

export function deletePreset(name: string): boolean {
  const presets = loadAllPresets()
  if (!presets[name]) return false
  delete presets[name]
  saveAllPresets(presets)
  return true
}
```

### 6.2 service.ts — 核心生成引擎

这是最关键的文件。以下为完整实现逻辑：

```typescript
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import type {
  KingdeeImportPreset,
  KingdeeImportProgress,
  KingdeeImportResult,
  FieldMapping
} from './types'

let isCancelled = false

// ─── 工具函数 ───

function clean(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    // 数字转字符串，整数去小数点
    return val === Math.floor(val) ? String(Math.floor(val)) : String(val)
  }
  return String(val).trim()
}

// 处理 exceljs 单元格值类型
function getCellValue(cell: any): any {
  const val = cell.value
  if (val && typeof val === 'object') {
    if ('text' in val) return (val as any).text
    if ('result' in val) return (val as any).result
    if ('richText' in val) return (val as any).richText.map((r: any) => r.text || '').join('')
    if ('hyperlink' in val) return (val as any).text || (val as any).hyperlink
  }
  return val
}

// ─── 读取数据表 (Table1) ───
// 第一行为表头，其余为数据行
async function readTable1(
  filePath: string,
  onProgress?: (msg: string) => void
): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)

  // 读取表头（第一行）
  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    columns[colNumber - 1] = String(cell.value || '').trim()
  })
  const lastNonEmpty = columns.reduce((last, val, i) => val ? i : last, -1)
  const validColumns = columns.slice(0, lastNonEmpty + 1)

  // 读取数据行
  const rows: Record<string, any>[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const rowData: Record<string, any> = {}
    let hasData = false
    validColumns.forEach((col, i) => {
      const cell = row.getCell(i + 1)  // 1-based
      const val = getCellValue(cell)
      rowData[col] = val ?? ''
      if (val !== '' && val !== null && val !== undefined) hasData = true
    })
    if (hasData) rows.push(rowData)
  }

  onProgress?.(`读取数据表：${rows.length} 行，${validColumns.length} 列`)
  return { columns: validColumns, rows }
}

// ─── 读取模板表 (Table2) ───
// 返回：列名→列索引映射 + 所有行数据（含表头行）+ 样例行
async function readTemplate(
  filePath: string,
  headerRowIndex: number,
  dataStartRowIndex: number,
  onProgress?: (msg: string) => void
): Promise<{
  colMap: Record<string, number>     // 列名 → 列索引（0-based）
  allRows: any[][]                    // 所有行数据（含表头行）
  sampleRow: any[]                    // 第一个数据行（作为格式样例）
  headerRows: any[][]                 // 表头行（用于输出）
}> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)

  // 读取所有行数据
  const allRows: any[][] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const rowData: any[] = []
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell)
    })
    allRows.push(rowData)
  }

  // 构建列名→列索引映射（从指定表头行）
  const colMap: Record<string, number> = {}
  if (allRows[headerRowIndex]) {
    allRows[headerRowIndex].forEach((name, i) => {
      if (name !== null && name !== undefined && String(name).trim()) {
        colMap[String(name).trim()] = i
      }
    })
  }

  // 样例行 = 第一个数据行
  const sampleRow = allRows[dataStartRowIndex] 
    ? [...allRows[dataStartRowIndex]] 
    : []

  // 表头行（用于输出，保留 headerRowIndex 及之前的行）
  const headerRows = allRows.slice(0, dataStartRowIndex)

  onProgress?.(`读取模板：识别 ${Object.keys(colMap).length} 个列名`)
  return { colMap, allRows, sampleRow, headerRows }
}

// ─── 读取数据表列名（供前端选择）───
export async function getTable1Columns(filePath: string): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件没有工作表`)

  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim()
    if (val) columns[colNumber - 1] = val
  })
  return columns.filter(c => c)
}

// ─── 读取模板表列名（供前端选择，指定表头行）───
export async function getTemplateColumns(
  filePath: string,
  headerRowIndex: number
): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件没有工作表`)

  // headerRowIndex 是 0-based，exceljs 行是 1-based
  const headerRow = sheet.getRow(headerRowIndex + 1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim()
    if (val) columns[colNumber - 1] = val
  })
  return columns.filter(c => c)
}

// ─── 主生成函数 ───
export async function generateImportFile(
  config: KingdeeImportPreset,
  onProgress: (progress: KingdeeImportProgress) => void
): Promise<KingdeeImportResult> {
  isCancelled = false

  // 1. 校验文件
  if (!fs.existsSync(config.table1Path)) {
    throw new Error(`数据表文件不存在: ${config.table1Path}`)
  }
  if (!fs.existsSync(config.table2Path)) {
    throw new Error(`模板表文件不存在: ${config.table2Path}`)
  }

  // 2. 读取数据表
  onProgress({
    step: '读取数据表', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 5, status: 'reading',
    message: '正在读取数据表...'
  })
  const { rows: table1Rows } = await readTable1(config.table1Path)
  if (isCancelled) throw new Error('已取消')

  // 3. 读取模板表
  onProgress({
    step: '读取模板表', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 10, status: 'reading',
    message: '正在读取模板表...'
  })
  const { colMap, sampleRow, headerRows } = await readTemplate(
    config.table2Path,
    config.templateHeaderRowIndex,
    config.templateDataStartRowIndex
  )
  if (isCancelled) throw new Error('已取消')

  // 4. 构建物料查找索引
  const matMatch = config.materialMatch
  let matRowMap: Map<string, any[]> = new Map()    // 物料编码 → 模板整行
  let matNameMap: Map<string, string> = new Map()   // 物料编码 → 物料名称

  if (matMatch.enabled && matMatch.codeTemplateCol) {
    const codeColIdx = colMap[matMatch.codeTemplateCol]
    const nameColIdx = matMatch.nameTemplateCol ? colMap[matMatch.nameTemplateCol] : undefined

    if (codeColIdx !== undefined) {
      // 读取模板数据行（从 dataStartRowIndex 开始）
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(config.table2Path)
      const sheet = workbook.worksheets[0]
      for (let r = config.templateDataStartRowIndex + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r)
        const codeCell = row.getCell(codeColIdx + 1)  // 1-based
        const code = clean(getCellValue(codeCell))
        if (code) {
          // 读取整行数据
          const rowData: any[] = []
          row.eachCell((cell, colNumber) => {
            rowData[colNumber - 1] = getCellValue(cell)
          })
          matRowMap.set(code, rowData)
          if (nameColIdx !== undefined) {
            const nameCell = row.getCell(nameColIdx + 1)
            matNameMap.set(code, clean(getCellValue(nameCell)))
          }
        }
      }
    }
  }

  // 5. 按分组列分组
  const groupCol = config.groupByColumn
  const groups = new Map<string, any[]>()
  for (const row of table1Rows) {
    const key = clean(row[groupCol])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const totalOrders = groups.size
  const groupEntries = Array.from(groups.entries())

  // 6. 逐订单处理
  let billNo = config.startBillNo
  let detailSeq = 1
  let totalOut = 0
  let totalSkip = 0
  const outputRows: any[][] = []

  onProgress({
    step: '生成数据', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 15, status: 'generating',
    message: `开始处理 ${totalOrders} 个订单...`
  })

  for (let gi = 0; gi < groupEntries.length; gi++) {
    if (isCancelled) throw new Error('已取消')

    const [returnNo, groupRows] = groupEntries[gi]
    const finSeq = billNo + (config.materialMatch?.enabled ? 1 : 1) // 默认 offset=1

    const orderRows: any[][] = []

    for (const item of groupRows) {
      // 获取物料编码
      const matCode = matMatch.enabled 
        ? clean(item[matMatch.codeTable1Col]) 
        : ''

      // 严格模式：物料不在模板中则跳过
      if (config.matchMode === 'strict' && matMatch.enabled) {
        if (!matCode || !matRowMap.has(matCode)) {
          totalSkip++
          continue
        }
        // 使用模板行作为基础行
        const baseRow = [...(matRowMap.get(matCode) || sampleRow)]
        // 应用字段映射
        const finalRow = applyFieldMappings(
          baseRow, colMap, config.fieldMappings, item, 
          billNo, detailSeq, finSeq, config.date,
          matCode, matNameMap, matMatch
        )
        orderRows.push(finalRow)
        detailSeq++
        totalOut++
      } else {
        // 填充模式：使用样例行作为基础行
        const baseRow = [...sampleRow]
        const finalRow = applyFieldMappings(
          baseRow, colMap, config.fieldMappings, item,
          billNo, detailSeq, finSeq, config.date,
          matCode, matNameMap, matMatch
        )
        orderRows.push(finalRow)
        detailSeq++
        totalOut++
      }
    }

    outputRows.push(...orderRows)

    onProgress({
      step: '生成数据',
      currentOrder: returnNo,
      currentOrderIndex: gi + 1,
      totalOrders,
      overallProgress: Math.round(15 + ((gi + 1) / totalOrders) * 70),
      status: 'generating',
      message: `订单 ${returnNo}: 输出 ${orderRows.length} 条，单号 ${billNo}，财务序号 ${finSeq}`
    })

    billNo++
  }

  // 7. 写入输出文件
  onProgress({
    step: '写入文件', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 90, status: 'writing',
    message: '正在写入输出文件...'
  })

  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true })
  }

  const timeTag = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)
  const outputPath = path.join(config.outputDir, `${config.outputPrefix}_${timeTag}.xlsx`)

  // 基于模板文件创建输出（保留模板格式）
  const wbOut = new ExcelJS.Workbook()
  await wbOut.xlsx.readFile(config.table2Path)
  const wsOut = wbOut.worksheets[0]

  // 清除所有行
  wsOut.spliceRows(1, wsOut.rowCount)

  // 写入表头行（保留模板的前 dataStartRowIndex 行）
  for (const headerRow of headerRows) {
    wsOut.addRow(headerRow)
  }

  // 写入数据行
  for (const rowData of outputRows) {
    wsOut.addRow(rowData)
  }

  // 设置文本格式列
  if (config.textFormatColumns && config.textFormatColumns.length > 0) {
    const maxRow = wsOut.rowCount
    for (const colName of config.textFormatColumns) {
      const colIdx = colMap[colName]
      if (colIdx !== undefined) {
        for (let r = 1; r <= maxRow; r++) {
          const cell = wsOut.getRow(r).getCell(colIdx + 1)  // 1-based
          cell.numFmt = '@'  // 文本格式
          // 统一转为字符串
          if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
            let val = cell.value
            if (typeof val === 'number') {
              val = val === Math.floor(val) ? String(Math.floor(val)) : String(val)
            } else if (typeof val !== 'string') {
              val = String(val)
            }
            cell.value = val
          }
        }
      }
    }
  }

  await wbOut.writeFile(outputPath)

  onProgress({
    step: '完成', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 100, status: 'completed',
    message: `生成完成！输出 ${totalOut} 条明细，跳过 ${totalSkip} 条`
  })

  return {
    outputPath,
    totalOrders,
    totalRows: totalOut,
    skippedRows: totalSkip
  }
}

// ─── 应用字段映射 ───
function applyFieldMappings(
  baseRow: any[],
  colMap: Record<string, number>,
  mappings: FieldMapping[],
  table1Row: Record<string, any>,
  billNo: number,
  detailSeq: number,
  finSeq: number,
  date: string,
  matCode: string,
  matNameMap: Map<string, string>,
  matMatch: { nameFallbackTable1Col: string }
): any[] {
  const result = [...baseRow]

  for (const mapping of mappings) {
    const colIdx = colMap[mapping.templateCol]
    if (colIdx === undefined) continue  // 模板中无此列

    let value: any = ''

    switch (mapping.sourceType) {
      case 'billNo':
        value = billNo
        break
      case 'detailSeq':
        value = detailSeq
        break
      case 'financialSeq':
        value = billNo + (mapping.financialSeqOffset || 1)
        break
      case 'date':
        value = date
        break
      case 'table1':
        value = table1Row[mapping.table1Col || ''] ?? ''
        break
      case 'constant':
        value = mapping.constantValue || ''
        break
      case 'materialCode':
        value = matCode
        break
      case 'materialName':
        // 优先查模板，兜底取数据表
        value = matNameMap.get(matCode) 
          || clean(table1Row[matMatch.nameFallbackTable1Col] ?? '')
        break
    }

    result[colIdx] = value
  }

  return result
}

// ─── 取消生成 ───
export function cancelGenerate() {
  isCancelled = true
}
```

### 6.3 index.ts — IPC Handlers

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { generateImportFile, getTable1Columns, getTemplateColumns, cancelGenerate } from './service'
import { listPresets, getPreset, savePreset, deletePreset } from './presetManager'

export function registerKingdeeImportHandlers(mainWindow: BrowserWindow) {
  // ─── 预设管理 ───
  ipcMain.handle('kingdee-import:listPresets', async () => {
    try {
      return { success: true, data: listPresets() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:getPreset', async (_event, name: string) => {
    try {
      const preset = getPreset(name)
      if (!preset) return { success: false, error: `预设 "${name}" 不存在` }
      return { success: true, data: preset }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:savePreset', async (_event, config: any) => {
    try {
      savePreset(config)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:deletePreset', async (_event, name: string) => {
    try {
      const deleted = deletePreset(name)
      return { success: deleted, error: deleted ? undefined : `预设 "${name}" 不存在` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ─── 字段发现 ───
  ipcMain.handle('kingdee-import:getTable1Columns', async (_event, filePath: string) => {
    try {
      const columns = await getTable1Columns(filePath)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:getTemplateColumns', async (_event, filePath: string, headerRowIndex: number) => {
    try {
      const columns = await getTemplateColumns(filePath, headerRowIndex)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ─── 生成执行 ───
  ipcMain.handle('kingdee-import:generate', async (_event, params: { config: any }) => {
    try {
      const result = await generateImportFile(params.config, (progress) => {
        mainWindow.webContents.send('kingdee-import:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kingdee-import:cancel', async () => {
    cancelGenerate()
    return { success: true }
  })
}
```

### 6.4 Preload API（增量修改 preload/index.ts）

在 `electronAPI` 对象中，在 `excelMerge` 之后添加：

```typescript
// ─── 金蝶导入 ───
kingdeeImport: {
  listPresets: (): Promise<IpcResponse<any[]>> => {
    return ipcRenderer.invoke('kingdee-import:listPresets')
  },
  getPreset: (name: string): Promise<IpcResponse<any>> => {
    return ipcRenderer.invoke('kingdee-import:getPreset', name)
  },
  savePreset: (config: any): Promise<IpcResponse> => {
    return ipcRenderer.invoke('kingdee-import:savePreset', config)
  },
  deletePreset: (name: string): Promise<IpcResponse> => {
    return ipcRenderer.invoke('kingdee-import:deletePreset', name)
  },
  getTable1Columns: (filePath: string): Promise<IpcResponse<string[]>> => {
    return ipcRenderer.invoke('kingdee-import:getTable1Columns', filePath)
  },
  getTemplateColumns: (filePath: string, headerRowIndex: number): Promise<IpcResponse<string[]>> => {
    return ipcRenderer.invoke('kingdee-import:getTemplateColumns', filePath, headerRowIndex)
  },
  generate: (params: { config: any }): Promise<IpcResponse<any>> => {
    return ipcRenderer.invoke('kingdee-import:generate', params)
  },
  onProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: unknown, progress: any) => callback(progress)
    ipcRenderer.on('kingdee-import:progress', handler)
    return () => { ipcRenderer.removeListener('kingdee-import:progress', handler) }
  },
  cancel: (): Promise<IpcResponse> => {
    return ipcRenderer.invoke('kingdee-import:cancel')
  }
},
```

### 6.5 类型声明（增量修改 electron.d.ts）

在 `Window.electronAPI` 接口中，在 `excelMerge` 之后添加：

```typescript
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
```

### 6.6 IPC 注册（增量修改 main/ipc/index.ts）

在文件顶部添加导入：

```typescript
import { registerKingdeeImportHandlers } from '../modules/kingdeeImport'
```

在 `registerIpcHandlers` 函数中添加：

```typescript
registerKingdeeImportHandlers(mainWindow)
```

### 6.7 类型重导出（增量修改 main/ipc/types.ts）

在文件末尾添加：

```typescript
// ─── 金蝶导入 ──
export type {
  SourceType,
  FieldMapping,
  MaterialMatchConfig,
  KingdeeImportPreset,
  GenerateParams,
  KingdeeImportProgress,
  KingdeeImportResult,
  PresetListItem
} from '../modules/kingdeeImport/types'
```

### 6.8 模块注册（增量修改 moduleRegistry.tsx）

在 `moduleRegistry` 数组中，在 `excel-merge` 之后添加：

```typescript
{
  id: 'kingdee-import',
  name: '金蝶导入',
  icon: ExcelIcon,
  description: '数据表转金蝶导入模板',
  enabled: true,
},
```

### 6.9 路由接入（增量修改 App.tsx）

在顶部添加导入：

```typescript
import KingdeeImportPage from './pages/KingdeeImportPage'
```

在 `renderPage` 的 switch 中添加：

```typescript
case 'kingdee-import':
  return <KingdeeImportPage />
```

---

## 七、前端页面规格（KingdeeImportPage.tsx）

### 7.1 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│ 预设: [选择预设 ▼] [保存] [另存为] [删除] [新建]           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ 文件配置 ──────────────────────────────────────────────┐ │
│ │ 数据表(Table1):  [选择文件]  filename.xlsx            │ │
│ │ 模板表(Table2):  [选择文件]  template.xlsx            │ │
│ │ 输出目录:        [选择目录]  /path/to/output/          │ │
│ │ 输出文件前缀:    [完成_批量金蝶导入________]          │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ 基本设置 ──────────────────────────────────────────────┐ │
│ │ 起始单号: [111111]    日期: [2026-07-22]               │ │
│ │ 匹配模式: [直接填充 ▼]  分组列: [采购单号 ▼]          │ │
│ │ 模板表头行索引: [1]    数据起始行索引: [2]             │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ 物料匹配 ──────────────────────────────────────────────┐ │
│ │ [✓] 启用物料匹配                                        │ │
│ │ 物料编码-数据表列:  [金蝶物料编码 ▼]                   │ │
│ │ 物料编码-模板列:    [*(订单明细)物料编码#编码 ▼]       │ │
│ │ 物料名称-模板列:    [(订单明细)物料编码#名称 ▼]        │ │
│ │ 物料名称-兜底列:    [商品名称_产品表 ▼]                │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ 字段映射 ──────────────────────────────────────────────┐ │
│ │ [+ 添加映射]                                            │ │
│ │                                                          │ │
│ │ ┌──────────────────────────────────────────────────┐    │ │
│ │ │ 模板列: [*基本信息(序号) ▼]                      │    │ │
│ │ │ 来源:   [单号自增 ▼]             [删除]          │    │ │
│ │ └──────────────────────────────────────────────────┘    │ │
│ │ ┌──────────────────────────────────────────────────┐    │ │
│ │ │ 模板列: [*(基本信息)日期 ▼]                      │    │ │
│ │ │ 来源:   [日期 ▼]                [删除]          │    │ │
│ │ └──────────────────────────────────────────────────┘    │ │
│ │ ┌──────────────────────────────────────────────────┐    │ │
│ │ │ 模板列: [*(基本信息)交货地点#编码 ▼]             │    │ │
│ │ │ 来源:   [数据表取值 ▼]                           │    │ │
│ │ │ 数据表列: [*(基本信息)交货地点#编码 ▼]           │    │ │
│ │ └──────────────────────────────────────────────────┘    │ │
│ │ ... 更多映射 ...                                       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ 文本格式列 ────────────────────────────────────────────┐ │
│ │ [选择列 ▼] →  [物料编码 ×] [客户编码 ×] [交货地点 ×]  │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ 执行 ──────────────────────────────────────────────────┐ │
│ │ [开始生成]  [取消]                                      │ │
│ │ ████████████████████░░░░ 80%                            │ │
│ │ > 读取数据表：5 行，8 列                                │ │
│ │ > 读取模板：识别 20 个列名                              │ │
│ │ > 订单 DD20240722001: 输出 3 条，单号 111111            │ │
│ │ > ...                                                   │ │
│ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 状态管理

```typescript
// 预设
const [presetName, setPresetName] = useState('')
const [presetList, setPresetList] = useState<PresetListItem[]>([])
const [showSaveDialog, setShowSaveDialog] = useState(false)
const [newPresetName, setNewPresetName] = useState('')

// 文件配置
const [table1Path, setTable1Path] = useState('')
const [table2Path, setTable2Path] = useState('')
const [outputDir, setOutputDir] = useState('')
const [outputPrefix, setOutputPrefix] = useState('完成_批量金蝶导入')

// 基本设置
const [startBillNo, setStartBillNo] = useState(111111)
const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
const [matchMode, setMatchMode] = useState<'fill' | 'strict'>('fill')
const [groupByColumn, setGroupByColumn] = useState('')
const [templateHeaderRowIndex, setTemplateHeaderRowIndex] = useState(1)
const [templateDataStartRowIndex, setTemplateDataStartRowIndex] = useState(2)

// 物料匹配
const [materialMatchEnabled, setMaterialMatchEnabled] = useState(true)
const [matCodeTable1Col, setMatCodeTable1Col] = useState('')
const [matCodeTemplateCol, setMatCodeTemplateCol] = useState('')
const [matNameTemplateCol, setMatNameTemplateCol] = useState('')
const [matNameFallbackCol, setMatNameFallbackCol] = useState('')

// 字段映射
const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])

// 文本格式列
const [textFormatColumns, setTextFormatColumns] = useState<string[]>([])
const [newTextCol, setNewTextCol] = useState('')

// 列名缓存
const [table1Columns, setTable1Columns] = useState<string[]>([])
const [templateColumns, setTemplateColumns] = useState<string[]>([])

// 执行状态
const [isGenerating, setIsGenerating] = useState(false)
const [progress, setProgress] = useState<KingdeeImportProgress | null>(null)
const [progressLogs, setProgressLogs] = useState<string[]>([])
const [result, setResult] = useState<KingdeeImportResult | null>(null)
const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
```

### 7.3 关键交互逻辑

#### 7.3.1 文件选择后自动读取列名

```typescript
// 选择数据表文件
const handleSelectTable1 = async () => {
  const res = await window.electronAPI.dialog.openFiles({
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
  })
  if (!res.canceled && res.filePaths.length > 0) {
    const fp = res.filePaths[0]
    setTable1Path(fp)
    // 自动读取列名
    const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(fp)
    if (colRes.success && colRes.data) {
      setTable1Columns(colRes.data)
    }
    // 智能默认输出目录 = 数据表所在目录
    if (!outputDir) {
      setOutputDir(fp.substring(0, fp.lastIndexOf('\\')))
    }
  }
}

// 选择模板表文件
const handleSelectTable2 = async () => {
  const res = await window.electronAPI.dialog.openFiles({
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
  })
  if (!res.canceled && res.filePaths.length > 0) {
    const fp = res.filePaths[0]
    setTable2Path(fp)
    // 自动读取模板列名（使用当前 templateHeaderRowIndex）
    const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
    if (colRes.success && colRes.data) {
      setTemplateColumns(colRes.data)
    }
  }
}

// 模板表头行索引变化时重新读取模板列名
const handleHeaderRowChange = async (val: number) => {
  setTemplateHeaderRowIndex(val)
  if (table2Path) {
    const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(table2Path, val)
    if (colRes.success && colRes.data) {
      setTemplateColumns(colRes.data)
    }
  }
}
```

#### 7.3.2 字段映射操作

```typescript
// 添加字段映射
const handleAddMapping = () => {
  setFieldMappings(prev => [...prev, {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    templateCol: '',
    sourceType: 'table1',
    table1Col: ''
  }])
}

// 更新字段映射
const handleUpdateMapping = (id: string, field: string, value: any) => {
  setFieldMappings(prev => prev.map(m => 
    m.id === id ? { ...m, [field]: value } : m
  ))
}

// 删除字段映射
const handleDeleteMapping = (id: string) => {
  setFieldMappings(prev => prev.filter(m => m.id !== id))
}
```

#### 7.3.3 来源类型下拉选项

```typescript
const sourceTypeOptions = [
  { value: 'table1', label: '数据表取值' },
  { value: 'constant', label: '常量值' },
  { value: 'billNo', label: '单号自增' },
  { value: 'detailSeq', label: '明细序号自增' },
  { value: 'financialSeq', label: '财务序号(单号+偏移)' },
  { value: 'date', label: '日期' },
  { value: 'materialCode', label: '物料编码' },
  { value: 'materialName', label: '物料名称(查模板)' },
]
```

根据 sourceType 显示不同的额外输入：
- `table1` / `materialCode` / `materialName`：显示数据表列选择 (SearchableSelect)
- `constant`：显示常量值文本输入
- `financialSeq`：显示偏移量数字输入（默认1）
- 其他：无额外输入

#### 7.3.4 保存/加载预设

保存预设时构建完整配置对象（含所有可配置字段），加载预设时还原所有状态并自动读取列名。

```typescript
const handleSavePreset = async () => {
  const name = newPresetName.trim()
  if (!name) { setToast({ type: 'error', msg: '请输入预设名称' }); return }
  
  const config: KingdeeImportPreset = {
    name,
    table1Path, table2Path, outputDir, outputPrefix,
    startBillNo, date, matchMode, groupByColumn,
    templateHeaderRowIndex, templateDataStartRowIndex,
    materialMatch: {
      enabled: materialMatchEnabled,
      codeTable1Col: matCodeTable1Col,
      codeTemplateCol: matCodeTemplateCol,
      nameTemplateCol: matNameTemplateCol,
      nameFallbackTable1Col: matNameFallbackCol
    },
    fieldMappings,
    textFormatColumns
  }
  
  const res = await window.electronAPI.kingdeeImport.savePreset(config)
  if (res.success) {
    setToast({ type: 'success', msg: `预设"${name}"已保存` })
    setPresetName(name)
    setShowSaveDialog(false)
    setNewPresetName('')
    await refreshPresetList()
  }
}

const handleLoadPreset = async (name: string) => {
  if (!name) return
  const res = await window.electronAPI.kingdeeImport.getPreset(name)
  if (res.success && res.data) {
    const c = res.data as KingdeeImportPreset
    setPresetName(name)
    setTable1Path(c.table1Path || '')
    setTable2Path(c.table2Path || '')
    setOutputDir(c.outputDir || '')
    setOutputPrefix(c.outputPrefix || '完成_批量金蝶导入')
    setStartBillNo(c.startBillNo || 111111)
    setDate(c.date || new Date().toISOString().slice(0, 10))
    setMatchMode(c.matchMode || 'fill')
    setGroupByColumn(c.groupByColumn || '')
    setTemplateHeaderRowIndex(c.templateHeaderRowIndex ?? 1)
    setTemplateDataStartRowIndex(c.templateDataStartRowIndex ?? 2)
    
    const mm = c.materialMatch || {}
    setMaterialMatchEnabled(mm.enabled ?? true)
    setMatCodeTable1Col(mm.codeTable1Col || '')
    setMatCodeTemplateCol(mm.codeTemplateCol || '')
    setMatNameTemplateCol(mm.nameTemplateCol || '')
    setMatNameFallbackCol(mm.nameFallbackTable1Col || '')
    
    setFieldMappings(c.fieldMappings || [])
    setTextFormatColumns(c.textFormatColumns || [])
    
    // 自动读取列名（如果文件存在）
    if (c.table1Path) {
      try {
        const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(c.table1Path)
        if (colRes.success && colRes.data) setTable1Columns(colRes.data)
      } catch {}
    }
    if (c.table2Path) {
      try {
        const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(
          c.table2Path, c.templateHeaderRowIndex ?? 1
        )
        if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
      } catch {}
    }
    
    setToast({ type: 'success', msg: `已加载预设"${name}"` })
  }
}
```

#### 7.3.5 执行生成

```typescript
const handleGenerate = async () => {
  // 校验
  if (!table1Path) { setToast({ type: 'error', msg: '请选择数据表文件' }); return }
  if (!table2Path) { setToast({ type: 'error', msg: '请选择模板表文件' }); return }
  if (!outputDir) { setToast({ type: 'error', msg: '请选择输出目录' }); return }
  if (!groupByColumn) { setToast({ type: 'error', msg: '请选择分组列' }); return }

  setIsGenerating(true)
  setResult(null)
  setProgressLogs([])

  // 监听进度
  const removeProgressListener = window.electronAPI.kingdeeImport.onProgress((p) => {
    setProgress(p)
    if (p.message) {
      setProgressLogs(prev => [...prev, p.message!])
    }
  })

  try {
    const config: KingdeeImportPreset = {
      name: presetName || '临时配置',
      table1Path, table2Path, outputDir, outputPrefix,
      startBillNo, date, matchMode, groupByColumn,
      templateHeaderRowIndex, templateDataStartRowIndex,
      materialMatch: {
        enabled: materialMatchEnabled,
        codeTable1Col: matCodeTable1Col,
        codeTemplateCol: matCodeTemplateCol,
        nameTemplateCol: matNameTemplateCol,
        nameFallbackTable1Col: matNameFallbackCol
      },
      fieldMappings,
      textFormatColumns
    }

    const res = await window.electronAPI.kingdeeImport.generate({ config })
    if (res.success && res.data) {
      setResult(res.data)
      setToast({ type: 'success', msg: '生成成功！' })
    } else {
      setToast({ type: 'error', msg: res.error || '生成失败' })
    }
  } catch (e: any) {
    setToast({ type: 'error', msg: e.message })
  } finally {
    removeProgressListener()
    setIsGenerating(false)
  }
}
```

### 7.4 UI 组件要求

- 所有列名选择使用 `SearchableSelect` 组件（已存在）
- 文件选择使用 `window.electronAPI.dialog.openFiles`
- 目录选择使用 `window.electronAPI.dialog.openFolder`
- 进度条用 Tailwind div 实现
- Toast 提示用 fixed 定位 + 定时消失
- 字段映射卡片可折叠/展开
- 整体使用 Tailwind CSS，与 ExcelMergePage 风格一致
- 使用 `input-field` class（项目中已定义）用于输入框样式

### 7.5 来源类型下拉的 UI

当 sourceType 选择不同值时，显示不同的额外输入控件：

```tsx
{/* 来源类型选择 */}
<select
  value={mapping.sourceType}
  onChange={(e) => handleUpdateMapping(mapping.id, 'sourceType', e.target.value)}
  className="input-field"
>
  {sourceTypeOptions.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>

{/* 根据 sourceType 显示额外输入 */}
{(mapping.sourceType === 'table1' || mapping.sourceType === 'materialCode' || mapping.sourceType === 'materialName') && (
  <div>
    <label className="text-xs text-gray-500">数据表列</label>
    <SearchableSelect
      value={mapping.table1Col || ''}
      options={table1Columns}
      onChange={(val) => handleUpdateMapping(mapping.id, 'table1Col', val)}
      placeholder="选择数据表列"
      disabled={isGenerating}
    />
  </div>
)}

{mapping.sourceType === 'constant' && (
  <div>
    <label className="text-xs text-gray-500">常量值</label>
    <input
      type="text"
      value={mapping.constantValue || ''}
      onChange={(e) => handleUpdateMapping(mapping.id, 'constantValue', e.target.value)}
      className="input-field"
      disabled={isGenerating}
    />
  </div>
)}

{mapping.sourceType === 'financialSeq' && (
  <div>
    <label className="text-xs text-gray-500">偏移量</label>
    <input
      type="number"
      value={mapping.financialSeqOffset ?? 1}
      onChange={(e) => handleUpdateMapping(mapping.id, 'financialSeqOffset', parseInt(e.target.value) || 1)}
      className="input-field"
      disabled={isGenerating}
    />
  </div>
)}
```

---

## 八、任务列表

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| 1 | 创建类型定义 | `kingdeeImport/types.ts` | 无 |
| 2 | 创建预设管理器 | `kingdeeImport/presetManager.ts` | #1 |
| 3 | 创建核心生成引擎 | `kingdeeImport/service.ts` | #1 |
| 4 | 创建 IPC handlers | `kingdeeImport/index.ts` | #2, #3 |
| 5 | 注册 IPC | `main/ipc/index.ts`（增量修改） | #4 |
| 6 | 类型重导出 | `main/ipc/types.ts`（增量修改） | #1 |
| 7 | 暴露 Preload API | `preload/index.ts`（增量修改） | #4 |
| 8 | 类型声明 | `electron.d.ts`（增量修改） | #7 |
| 9 | 创建前端页面 | `KingdeeImportPage.tsx` | #7, #8 |
| 10 | 模块注册 | `moduleRegistry.tsx`（增量修改） | 无 |
| 11 | 路由接入 | `App.tsx`（增量修改） | #9, #10 |
| 12 | 版本号递增 | `package.json` + `Sidebar.tsx` | 全部完成 |

---

## 九、验收标准

### 9.1 功能验收

| # | 验收项 | 验证方法 |
|---|--------|---------|
| 1 | 选择数据表文件后，列名自动加载到下拉选项 | 选文件 → 查看下拉有列名 |
| 2 | 选择模板表文件后，列名自动加载（按配置的表头行索引） | 选文件 → 查看下拉有列名 |
| 3 | 修改模板表头行索引后，模板列名重新读取 | 改索引 → 列名更新 |
| 4 | 添加字段映射 → 选择模板列 → 选择来源类型 → 选择数据表列 | 操作完整流程 |
| 5 | 保存预设 → 关闭页面重开 → 加载预设 → 所有配置还原 | 预设 CRUD |
| 6 | 加载预设时自动读取文件列名（文件存在时） | 加载预设 → 下拉有列名 |
| 7 | 执行生成 → 进度条更新 → 日志输出 → 输出文件生成 | 执行完整流程 |
| 8 | 填充模式：未匹配物料的行仍输出（物料名称为兜底值） | 用测试数据验证 |
| 9 | 严格模式：未匹配物料的行被跳过 | 切换模式 → 验证行数 |
| 10 | 单号自增：每订单+1 | 查看输出文件 |
| 11 | 明细序号全局自增 | 查看输出文件 |
| 12 | 财务序号 = 单号 + 偏移量（同订单共用） | 查看输出文件 |
| 13 | 文本格式列正确设置（编码列不丢前导零） | 查看输出文件 |
| 14 | 输出文件保留模板表头行 | 查看输出文件前几行 |
| 15 | 所有硬编码值均可通过 UI 配置 | 逐项检查 |

### 9.2 打包验收

| # | 验收项 |
|---|--------|
| 1 | `npm run build` 成功，无错误 |
| 2 | 安装包生成，大小约 103MB（与 v2.7.x 一致） |
| 3 | 安装后金蝶导入模块可用（侧边栏可点击） |

---

## 十、注意事项

### 10.1 exceljs 单元格读取

exceljs 的 `getCell()` 是 **1-based**：第一列是 `getCell(1)`，不是 `getCell(0)`。
单元格值可能是对象类型：`{ text }`, `{ result }`, `{ richText }`, `{ hyperlink }`，需要统一处理（见 service.ts 中的 `getCellValue` 函数）。

### 10.2 模板表结构

模板表（Table2）可能有多行表头：
- 第1行（index 0）：可能是分组标题行
- 第2行（index 1）：列名行（`templateHeaderRowIndex` 默认值）
- 第3行（index 2）起：数据行（`templateDataStartRowIndex` 默认值）

这些索引都是 **0-based**，但 exceljs 的行号是 **1-based**。转换关系：`exceljsRow = index + 1`。

### 10.3 输出文件

输出文件基于模板文件创建（`wbOut.xlsx.readFile(config.table2Path)`），保留模板的格式和样式。清除所有行后重新写入表头和数据行。

输出文件名格式：`{outputPrefix}_{timestamp}.xlsx`，timestamp 格式 `YYYYMMDD_HHMMSS`。

### 10.4 物料匹配逻辑

- **填充模式**（fill）：使用模板第一个数据行作为基础行，物料编码从数据表填入，物料名称查模板查不到用数据表兜底
- **严格模式**（strict）：只有物料编码在模板中存在的行才输出，使用模板整行作为基础行

### 10.5 文本格式设置

指定列设为文本格式（`cell.numFmt = '@'`），并将值统一转为字符串。这对金蝶导入很重要——物料编码、客户编码等纯数字编码如果不设文本格式，Excel 会当作数值处理，可能丢失前导零。

### 10.6 前端页面参考

参考 `ExcelMergePage.tsx` 的代码风格和组件使用方式：
- Tailwind CSS 类名
- Toast 提示（fixed 定位）
- 进度条 + 日志区域
- 预设栏布局
- SearchableSelect 组件使用

### 10.7 版本号

当前版本 2.7.2。本次新增功能（minor），递增到 **2.8.0**。需同步修改：
- `package.json` 的 `version` 字段
- `src-electron/renderer/components/Sidebar.tsx` 中的版本号显示

---

## 十一、代码路径（所有相关文件的绝对路径）

### 新建文件

```
D:\111111vc\src-electron\main\modules\kingdeeImport\types.ts
D:\111111vc\src-electron\main\modules\kingdeeImport\presetManager.ts
D:\111111vc\src-electron\main\modules\kingdeeImport\service.ts
D:\111111vc\src-electron\main\modules\kingdeeImport\index.ts
D:\111111vc\src-electron\renderer\pages\KingdeeImportPage.tsx
```

### 增量修改文件

```
D:\111111vc\src-electron\main\ipc\index.ts
D:\111111vc\src-electron\main\ipc\types.ts
D:\111111vc\src-electron\preload\index.ts
D:\111111vc\src-electron\renderer\types\electron.d.ts
D:\111111vc\src-electron\renderer\components\moduleRegistry.tsx
D:\111111vc\src-electron\renderer\App.tsx
D:\111111vc\package.json
D:\111111vc\src-electron\renderer\components\Sidebar.tsx
```

### 参考文件（只读，不需修改）

```
D:\111111vc\src-electron\main\modules\excelMerge\service.ts       # exceljs 使用参考
D:\111111vc\src-electron\main\modules\excelMerge\presetManager.ts  # 预设管理参考
D:\111111vc\src-electron\main\modules\excelMerge\index.ts          # IPC 注册参考
D:\111111vc\src-electron\renderer\pages\ExcelMergePage.tsx         # 前端页面参考
D:\111111vc\src-electron\renderer\components\SearchableSelect.tsx  # 可搜索下拉组件
D:\111111vc\electron-builder.config.js                             # 打包配置（无需修改）
```

---

## 十二、参考数据（京东万商业务场景默认预设）

以下是将原 Python 代码的硬编码配置转换为预设的示例，可用于测试：

```json
{
  "name": "京东万商",
  "table1Path": "D:\\00  运营\\08  京东万商\\0722 python金蝶导入\\整理后采购单.xlsx",
  "table2Path": "D:\\00  运营\\08  京东万商\\0722 python金蝶导入\\2 辅助表\\辅助表-引入模板.xlsx",
  "outputDir": "D:\\00  运营\\08  京东万商\\0722 python金蝶导入",
  "outputPrefix": "完成_批量金蝶导入",
  "startBillNo": 111111,
  "date": "2026-07-22",
  "matchMode": "fill",
  "groupByColumn": "采购单号",
  "templateHeaderRowIndex": 1,
  "templateDataStartRowIndex": 2,
  "materialMatch": {
    "enabled": true,
    "codeTable1Col": "金蝶物料编码",
    "codeTemplateCol": "*(订单明细)物料编码#编码",
    "nameTemplateCol": "(订单明细)物料编码#名称",
    "nameFallbackTable1Col": "商品名称_产品表"
  },
  "fieldMappings": [
    { "id": "1", "templateCol": "*基本信息(序号)", "sourceType": "billNo" },
    { "id": "2", "templateCol": "*(基本信息)日期", "sourceType": "date" },
    { "id": "3", "templateCol": "*(基本信息)交货地点#编码", "sourceType": "table1", "table1Col": "*(基本信息)交货地点#编码" },
    { "id": "4", "templateCol": "(基本信息)详细地址", "sourceType": "table1", "table1Col": "(基本信息)收货方地址" },
    { "id": "5", "templateCol": "(基本信息)客户单号", "sourceType": "table1", "table1Col": "采购单号" },
    { "id": "6", "templateCol": "*订单明细(序号)", "sourceType": "detailSeq" },
    { "id": "7", "templateCol": "*财务信息(序号)", "sourceType": "financialSeq", "financialSeqOffset": 1 },
    { "id": "8", "templateCol": "*(订单明细)物料编码#编码", "sourceType": "materialCode" },
    { "id": "9", "templateCol": "(订单明细)物料编码#名称", "sourceType": "materialName" },
    { "id": "10", "templateCol": "(订单明细)销售数量", "sourceType": "table1", "table1Col": "采购数量" },
    { "id": "11", "templateCol": "(订单明细)计价数量", "sourceType": "table1", "table1Col": "采购数量" },
    { "id": "12", "templateCol": "*(订单明细)要货日期", "sourceType": "date" }
  ],
  "textFormatColumns": [
    "*(订单明细)物料编码#编码",
    "*(基本信息)客户#编码",
    "(基本信息)收货方#编码",
    "(基本信息)结算方#编码",
    "(基本信息)付款方#编码",
    "*(基本信息)交货地点#编码"
  ]
}
```
