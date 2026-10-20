/**
 * Excel 合并核心服务
 * 使用 exceljs 读取 Excel → 数据 join → 输出 Excel
 *
 * 读表 / 取值 / 清洗 / 写盘等通用逻辑见 ../../shared/excel。
 */
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import { clean, readColumnsAtRow, readTable, readWorkbookMeta, writeWorkbookSafe } from '../../shared/excel'
import type { WorkbookMeta } from '../../shared/excel'
import type {
  MergeParams,
  JoinAuxParams,
  ExcelMergeProgress,
  ExcelMergeResult,
  AuxTableConfig,
  ComputedField
} from './types'

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
    const key = matchPairs.map(p => clean(row[p.auxCol])).join('\x00')
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
export function leftJoin(
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
    const key = matchPairs.map(p => clean(orderRow[p.orderCol])).join('\x00')
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

/** 进度步数上下文（跨函数共享计数） */
interface ProgressCtx {
  current: number
  total: number
}

/**
 * 读取辅助表并逐一 left join 到订单行
 * （第 1+2 步合并执行与第 2 步独立执行共用）
 */
async function joinAuxTables(
  orderRows: Record<string, any>[],
  auxFilePaths: Record<string, string>,
  auxiliaryTables: AuxTableConfig[],
  onProgress: (progress: ExcelMergeProgress) => void,
  ctx: ProgressCtx
): Promise<{ rows: Record<string, any>[]; matched: number; unmatched: number }> {
  // 订单表侧的匹配字段只清洗一次（原先按辅助表数量重复全表遍历）
  const orderMatchCols = new Set<string>()
  for (const aux of auxiliaryTables) {
    for (const pair of aux.matchPairs) {
      if (pair.orderCol) orderMatchCols.add(pair.orderCol)
    }
  }
  for (const col of orderMatchCols) {
    for (const row of orderRows) {
      if (col in row) row[col] = clean(row[col])
    }
  }

  let totalMatched = 0
  let totalUnmatched = 0

  for (let i = 0; i < auxiliaryTables.length; i++) {
    const auxConfig: AuxTableConfig = auxiliaryTables[i]
    const auxFilePath = auxFilePaths[auxConfig.id]

    if (!auxFilePath || !fs.existsSync(auxFilePath)) {
      throw new Error(`辅助表文件不存在: ${auxConfig.fileName}`)
    }

    onProgress({
      step: `合并辅助表 (${i + 1}/${auxiliaryTables.length})`,
      currentTable: auxConfig.name,
      currentTableIndex: i + 1,
      totalTables: auxiliaryTables.length,
      overallProgress: Math.round((ctx.current / ctx.total) * 100),
      status: 'merging',
      message: `正在读取辅助表: ${auxConfig.fileName}`
    })

    const { rows: auxRows } = await readTable(auxFilePath)
    ctx.current++

    // 清洗本辅助表的匹配字段
    for (const pair of auxConfig.matchPairs) {
      if (!pair.auxCol) continue
      for (const row of auxRows) {
        if (pair.auxCol in row) {
          row[pair.auxCol] = clean(row[pair.auxCol])
        }
      }
    }

    onProgress({
      step: `合并辅助表 (${i + 1}/${auxiliaryTables.length})`,
      currentTable: auxConfig.name,
      currentTableIndex: i + 1,
      totalTables: auxiliaryTables.length,
      overallProgress: Math.round((ctx.current / ctx.total) * 100),
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
    ctx.current++
  }

  return { rows: orderRows, matched: totalMatched, unmatched: totalUnmatched }
}

/**
 * 收集全部列名并写入结果 Excel（共用）
 */
async function writeResultFile(
  rows: Record<string, any>[],
  outputDir: string,
  outputFileName: string,
  onProgress: (progress: ExcelMergeProgress) => void,
  ctx: ProgressCtx
): Promise<{ outputPath: string; columns: string[] }> {
  // 收集所有列名（保持顺序）
  const allColumnsSet = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allColumnsSet.add(key)
    }
  }
  const allColumns = Array.from(allColumnsSet)

  onProgress({
    step: '写入结果文件',
    currentTable: '输出',
    currentTableIndex: 0,
    totalTables: 1,
    overallProgress: Math.round((ctx.current / ctx.total) * 100),
    status: 'writing',
    message: `正在写入 ${rows.length} 行数据到 Excel...`
  })

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, outputFileName)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('合并结果')

  // 写表头
  ws.columns = allColumns.map(col => ({
    header: col,
    key: col,
    width: Math.max(col.length * 2 + 4, 12)
  }))

  // 写数据行
  for (const row of rows) {
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

  await writeWorkbookSafe(wb, outputPath)
  ctx.current++

  return { outputPath, columns: allColumns }
}

/**
 * 主函数：执行 Excel 合并
 */
export async function mergeExcelData(
  params: MergeParams,
  onProgress: (progress: ExcelMergeProgress) => void
): Promise<ExcelMergeResult> {
  const { orderFilePaths, auxFilePaths, config, outputDir } = params

  if (orderFilePaths.length === 0) {
    throw new Error('没有选择订单文件')
  }

  const totalSteps = 1 + orderFilePaths.length + config.auxiliaryTables.length * 2 + 1
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
    const filePath = orderFilePaths[i]
    if (!fs.existsSync(filePath)) {
      throw new Error(`订单文件不存在: ${filePath}`)
    }

    const { columns, rows } = await readTable(filePath)

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
            row[col] = clean(row[col])
          }
        }
      }
    }
  }

  // ─── 3. 读取辅助表并逐一 join ───
  const ctx: ProgressCtx = { current: currentStep, total: totalSteps }
  const joinResult = await joinAuxTables(orderRows, auxFilePaths, config.auxiliaryTables, onProgress, ctx)
  orderRows = joinResult.rows

  // ─── 4~5. 收集列名并写入输出文件 ───
  const { outputPath, columns: allColumns } = await writeResultFile(
    orderRows,
    outputDir,
    config.outputFileName || '合并结果.xlsx',
    onProgress,
    ctx
  )

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
    matchedCount: joinResult.matched,
    unmatchedCount: joinResult.unmatched
  }
}

