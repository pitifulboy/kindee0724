# 开发任务：Excel 批量合并模块

> **文档用途**：供 AI Agent 或开发者直接依据本文件完成全部编码工作。文档自包含所有必要的上下文、代码模式、类型定义和接口规格。
>
> **创建日期**：2026-07-22
> **项目版本**：当前 2.6.0，本功能完成后递增为 2.7.0

---

## 一、项目背景

### 1.1 项目概况

- **名称**：electron-office（离线办公工具）
- **架构**：Electron 29 + React 19 + TypeScript + Tailwind CSS + Vite 5
- **特点**：纯本地离线运行，无任何网络请求，Windows NSIS 安装包
- **项目路径**：`D:\111111vc`

### 1.2 现有功能模块

| 模块 ID | 名称 | 状态 |
|---------|------|------|
| `pdf-convert` | PDF转图片 | ✅ 已启用 |
| `img-to-pdf` | 图片转PDF | ✅ 已启用 |
| `pdf-merge` | PDF合并 | ✅ 已启用 |
| `pdf-split` | PDF拆分 | ✅ 已启用 |
| `excel-merge` | Excel批量合并 | ❌ 禁用中（本次开发目标） |
| `excel-analysis` | Excel数据分析 | ❌ 禁用中（阶段四） |

### 1.3 本次需求

在现有 Electron 桌面软件中新增「Excel批量合并」功能模块（模块 ID `excel-merge`，已在注册表中占位但灰色禁用），实现：

1. **订单表合并**：选择 1~N 个订单 Excel 文件，纵向合并为一张主表
2. **辅助表关联**：添加 1~N 个辅助表，每个手动选择匹配字段（支持多字段联合匹配）
3. **预设记忆**：匹配配置可保存为命名预设，下次直接调用，支持多业务场景
4. **输出结果**：合并后导出为 Excel 文件

**业务场景示例**：京东万商订单合并（产品信息表按"商品编号"匹配 + 仓库表按"配送中心"匹配），天猫订单合并，拼多多订单合并等。

---

## 二、技术选型

| 项 | 选择 | 原因 |
|----|------|------|
| Excel 处理库 | `exceljs` | 功能全面、API 现代、支持读写、纯 JS 无原生编译 |
| Join 逻辑 | 自实现（Map 查找） | Node.js 无 pandas 等价物，但 left join 逻辑简单 |
| 预设存储 | 本地 JSON 文件 | 存到 `app.getPath('userData')` 目录，持久化 |
| UI 框架 | React + Tailwind CSS | 跟现有框架一致 |
| 状态管理 | React useState | 单页面，无需 Redux |

### Excel 处理库说明

安装 `exceljs`：

```bash
npm install exceljs
```

`exceljs` 的关键 API：
```typescript
// 读取
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(filePath)
const sheet = workbook.getWorksheet(1) // 或 workbook.worksheets[0]
const columns = sheet.getRow(1).values.slice(1) // 第一行为表头
const rows = [] // 遍历 sheet.eachRow 或 sheet.getRows

// 写入
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Sheet1')
ws.columns = [{ header: '列名', key: 'col1' }, ...]
rows.forEach(r => ws.addRow(r))
await wb.xlsx.writeFile(outputPath)
```

---

## 三、现有架构模式（代码参考）

> 以下模式从现有代码中提取，新模块**必须遵循相同模式**。

### 3.1 IPC Handler 注册模式

**文件**：`src-electron/main/modules/<module>/index.ts`

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { someFunction } from './service'

