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
 * 写入 Excel 工作簿到目标路径（先写 temp 再拷贝，避免安全软件拦截）
 */
async function writeWorkbookSafe(wb: ExcelJS.Workbook, targetPath: string): Promise<void> {
  const tmpDir = path.join(require('electron').app.getPath('temp'), 'excel-merge-write-cache')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const tmpPath = path.join(tmpDir, `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`)
  try {
    await wb.xlsx.writeFile(tmpPath)
    fs.copyFileSync(tmpPath, targetPath)
  } finally {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}

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
      // exceljs 的 getCell 是 1-based，第一列是 getCell(1)
      const cell = row.getCell(i + 1)
      const val = cell.value
      // 处理 exceljs 的单元格值类型
      let processedVal: any = val
      if (val && typeof val === 'object' && 'text' in val) {
        processedVal = (val as any).text
      } else if (val && typeof val === 'object' && 'result' in val) {
        processedVal = (val as any).result
      } else if (val && typeof val === 'object' && 'richText' in val) {
        // 富文本类型：拼接所有 run 的 text
        processedVal = (val as any).richText.map((run: any) => run.text || '').join('')
      } else if (val && typeof val === 'object' && 'hyperlink' in val) {
        // 超链接类型
        processedVal = (val as any).text || (val as any).hyperlink
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

  await writeWorkbookSafe(wb, outputPath)

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