// ═══════════════════════════════════════════════════════════════
// 计算字段：四则运算生成新列
// ═══════════════════════════════════════════════════════════════

/** 参与计算的值转数字：文本数字可解析，空单元格 / 无法解析的按 0 处理 */
export function toComputeNumber(val: any): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  const n = Number(String(val ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

/**
 * 按链式顺序计算一个计算字段在某行的值：
 * ((第1项 op 第2项) op 第3项 ...)，从上到下依次计算，不做乘除优先。
 * 除以 0 等非法结果返回 ''（留空）。
 */
export function evalComputedField(f: ComputedField, row: Record<string, any>): number | '' {
  if (f.items.length === 0) return ''
  let acc = toComputeNumber(row[f.items[0].col])
  for (let i = 1; i < f.items.length; i++) {
    const v = toComputeNumber(row[f.items[i].col])
    switch (f.items[i].op) {
      case '+': acc = acc + v; break
      case '-': acc = acc - v; break
      case '*': acc = acc * v; break
      case '/':
        if (v === 0) return ''
        acc = acc / v
        break
      default: return ''
    }
  }
  if (!Number.isFinite(acc)) return ''
  // 抹平浮点噪声（0.1+0.2 → 0.3）
  return Math.round(acc * 1e10) / 1e10
}

/** 把计算字段作为新列写入所有行（写盘前调用，列名会被 writeResultFile 自动收集） */
export function applyComputedFields(rows: Record<string, any>[], computedFields: ComputedField[]): void {
  for (const f of computedFields) {
    const name = f.name.trim()
    if (!name) continue
    for (const row of rows) {
      row[name] = evalComputedField(f, row)
    }
  }
}

/**
 * 第 2 步独立执行：读取「合并原表」产物，逐一 join 辅助表并写出最终结果
 */
export async function joinAuxExcelData(
  params: JoinAuxParams,
  onProgress: (progress: ExcelMergeProgress) => void
): Promise<ExcelMergeResult> {
  const { inputPath, auxFilePaths, config, outputDir } = params

  if (!fs.existsSync(inputPath)) {
    throw new Error(`合并原表文件不存在: ${inputPath}`)
  }
  if (config.auxiliaryTables.length === 0) {
    throw new Error('没有配置辅助表')
  }

  const totalSteps = 1 + config.auxiliaryTables.length * 2 + 1
  const ctx: ProgressCtx = { current: 0, total: totalSteps }

  // ─── 1. 读取合并原表 ───
  onProgress({
    step: '读取合并原表',
    currentTable: path.basename(inputPath),
    currentTableIndex: 0,
    totalTables: totalSteps,
    overallProgress: 0,
    status: 'reading',
    message: '正在读取合并原表...'
  })

  const { rows: inputRows } = await readTable(inputPath)
  let orderRows = inputRows
  ctx.current++

  // ─── 2. 强制文本列转换（防止中间产物读回后格式丢失）───
  if (config.textColumns && config.textColumns.length > 0) {
    for (const col of config.textColumns) {
      for (const row of orderRows) {
        if (col in row) {
          row[col] = clean(row[col])
        }
      }
    }
  }

  // ─── 3. 读取辅助表并逐一 join ───
  const joinResult = await joinAuxTables(orderRows, auxFilePaths, config.auxiliaryTables, onProgress, ctx)
  orderRows = joinResult.rows

  // ─── 3.5 计算字段：对合并结果做四则运算，追加新列 ───
  if (params.computedFields && params.computedFields.length > 0) {
    applyComputedFields(orderRows, params.computedFields)
  }

  // ─── 4. 收集列名并写入输出文件 ───
  const outputFileName = params.outputFileName || config.outputFileName || '合并结果.xlsx'
  const { outputPath, columns: allColumns } = await writeResultFile(
    orderRows,
    outputDir,
    outputFileName,
    onProgress,
    ctx
  )

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
    matchedCount: joinResult.matched,
    unmatchedCount: joinResult.unmatched
  }
}

/**
 * 读取 Excel 列名（用于前端字段选择下拉框）
 */
export async function getExcelColumns(filePath: string): Promise<string[]> {
  return readColumnsAtRow(filePath, 1)
}

/**
 * 读取表格文件元信息：全部工作表名 + 第一张表的首行列名。
 * 用于第 1 步合并前检测「工作表名不一致 / 各文件字段不一致」。
 */
export async function getExcelFileInfo(filePath: string): Promise<WorkbookMeta> {
  return readWorkbookMeta(filePath)
}