export function registerXxxHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('xxx:action', async (event, params: SomeParams) => {
    try {
      const result = await someFunction(params, (progress) => {
        mainWindow.webContents.send('xxx:action:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
```

**注册入口**：`src-electron/main/ipc/index.ts`

```typescript
import { registerXxxHandlers } from '../modules/xxx'

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ... 现有注册
  registerXxxHandlers(mainWindow)
  // ... 通用 IPC
}
```

### 3.2 Preload API 暴露模式

**文件**：`src-electron/preload/index.ts`

```typescript
const electronAPI = {
  // ... 现有 API
  xxxModule: {
    action: (params: SomeParams): Promise<IpcResponse<SomeResult>> => {
      return ipcRenderer.invoke('xxx:action', params)
    },
    onProgress: (callback: (progress: SomeProgress) => void): (() => void) => {
      const handler = (_event: unknown, progress: SomeProgress) => callback(progress)
      ipcRenderer.on('xxx:action:progress', handler)
      return () => {
        ipcRenderer.removeListener('xxx:action:progress', handler)
      }
    }
  }
}
```

### 3.3 类型声明模式

**文件**：`src-electron/renderer/types/electron.d.ts`

```typescript
declare global {
  interface Window {
    electronAPI: {
      // ... 现有类型
      xxxModule: {
        action: (params: SomeParams) => Promise<IpcResponse<SomeResult>>
        onProgress: (callback: (progress: SomeProgress) => void) => () => void
      }
    }
  }
}
```

### 3.4 IPC 类型定义模式

**文件**：`src-electron/main/ipc/types.ts`

```typescript
// 通用响应类型
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// 模块特定类型在此添加
```

### 3.5 模块注册模式

**文件**：`src-electron/renderer/components/moduleRegistry.tsx`

```typescript
export const moduleRegistry: ModuleDef[] = [
  // ... 现有模块
  {
    id: 'excel-merge',
    name: 'Excel批量合并',
    icon: ExcelIcon,  // 已有 ExcelIcon 定义
    description: '多个Excel文件批量合并',
    enabled: true,     // ← 从 false 改为 true
    // badge: '阶段三',  // ← 删除 badge
  },
]
```

### 3.6 路由模式

**文件**：`src-electron/renderer/App.tsx`

```typescript
import ExcelMergePage from './pages/ExcelMergePage'

// 在 switch 中：
case 'excel-merge':
  return <ExcelMergePage />
  // 删除原来的 PlaceholderPage
```

### 3.7 前端页面模式

现有页面（如 PdfMergePage）的通用模式：
- `useState` 管理文件列表、输出路径、进度、错误等状态
- `useEffect` 初始化默认输出路径（默认桌面）
- `useRef` 管理进度监听的 unsubscribe 函数
- Toast 提示（4秒自动消失）
- 拖拽上传支持
- `window.electronAPI.dialog.openFiles` / `openFolder` 选择文件/目录
- `window.electronAPI.app.getPath('desktop')` 获取桌面路径
- `window.electronAPI.shell.openPath` 打开输出目录

### 3.8 Service 模式

**文件**：`src-electron/main/modules/<module>/service.ts`

```typescript
import * as fs from 'fs'
import * as path from 'path'

let isCancelled = false

export async function doSomething(
  params: SomeParams,
  onProgress: (progress: SomeProgress) => void
): Promise<SomeResult> {
  isCancelled = false
  // ... 业务逻辑
}

export function cancelSomething() {
  isCancelled = true
}
```

---

## 四、文件结构

### 4.1 新建文件（5个）

```
src-electron/main/modules/excelMerge/
├── types.ts              # 类型定义（预设结构、合并参数、进度等）
├── service.ts            # 核心合并引擎（读取Excel + join逻辑 + 输出）
├── presetManager.ts      # 预设管理（CRUD + JSON持久化到 userData）
├── index.ts              # IPC handlers 注册
└── README.md             # 模块说明

src-electron/renderer/pages/
└── ExcelMergePage.tsx    # 前端页面（文件选择 + 字段匹配 + 预设管理 + 执行）
```

### 4.2 增量修改文件（6个）

```
package.json                                 # 添加 exceljs 依赖 + 版本号递增
src-electron/main/ipc/index.ts               # 注册 excelMerge IPC handlers
src-electron/main/ipc/types.ts               # 添加 Excel 合并相关类型
src-electron/preload/index.ts                # 暴露 excelMerge API
src-electron/renderer/types/electron.d.ts    # 添加类型声明
src-electron/renderer/components/moduleRegistry.tsx  # 启用 excel-merge 模块
src-electron/renderer/App.tsx                # 路由接入 ExcelMergePage
electron-builder.config.js                   # files 白名单添加 exceljs
```

---

## 五、类型定义

### 5.1 核心类型（`src-electron/main/modules/excelMerge/types.ts`）

```typescript
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
  matchPairs: MatchPair[]    // 匹配字段对列表（支持多字段联合匹配）
  how: 'left' | 'inner' | 'right'  // 连接方式，默认 left
}

// 预设配置（完整业务场景）
export interface PresetConfig {
  name: string                       // 预设名称（如"京东万商"）
  orderSubFolder: string             // 订单文件子文件夹名（相对根目录）
  auxSubFolder: string               // 辅助表子文件夹名
  textColumns: string[]              // 强制转文本的列名列表
  auxiliaryTables: AuxTableConfig[]  // 辅助表配置列表
  outputFileName: string             // 输出文件名
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
```

### 5.2 IPC 类型（添加到 `src-electron/main/ipc/types.ts`）

在文件末尾追加：

```typescript
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
```

---

## 六、详细实现规格

### 6.1 预设管理器（`presetManager.ts`）

```typescript
/**
 * 预设管理器
 * 将预设配置持久化到 app.getPath('userData')/excel-merge-presets.json
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { PresetConfig, PresetListItem } from './types'

const PRESETS_FILE_NAME = 'excel-merge-presets.json'

// 获取预设文件路径
function getPresetsFilePath(): string {
  return path.join(app.getPath('userData'), PRESETS_FILE_NAME)
}

// 读取所有预设（返回 name → config 的字典）
function loadAllPresets(): Record<string, PresetConfig & { _lastModified: string }> {
  const filePath = getPresetsFilePath()
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// 保存所有预设
function saveAllPresets(presets: Record<string, any>): void {
  const filePath = getPresetsFilePath()
  fs.writeFileSync(filePath, JSON.stringify(presets, null, 2), 'utf-8')
}

// 列出所有预设名
export function listPresets(): PresetListItem[] {
  const presets = loadAllPresets()
  return Object.entries(presets)
    .map(([name, config]) => ({
      name,
      auxiliaryTableCount: config.auxiliaryTables?.length || 0,
      lastModified: config._lastModified || ''
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

// 获取单个预设
export function getPreset(name: string): PresetConfig | null {
  const presets = loadAllPresets()
  const preset = presets[name]
  if (!preset) return null
  // 去掉内部字段
  const { _lastModified, ...config } = preset
  return config as PresetConfig
}

// 保存预设（新建或更新）
export function savePreset(config: PresetConfig): void {
  const presets = loadAllPresets()
  presets[config.name] = {
    ...config,
    _lastModified: new Date().toISOString()
  }
  saveAllPresets(presets)
}

// 删除预设
export function deletePreset(name: string): boolean {
  const presets = loadAllPresets()
  if (!presets[name]) return false
  delete presets[name]
  saveAllPresets(presets)
  return true
}
```

### 6.2 合并引擎（`service.ts`）

```typescript
/**
 * Excel 合并核心服务
 * 使用 exceljs 读取 Excel → 数据 join → 输出 Excel
 */
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import type {
  MergeParams,
  ExcelMergeProgress,
  ExcelMergeResult,
  PresetConfig,
  AuxTableConfig
} from './types'

let isCancelled = false

/**
 * 读取 Excel 文件为行数据数组
 * 返回：{ columns: string[], rows: Record<string, any>[] }
 */
async function readExcel(
  filePath: string,
  onProgress?: (msg: string) => void
): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)
  }

  // 读取表头（第一行）
  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    columns[colNumber - 1] = String(cell.value || '').trim()
  })
  // 过滤掉末尾空列
  const lastNonEmpty = columns.reduce((last, val, i) => val ? i : last, -1)
  const validColumns = columns.slice(0, lastNonEmpty + 1)

  // 读取数据行
  const rows: Record<string, any>[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const rowData: Record<string, any> = {}
    let hasData = false
    validColumns.forEach((col, i) => {
      const cell = row.getCell(i + 2) // 1-based, 第一列是 1
      const val = cell.value
      // 处理 exceljs 的单元格值类型
      let processedVal: any = val
      if (val && typeof val === 'object' && 'text' in val) {
        processedVal = (val as any).text
      } else if (val && typeof val === 'object' && 'result' in val) {
        processedVal = (val as any).result
      }
      rowData[col] = processedVal ?? ''
      if (processedVal !== '' && processedVal !== null && processedVal !== undefined) {
        hasData = true
      }
    })
    if (hasData) {
      rows.push(rowData)
    }
  }

  onProgress?.(`读取 ${path.basename(filePath)}：${rows.length} 行，${validColumns.length} 列`)
  return { columns: validColumns, rows }
}

/**
 * 清洗字段值：转字符串 + 去首尾空格
 */
function cleanValue(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

/**
 * 构建 join 查找索引（Map）
 * key = 匹配字段值组合（用 \x00 分隔）
 */
function buildJoinIndex(
  rows: Record<string, any>[],
  matchPairs: { auxCol: string }[]
): Map<string, Record<string, any>[]> {
  const index = new Map<string, Record<string, any>[]>()
  for (const row of rows) {
    const key = matchPairs.map(p => cleanValue(row[p.auxCol])).join('\x00')
    if (!index.has(key)) {
      index.set(key, [])
    }
    index.get(key)!.push(row)
  }
  return index
}

/**
 * 执行 left join
 * 将辅助表的列合并到订单表行中
 */
function leftJoin(
  orderRows: Record<string, any>[],
  auxRows: Record<string, any>[],
  matchPairs: { orderCol: string; auxCol: string }[],
  auxTableName: string,
  how: 'left' | 'inner' | 'right'
): { rows: Record<string, any>[]; matched: number; unmatched: number } {
  const auxIndex = buildJoinIndex(auxRows, matchPairs)
  const result: Record<string, any>[] = []
  let matched = 0
  let unmatched = 0

  // 获取辅助表的所有列名
  const auxColumns = auxRows.length > 0 ? Object.keys(auxRows[0]) : []

  for (const orderRow of orderRows) {
    const key = matchPairs.map(p => cleanValue(orderRow[p.orderCol])).join('\x00')
    const matches = auxIndex.get(key)

    if (matches && matches.length > 0) {
      matched++
      // 一对多：每个匹配生成一行
      for (const auxRow of matches) {
        const mergedRow = { ...orderRow }
        for (const col of auxColumns) {
          // 列名冲突处理：如果订单表已有同名列，加后缀
          const targetCol = col in orderRow ? `${col}_${auxTableName}` : col
          mergedRow[targetCol] = auxRow[col]
        }
        result.push(mergedRow)
      }
    } else {
      unmatched++
      if (how === 'inner') {
        // inner join: 跳过未匹配行
        continue
      }
      // left join: 保留行，辅助表字段填空
      const mergedRow = { ...orderRow }
      for (const col of auxColumns) {
        const targetCol = col in orderRow ? `${col}_${auxTableName}` : col
        mergedRow[targetCol] = ''
      }
      result.push(mergedRow)
    }
  }

  return { rows: result, matched, unmatched }
}

/**
 * 主函数：执行 Excel 合并
 */
export async function mergeExcelData(
  params: MergeParams,
  onProgress: (progress: ExcelMergeProgress) => void
): Promise<ExcelMergeResult> {
  isCancelled = false
  const { orderFilePaths, auxFilePaths, config, outputDir } = params

  if (orderFilePaths.length === 0) {
    throw new Error('没有选择订单文件')
  }

  const totalSteps = 1 + orderFilePaths.length + config.auxiliaryTables.length + 1 // 读取订单 + 读取辅助表 + 合并 + 写入
  let currentStep = 0

  // ─── 1. 读取所有订单文件并合并 ───
  onProgress({
    step: '读取订单文件',
    currentTable: '订单表',
    currentTableIndex: 0,
    totalTables: totalSteps,
    overallProgress: 0,
    status: 'reading',
    message: `正在读取 ${orderFilePaths.length} 个订单文件...`
  })

  let orderRows: Record<string, any>[] = []
  let orderColumns: string[] = []

  for (let i = 0; i < orderFilePaths.length; i++) {
    if (isCancelled) throw new Error('合并已取消')

    const filePath = orderFilePaths[i]
    if (!fs.existsSync(filePath)) {
      throw new Error(`订单文件不存在: ${filePath}`)
    }

    const { columns, rows } = await readExcel(filePath)

    if (i === 0) {
      orderColumns = columns
    } else {
      // 合并列：新文件可能有额外列
      for (const col of columns) {
        if (!orderColumns.includes(col)) {
          orderColumns.push(col)
        }
      }
    }

    orderRows = orderRows.concat(rows)
    currentStep++

    onProgress({
      step: '读取订单文件',
      currentTable: path.basename(filePath),
      currentTableIndex: i + 1,
      totalTables: orderFilePaths.length,
      overallProgress: Math.round((currentStep / totalSteps) * 100),
      status: 'reading',
      message: `已读取 ${i + 1}/${orderFilePaths.length} 个订单文件，累计 ${orderRows.length} 行`
    })
  }

  // ─── 2. 强制文本列转换 ───
  if (config.textColumns && config.textColumns.length > 0) {
    for (const col of config.textColumns) {
      if (orderColumns.includes(col)) {
        for (const row of orderRows) {
          if (col in row) {
            row[col] = cleanValue(row[col])
          }
        }
      }
    }
  }

  // ─── 3. 读取辅助表并逐一 join ───
  let totalMatched = 0
  let totalUnmatched = 0

  for (let i = 0; i < config.auxiliaryTables.length; i++) {
    if (isCancelled) throw new Error('合并已取消')

    const auxConfig = config.auxiliaryTables[i]
    const auxFilePath = auxFilePaths[auxConfig.id]

    if (!auxFilePath || !fs.existsSync(auxFilePath)) {
      throw new Error(`辅助表文件不存在: ${auxConfig.fileName}`)
    }

    onProgress({
      step: `合并辅助表 (${i + 1}/${config.auxiliaryTables.length})`,
      currentTable: auxConfig.name,
      currentTableIndex: i + 1,
      totalTables: config.auxiliaryTables.length,
      overallProgress: Math.round((currentStep / totalSteps) * 100),
      status: 'merging',
      message: `正在读取辅助表: ${auxConfig.fileName}`
    })

    const { rows: auxRows } = await readExcel(auxFilePath)
    currentStep++

    // 清洗辅助表匹配字段
    for (const pair of auxConfig.matchPairs) {
      for (const row of auxRows) {
        if (pair.auxCol in row) {
          row[pair.auxCol] = cleanValue(row[pair.auxCol])
        }
      }
    }
    // 清洗订单表匹配字段
    for (const pair of auxConfig.matchPairs) {
      for (const row of orderRows) {
        if (pair.orderCol in row) {
          row[pair.orderCol] = cleanValue(row[pair.orderCol])
        }
      }
    }

    onProgress({
      step: `合并辅助表 (${i + 1}/${config.auxiliaryTables.length})`,
      currentTable: auxConfig.name,
      currentTableIndex: i + 1,
      totalTables: config.auxiliaryTables.length,
      overallProgress: Math.round((currentStep / totalSteps) * 100),
      status: 'merging',
      message: `正在按 ${auxConfig.matchPairs.map(p => `${p.orderCol}↔${p.auxCol}`).join(', ')} 合并...`
    })

    const joinResult = leftJoin(
      orderRows,
      auxRows,
      auxConfig.matchPairs,
      auxConfig.name,
      auxConfig.how
    )

    orderRows = joinResult.rows
    totalMatched += joinResult.matched
    totalUnmatched += joinResult.unmatched
    currentStep++
  }

  // ─── 4. 收集所有列名（保持顺序）───
  const allColumnsSet = new Set<string>()
  for (const row of orderRows) {
    for (const key of Object.keys(row)) {
      allColumnsSet.add(key)
    }
  }
  const allColumns = Array.from(allColumnsSet)

  // ─── 5. 写入输出文件 ───
  onProgress({
    step: '写入结果文件',
    currentTable: '输出',
    currentTableIndex: 0,
    totalTables: 1,
    overallProgress: Math.round((currentStep / totalSteps) * 100),
    status: 'writing',
    message: `正在写入 ${orderRows.length} 行数据到 Excel...`
  })

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, config.outputFileName || '合并结果.xlsx')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('合并结果')

  // 写表头
  ws.columns = allColumns.map(col => ({
    header: col,
    key: col,
    width: Math.max(col.length * 2 + 4, 12)
  }))

  // 写数据行
  for (const row of orderRows) {
    ws.addRow(row)
  }

  // 表头样式
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F0FE' }
  }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }

  await wb.xlsx.writeFile(outputPath)

  onProgress({
    step: '完成',
    currentTable: '',
    currentTableIndex: 0,
    totalTables: 0,
    overallProgress: 100,
    status: 'completed',
    message: `合并完成！共 ${orderRows.length} 行，${allColumns.length} 列`
  })

  return {
    outputPath,
    totalRows: orderRows.length,
    totalColumns: allColumns.length,
    matchedCount: totalMatched,
    unmatchedCount: totalUnmatched
  }
}

/**
 * 读取 Excel 列名（用于前端字段选择下拉框）
 */
export async function getExcelColumns(
  filePath: string,
  sheetName?: string
): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0]

  if (!sheet) {
    throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)
  }

  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim()
    if (val) {
      columns[colNumber - 1] = val
    }
  })

  return columns.filter(c => c) // 过滤空列名
}

/**
 * 取消合并
 */
export function cancelMerge() {
  isCancelled = true
}
```

### 6.3 IPC Handlers（`index.ts`）

```typescript
/**
 * Excel 合并模块 IPC handlers
 */
import { ipcMain, BrowserWindow } from 'electron'
import { mergeExcelData, getExcelColumns, cancelMerge } from './service'
import { listPresets, getPreset, savePreset, deletePreset } from './presetManager'
import type { MergeParams } from './types'

export function registerExcelMergeHandlers(mainWindow: BrowserWindow) {
  // ─── 预设管理 ───

  // 列出所有预设
  ipcMain.handle('excel-merge:listPresets', async () => {
    try {
      return { success: true, data: listPresets() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取单个预设
  ipcMain.handle('excel-merge:getPreset', async (_event, name: string) => {
    try {
      const preset = getPreset(name)
      if (!preset) {
        return { success: false, error: `预设 "${name}" 不存在` }
      }
      return { success: true, data: preset }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 保存预设
  ipcMain.handle('excel-merge:savePreset', async (_event, config: any) => {
    try {
      savePreset(config)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 删除预设
  ipcMain.handle('excel-merge:deletePreset', async (_event, name: string) => {
    try {
      const deleted = deletePreset(name)
      return { success: deleted, error: deleted ? undefined : `预设 "${name}" 不存在` }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ─── 字段发现 ───

  // 读取 Excel 列名
  ipcMain.handle('excel-merge:getColumns', async (_event, filePath: string) => {
    try {
      const columns = await getExcelColumns(filePath)
      return { success: true, data: columns }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ─── 合并执行 ───

  // 执行合并
  ipcMain.handle('excel-merge:merge', async (_event, params: MergeParams) => {
    try {
      const result = await mergeExcelData(params, (progress) => {
        mainWindow.webContents.send('excel-merge:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 取消合并
  ipcMain.handle('excel-merge:cancel', async () => {
    cancelMerge()
    return { success: true }
  })
}
```

### 6.4 Preload API（增量添加到 `preload/index.ts`）

在 `electronAPI` 对象中添加：

```typescript
// ─── Excel批量合并 ───
excelMerge: {
  // 预设管理
  listPresets: (): Promise<IpcResponse<any[]>> => {
    return ipcRenderer.invoke('excel-merge:listPresets')
  },

  getPreset: (name: string): Promise<IpcResponse<any>> => {
    return ipcRenderer.invoke('excel-merge:getPreset', name)
  },

  savePreset: (config: any): Promise<IpcResponse> => {
    return ipcRenderer.invoke('excel-merge:savePreset', config)
  },

  deletePreset: (name: string): Promise<IpcResponse> => {
    return ipcRenderer.invoke('excel-merge:deletePreset', name)
  },

  // 字段发现
  getColumns: (filePath: string): Promise<IpcResponse<string[]>> => {
    return ipcRenderer.invoke('excel-merge:getColumns', filePath)
  },

  // 合并执行
  merge: (params: any): Promise<IpcResponse<any>> => {
    return ipcRenderer.invoke('excel-merge:merge', params)
  },

  onProgress: (callback: (progress: any) => void): (() => void) => {
    const handler = (_event: unknown, progress: any) => callback(progress)
    ipcRenderer.on('excel-merge:progress', handler)
    return () => {
      ipcRenderer.removeListener('excel-merge:progress', handler)
    }
  },

  cancel: (): Promise<IpcResponse> => {
    return ipcRenderer.invoke('excel-merge:cancel')
  }
},
```

### 6.5 类型声明（增量添加到 `electron.d.ts`）

在 `Window.electronAPI` 类型中添加：

```typescript
excelMerge: {
  listPresets: () => Promise<IpcResponse<any[]>>
  getPreset: (name: string) => Promise<IpcResponse<any>>
  savePreset: (config: any) => Promise<IpcResponse>
  deletePreset: (name: string) => Promise<IpcResponse>
  getColumns: (filePath: string) => Promise<IpcResponse<string[]>>
  merge: (params: any) => Promise<IpcResponse<any>>
  onProgress: (callback: (progress: any) => void) => () => void
  cancel: () => Promise<IpcResponse>
}
```

### 6.6 IPC 注册（增量修改 `main/ipc/index.ts`）

```typescript
// 1. 添加 import
import { registerExcelMergeHandlers } from '../modules/excelMerge'

// 2. 在 registerIpcHandlers 函数中添加
export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ... 现有注册
  registerExcelMergeHandlers(mainWindow)
  // ...
}
```

### 6.7 模块注册（增量修改 `moduleRegistry.tsx`）

将 `excel-merge` 条目的 `enabled` 改为 `true`，删除 `badge`：

```typescript
{
  id: 'excel-merge',
  name: 'Excel批量合并',
  icon: ExcelIcon,
  description: '多表关联合并，支持预设记忆',
  enabled: true,
},
```

### 6.8 路由（增量修改 `App.tsx`）

```typescript
// 1. 添加 import
import ExcelMergePage from './pages/ExcelMergePage'

// 2. 修改 switch case
case 'excel-merge':
  return <ExcelMergePage />
  // 删除原来的 PlaceholderPage
```

### 6.9 打包配置（增量修改 `electron-builder.config.js`）

在 `files` 数组中添加 exceljs 及其依赖：

```javascript
files: [
  // ... 现有
  'node_modules/exceljs/**/*',
  'node_modules/jszip/**/*',        // exceljs 的依赖
  'node_modules/archiver/**/*',     // exceljs 的依赖（可选）
  'node_modules/fast-csv/**/*',     // exceljs 的依赖（可选）
],
```

> **注意**：安装 exceljs 后运行 `npm ls exceljs` 确认实际依赖树，可能需要补充其他间接依赖。

---

## 七、前端页面规格（`ExcelMergePage.tsx`）

### 7.1 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  预设管理栏                                                    │
│  [预设下拉框 ▼] [加载] [另存为...] [删除] [新建空白配置]           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ 订单文件区 ───────────────────────────────────────────┐  │
│  │  [选择文件] [选择文件夹]                                  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ 文件1.xlsx                              [删除]    │  │  │
│  │  │ 文件2.xlsx                              [删除]    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  合计：2 个文件                                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 辅助表配置区 ─────────────────────────────────────────┐  │
│  │  [+ 添加辅助表]                                         │  │
│  │                                                         │  │
│  │  ┌─ 辅助表1：产品信息 ──────────────────────────────┐ │  │
│  │  │ 文件：[选择文件] 辅助表-产品信息.xlsx              │ │  │
│  │  │ 连接方式：[left ▼]                                │ │  │
│  │  │ 匹配字段：                                        │ │  │
│  │  │   订单表 [商品编号 ▼]  ←→  辅助表 [商品编号 ▼]  [删除]│ │  │
│  │  │   [+ 添加匹配字段]                                │ │  │
│  │  │                                        [删除辅助表] │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │                                                         │  │
│  │  ┌─ 辅助表2：仓库 ─────────────────────────────────┐ │  │
│  │  │ ...                                              │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 输出与执行区 ─────────────────────────────────────────┐  │
│  │  输出目录：[D:\xxx           ] [浏览...]                 │  │
│  │  输出文件名：[整理后采购单.xlsx]                        │  │
│  │  文本列：[采购单号]  [+添加]                            │  │
│  │                                                        │  │
│  │  [开始合并]                                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 进度日志区 ───────────────────────────────────────────┐  │
│  │  ████████████████░░░░░  75%                            │  │
│  │  > 读取订单文件：文件1.xlsx (120行)                     │  │
│  │  > 合并产品信息表：匹配 118/120 行                      │  │
│  │  > ...                                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 状态管理

```typescript
// 预设
const [presetName, setPresetName] = useState('')           // 当前预设名
const [presetList, setPresetList] = useState<PresetListItem[]>([])

// 订单文件
const [orderFiles, setOrderFiles] = useState<{id: string; path: string; name: string}[]>([])

// 辅助表配置
const [auxTables, setAuxTables] = useState<AuxTableConfig[]>([])

// 辅助表文件路径（id → filePath）
const [auxFilePaths, setAuxFilePaths] = useState<Record<string, string>>({})

// 订单表列名（选择第一个订单文件后自动读取）
const [orderColumns, setOrderColumns] = useState<string[]>([])

// 各辅助表的列名（id → string[]）
const [auxColumnsMap, setAuxColumnsMap] = useState<Record<string, string[]>>({})

// 文本列
const [textColumns, setTextColumns] = useState<string[]>([])

// 输出
const [outputDir, setOutputDir] = useState('')
const [outputFileName, setOutputFileName] = useState('合并结果.xlsx')

// 执行状态
const [isMerging, setIsMerging] = useState(false)
const [progress, setProgress] = useState<ExcelMergeProgress | null>(null)
const [result, setResult] = useState<ExcelMergeResult | null>(null)
const [error, setError] = useState('')
const [toast, setToast] = useState<{type: 'success' | 'error'; msg: string} | null>(null)

// 拖拽
const [isDragging, setIsDragging] = useState(false)
```

### 7.3 关键交互逻辑

**选择订单文件后自动读取列名**：
```typescript
const handleSelectOrderFiles = async () => {
  const result = await window.electronAPI.dialog.openFiles({
    filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
    multiSelections: true
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const newFiles = result.filePaths.map(fp => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      path: fp,
      name: fp.split(/[/\\]/).pop() || fp
    }))
    setOrderFiles([...orderFiles, ...newFiles])

    // 读取第一个文件的列名（如果还没有列名）
    if (orderColumns.length === 0) {
      const res = await window.electronAPI.excelMerge.getColumns(result.filePaths[0])
      if (res.success && res.data) {
        setOrderColumns(res.data)
      }
    }
  }
}
```

**添加辅助表**：
```typescript
const handleAddAuxTable = () => {
  const newTable: AuxTableConfig = {
    id: `aux-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: `辅助表${auxTables.length + 1}`,
    fileName: '',
    matchPairs: [{ orderCol: '', auxCol: '' }],
    how: 'left'
  }
  setAuxTables([...auxTables, newTable])
}
```

**选择辅助表文件后读取列名**：
```typescript
const handleSelectAuxFile = async (auxId: string) => {
  const result = await window.electronAPI.dialog.openFiles({
    filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
    multiSelections: false
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const fp = result.filePaths[0]
    const fileName = fp.split(/[/\\]/).pop() || fp

    // 更新辅助表文件名
    setAuxTables(prev => prev.map(t =>
      t.id === auxId ? { ...t, fileName, name: fileName.replace(/\.xlsx?$/, '') } : t
    ))
    setAuxFilePaths(prev => ({ ...prev, [auxId]: fp }))

    // 读取列名
    const res = await window.electronAPI.excelMerge.getColumns(fp)
    if (res.success && res.data) {
      setAuxColumnsMap(prev => ({ ...prev, [auxId]: res.data! }))
    }
  }
}
```

**保存预设**：
```typescript
const handleSavePreset = async (name: string) => {
  const config: PresetConfig = {
    name,
    orderSubFolder: '',   // 桌面软件不强制子文件夹结构
    auxSubFolder: '',
    textColumns,
    auxiliaryTables: auxTables,
    outputFileName
  }
  const res = await window.electronAPI.excelMerge.savePreset(config)
  if (res.success) {
    setToast({ type: 'success', msg: `预设"${name}"已保存` })
    refreshPresetList()
  } else {
    setToast({ type: 'error', msg: res.error || '保存失败' })
  }
}
```

**加载预设**：
```typescript
const handleLoadPreset = async (name: string) => {
  const res = await window.electronAPI.excelMerge.getPreset(name)
  if (res.success && res.data) {
    const config = res.data as PresetConfig
    setPresetName(name)
    setAuxTables(config.auxiliaryTables || [])
    setTextColumns(config.textColumns || [])
    setOutputFileName(config.outputFileName || '合并结果.xlsx')
    setToast({ type: 'success', msg: `已加载预设"${name}"` })
  }
}
```

**执行合并**：
```typescript
const handleMerge = async () => {
  // 验证
  if (orderFiles.length === 0) {
    setToast({ type: 'error', msg: '请先选择订单文件' })
    return
  }
  if (auxTables.length === 0) {
    setToast({ type: 'error', msg: '请至少添加一个辅助表' })
    return
  }
  for (const aux of auxTables) {
    if (!auxFilePaths[aux.id]) {
      setToast({ type: 'error', msg: `辅助表"${aux.name}"未选择文件` })
      return
    }
    for (const pair of aux.matchPairs) {
      if (!pair.orderCol || !pair.auxCol) {
        setToast({ type: 'error', msg: `辅助表"${aux.name}"有未完成的匹配字段` })
        return
      }
    }
  }

  setIsMerging(true)
  setError('')
  setResult(null)

  const params: MergeParams = {
    orderFilePaths: orderFiles.map(f => f.path),
    auxFilePaths,
    config: {
      name: presetName || '临时配置',
      orderSubFolder: '',
      auxSubFolder: '',
      textColumns,
      auxiliaryTables: auxTables,
      outputFileName
    },
    outputDir
  }

  const res = await window.electronAPI.excelMerge.merge(params)
  setIsMerging(false)

  if (res.success && res.data) {
    setResult(res.data)
    setToast({ type: 'success', msg: '合并完成！' })
  } else {
    setError(res.error || '合并失败')
    setToast({ type: 'error', msg: res.error || '合并失败' })
  }
}
```

### 7.4 样式要求

- 使用 Tailwind CSS，与现有页面风格一致（白底、圆角卡片、灰色边框）
- 辅助表卡片：白底 + border + rounded-lg + shadow-sm
- 按钮主色：蓝色 (bg-blue-500 text-white hover:bg-blue-600)
- 进度条：绿色 (bg-green-500)
- 错误提示：红色 (bg-red-50 text-red-600)
- 成功提示：绿色 (bg-green-50 text-green-600)
- 拖拽区域：虚线边框 (border-2 border-dashed border-gray-300)

### 7.5 默认值

- 输出目录：默认桌面路径（`await window.electronAPI.app.getPath('desktop')`）
- 输出文件名：`合并结果.xlsx`
- 连接方式：`left`（左连接）
- 进度监听：`useRef` 管理 unsubscribe，组件卸载时清理

---

## 八、开发任务列表

| # | 任务 | 文件 | 依赖 | 说明 |
|---|------|------|------|------|
| 1 | 安装 exceljs 依赖 | `package.json` | 无 | `npm install exceljs` |
| 2 | 创建类型定义 | `excelMerge/types.ts` | 无 | 第六节 5.1 的完整类型 |
| 3 | 实现预设管理器 | `excelMerge/presetManager.ts` | #2 | 第六节 6.1 的完整代码 |
| 4 | 实现合并引擎 | `excelMerge/service.ts` | #2 | 第六节 6.2 的完整代码 |
| 5 | 实现 IPC handlers | `excelMerge/index.ts` | #3,#4 | 第六节 6.3 的完整代码 |
| 6 | 注册 IPC | `main/ipc/index.ts` | #5 | 增量修改，添加 import 和调用 |
| 7 | 添加 IPC 类型 | `main/ipc/types.ts` | #2 | 增量修改，重导出模块类型 |
| 8 | 暴露 Preload API | `preload/index.ts` | #5 | 增量修改，添加 excelMerge 对象 |
| 9 | 添加类型声明 | `renderer/types/electron.d.ts` | #8 | 增量修改，添加 excelMerge 类型 |
| 10 | 实现前端页面 | `renderer/pages/ExcelMergePage.tsx` | #8,#9 | 第七节的完整规格 |
| 11 | 启用模块注册 | `renderer/components/moduleRegistry.tsx` | 无 | enabled: true，删除 badge |
| 12 | 接入路由 | `renderer/App.tsx` | #10 | import + switch case |
| 13 | 打包配置 | `electron-builder.config.js` | #1 | files 白名单添加 exceljs 依赖 |
| 14 | 版本号递增 | `package.json` + `Sidebar.tsx` | 全部完成 | 2.6.0 → 2.7.0 |

---

## 九、验收标准

### 9.1 功能验收

| # | 验收点 | 验证方法 |
|---|--------|---------|
| 1 | 选择多个订单 Excel 文件，能正确读取并合并行 | 选 2 个订单文件，合并后行数 = 两个文件行数之和 |
| 2 | 添加辅助表后能读取列名 | 选择辅助表文件后，下拉框显示列名 |
| 3 | 单字段匹配正确 | 按"商品编号"匹配，合并后辅助表列正确附加 |
| 4 | 多字段联合匹配正确 | 按两个字段联合匹配，只有两字段都相同才匹配 |
| 5 | left join 保留未匹配行 | 未匹配的订单行保留，辅助表字段为空 |
| 6 | inner join 丢弃未匹配行 | 未匹配的订单行不出现 |
| 7 | 多个辅助表顺序合并 | 先合并产品表，再合并仓库表，列正确累积 |
| 8 | 列名冲突自动加后缀 | 订单表和辅助表都有"配送中心"时，辅助表的变为"配送中心_仓库名" |
| 9 | 文本列强制转文本 | "采购单号"列的数字被正确转为文本 |
| 10 | 预设保存和加载 | 保存配置 → 重启应用 → 加载预设，配置完整恢复 |
| 11 | 预设删除 | 删除预设后不再出现在列表中 |
| 12 | 输出文件可正常打开 | 用 Excel/WPS 打开输出文件，数据完整 |
| 13 | 进度回调正常 | 合并过程中显示进度条和日志 |
| 14 | 取消功能 | 合并过程中点取消，能中断操作 |

### 9.2 打包验收

| # | 验收点 |
|---|--------|
| 1 | `npm run build` 成功，无错误 |
| 2 | 安装包能正常安装 |
| 3 | 安装后 Excel 合并功能可用（不报找不到 exceljs） |

---

## 十、注意事项

### 10.1 exceljs 依赖打包

`exceljs` 依赖 `jszip`、`archiver` 等包。安装后需确认依赖树：

```bash
npm ls exceljs
```

在 `electron-builder.config.js` 的 `files` 数组中添加所有运行时需要的依赖。如果打包后运行报 `Cannot find module 'xxx'`，将该模块添加到 files 白名单。

### 10.2 exceljs 读取注意事项

- `exceljs` 是 ESM/CJS 混合包，在 Electron 主进程中用 `import ExcelJS from 'exceljs'` 或 `const ExcelJS = require('exceljs')` 均可
- 单元格值可能是对象类型（如 `{ text: 'xxx' }` 或 `{ result: 123 }`），需要处理
- 大文件读取可能较慢，建议对 10MB 以上文件显示进度提示

### 10.3 join 逻辑注意事项

- 匹配前必须对双方字段值做 `String().trim()` 清洗，避免空格导致匹配失败
- 匹配字段值组合用 `\x00`（null 字符）分隔，避免字段值本身包含分隔符
- 一对多匹配（一个订单行匹配多个辅助表行）时，每个匹配生成一行结果
- 列名冲突时加 `_{辅助表名}` 后缀，避免覆盖

### 10.4 预设存储注意事项

- 预设文件路径：`app.getPath('userData')/excel-merge-presets.json`
- 该目录在 Windows 下通常为 `C:\Users\<用户名>\AppData\Roaming\离线办公工具\`
- 预设文件是 JSON 格式，可手动编辑
- 预设只存储文件名和匹配配置，不存储文件内容

### 10.5 前端注意事项

- 辅助表卡片的匹配字段下拉框需要联动：选择订单表列名后，辅助表列名下拉框也应可选
- 拖拽上传支持 .xlsx 和 .xls 文件
- 合并执行中禁用所有操作按钮
- Toast 提示 4 秒自动消失（与现有页面一致）

---

## 十一、现有代码关键文件路径

供开发时参考：

```
项目根目录: D:\111111vc

后端（主进程）:
  src-electron/main/index.ts                    # Electron 主进程入口
  src-electron/main/ipc/index.ts                # IPC 注册中心（增量修改）
  src-electron/main/ipc/types.ts                # IPC 类型定义（增量修改）
  src-electron/main/modules/pdfMerge/           # PDF合并模块（参考模板）
    ├── index.ts                                # IPC handlers 注册模式参考
    └── service.ts                              # Service 编写模式参考

预加载:
  src-electron/preload/index.ts                 # Preload API（增量修改）

前端（渲染进程）:
  src-electron/renderer/App.tsx                 # 路由（增量修改）
  src-electron/renderer/pages/PdfMergePage.tsx  # 页面编写模式参考
  src-electron/renderer/pages/PdfSplitPage.tsx  # 更复杂的页面参考
  src-electron/renderer/components/moduleRegistry.tsx  # 模块注册（增量修改）
  src-electron/renderer/components/Sidebar.tsx  # 侧边栏（含版本号）
  src-electron/renderer/types/electron.d.ts     # 类型声明（增量修改）

打包配置:
  electron-builder.config.js                    # 打包配置（增量修改）
  package.json                                  # 依赖 + 版本号
```

---

## 十二、参考数据：京东万商业务场景

以下为原始 Python 代码中的默认配置，可作为第一个预设的参考：

```json
{
  "name": "京东万商",
  "orderSubFolder": "1 平台采购订单",
  "auxSubFolder": "2 辅助表",
  "textColumns": ["采购单号"],
  "auxiliaryTables": [
    {
      "id": "aux-product",
      "name": "产品信息",
      "fileName": "辅助表-产品信息.xlsx",
      "matchPairs": [
        { "orderCol": "商品编号", "auxCol": "商品编号" }
      ],
      "how": "left"
    },
    {
      "id": "aux-warehouse",
      "name": "仓库",
      "fileName": "辅助表-仓库.xlsx",
      "matchPairs": [
        { "orderCol": "配送中心", "auxCol": "配送中心" }
      ],
      "how": "left"
    }
  ],
  "outputFileName": "整理后采购单.xlsx"
}
```

**注意**：桌面软件版本中，用户手动选择文件路径，`orderSubFolder` 和 `auxSubFolder` 仅作为预设信息保留，不强制文件夹结构。
