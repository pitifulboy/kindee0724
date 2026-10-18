/**
 * 金蝶导入核心服务（六步流水线）
 *
 * 步骤：step1 订单拆分 → step2a Join → step2b 删未匹配 → step2c 填充 → step2d 恢复结构 → step3 汇总
 * 通用 Excel 读表 / 取值 / 清洗 / 写盘逻辑见 ../../shared/excel。
 */
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import {
  clean,
  strictKey,
  readTable,
  readColumnsAtRow,
  readTemplate,
  readHeaderRow,
  readRowValues,
  resolveWritableDir,
  writeWorkbookSafe,
} from '../../shared/excel'
import { applyTransforms } from './transform'
import type { TransformRule } from './transform'
import type { FieldMapping, SeqConfig } from './types'

// ═══════════════════════════════════════════════════════════════
// 列名读取（前端字段下拉）
// ═══════════════════════════════════════════════════════════════

export async function getTable1Columns(filePath: string): Promise<string[]> {
  return readColumnsAtRow(filePath, 1)
}

export async function getTemplateColumns(filePath: string, headerRowIndex: number): Promise<string[]> {
  return readColumnsAtRow(filePath, headerRowIndex)
}

// ═══════════════════════════════════════════════════════════════
// Step 1：按拆分依据分组，逐组输出订单文件
// ═══════════════════════════════════════════════════════════════

interface Step1Output {
  outputPath: string
  orderFiles: { orderKey: string; billNo: number; filePath: string; rowCount: number }[]
  totalOrders: number
  table1Columns: string[]
  fallbackWarning?: string
}

export async function step1SplitOrders(
  table1Path: string,
  groupByColumn: string,
  startBillNo: number,
  billNoStep: number,
  billNoBaseField: string,
  outputDir: string
): Promise<Step1Output> {
  const { columns: table1Cols, rows: table1Rows } = await readTable(table1Path)

  const groups = new Map<string, Record<string, any>[]>()
  for (const row of table1Rows) {
    const key = clean(row[groupByColumn])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  // 按 billNoBaseField 排序分组（使编号顺序可预测）
  const groupEntries = [...groups.entries()]
  if (billNoBaseField) {
    groupEntries.sort((a, b) => {
      const va = clean(a[1][0]?.[billNoBaseField] ?? '')
      const vb = clean(b[1][0]?.[billNoBaseField] ?? '')
      return va.localeCompare(vb)
    })
  }

  const orderFiles: { orderKey: string; billNo: number; filePath: string; rowCount: number }[] = []
  let currentBillNo = startBillNo

  const { dir: stepDir, fallbackUsed: dirFallback } = await resolveWritableDir(outputDir, '步骤1_订单拆分')

  for (const [orderKey, items] of groupEntries) {
    const billNo = currentBillNo
    currentBillNo += billNoStep
    const orderFile = path.join(stepDir, `订单_${orderKey}_${billNo}.xlsx`)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('订单数据')

    ws.addRow(table1Cols)
    for (const item of items) {
      ws.addRow(table1Cols.map(col => item[col] ?? ''))
    }
    // 单号标记行：与表头列数对齐（列数 < 4 时落在最后一列），避免表头列数变化时错列
    const marker = table1Cols.map(() => '')
    if (marker.length > 0) marker[Math.min(3, marker.length - 1)] = `单号: ${billNo}`
    ws.addRow(marker)

    await writeWorkbookSafe(wb, orderFile)
    orderFiles.push({ orderKey, billNo, filePath: orderFile, rowCount: items.length })
  }

  const summaryFile = path.join(stepDir, '订单拆分汇总.xlsx')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('订单汇总')
  ws.addRow(['订单标识', '新单号', '明细行数', '文件路径'])
  for (const order of orderFiles) {
    ws.addRow([order.orderKey, order.billNo, order.rowCount, order.filePath])
  }

  await writeWorkbookSafe(wb, summaryFile)

  const fallbackWarning1 = dirFallback ? `步骤1输出目录不可写入，已回退至: ${stepDir}` : undefined

  return { outputPath: summaryFile, orderFiles, totalOrders: groups.size, table1Columns: table1Cols, fallbackWarning: fallbackWarning1 }
}

// ═══════════════════════════════════════════════════════════════
// Step 2a：模板表 LEFT JOIN 拆分明细表
// ═══════════════════════════════════════════════════════════════

interface Step2aOutput {
  outputPath: string
  totalRows: number
  matchedCount: number
  unmatchedCount: number
  fallbackWarning?: string
}

export async function step2aJoin(
  table1Path: string,
  table2Path: string,
  groupByColumn: string,
  matchFieldTable1: string,
  matchFieldTable2: string,
  startBillNo: number,
  billNoStep: number,
  billNoBaseField: string,
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  outputDir: string
): Promise<Step2aOutput> {
  const { rows: table1Rows } = await readTable(table1Path)
  const { colMap, allRows, columns: table2Cols } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  const templateMatchColIdx = colMap[matchFieldTable2]
  if (templateMatchColIdx === undefined) {
    throw new Error(`模板表中未找到匹配字段: ${matchFieldTable2}`)
  }

  const templateDataStart = templateDataStartRowIndex - 1
  const templateRows: Record<string, any>[] = []
  for (let i = templateDataStart; i < allRows.length; i++) {
    const row = allRows[i]
    const rowData: Record<string, any> = {}
    Object.keys(colMap).forEach(col => {
      rowData[col] = row[colMap[col]] ?? ''
    })
    templateRows.push(rowData)
  }

  const groups = new Map<string, Record<string, any>[]>()
  for (const row of table1Rows) {
    const key = clean(row[groupByColumn])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  // Build per-group data lookup map: matchFieldTable1 value -> data items[]
  const groupDataMap = new Map<string, Map<string, Record<string, any>[]>>()
  // 记录每组首行（排序用），避免排序比较器内 Array.find 造成的 O(n²)
  const groupFirstRow = new Map<string, Record<string, any>>()
  for (const [orderKey, items] of groups) {
    groupFirstRow.set(orderKey, items[0] ?? {})
    const dataMap = new Map<string, Record<string, any>[]>()
    for (const item of items) {
      const key = strictKey(item[matchFieldTable1])
      if (!dataMap.has(key)) dataMap.set(key, [])
      dataMap.get(key)!.push(item)
    }
    groupDataMap.set(orderKey, dataMap)
  }

  // 按 billNoBaseField 排序分组（O(n log n)）
  const sortedGroupEntries = [...groupDataMap.entries()]
  if (billNoBaseField) {
    sortedGroupEntries.sort((a, b) => {
      const va = clean(groupFirstRow.get(a[0])?.[billNoBaseField] ?? '')
      const vb = clean(groupFirstRow.get(b[0])?.[billNoBaseField] ?? '')
      return va.localeCompare(vb)
    })
  }

  const dataCols = table1Rows.length > 0 ? Object.keys(table1Rows[0]) : []
  const headers = [...table2Cols, ...dataCols, '_orderKey', '_billNo', '_matchStatus']

  let matchedCount = 0
  let unmatchedCount = 0
  let currentBillNo = startBillNo
  const rows: any[][] = []

  for (const [orderKey, dataMap] of sortedGroupEntries) {
    const billNo = currentBillNo
    currentBillNo += billNoStep
    // Template is the LEFT table: iterate over template rows
    for (const tmplRow of templateRows) {
      const matchValue = strictKey(tmplRow[matchFieldTable2])
      const matchingDataItems = matchValue ? (dataMap.get(matchValue) || []) : []

      if (matchingDataItems.length > 0) {
        matchedCount++
        for (const item of matchingDataItems) {
          const row: any[] = []
          // Template columns (left side)
          for (const col of table2Cols) {
            row.push(tmplRow[col] ?? '')
          }
          // Data columns (right side)
          for (const col of dataCols) {
            row.push(item[col] ?? '')
          }
          row.push(orderKey, billNo, '匹配成功')
          rows.push(row)
        }
      } else if (matchValue) {
        // 模板字段有值但未匹配到：标记未匹配
        unmatchedCount++
        const row: any[] = []
        for (const col of table2Cols) {
          row.push(tmplRow[col] ?? '')
        }
        for (const _col of dataCols) {
          row.push('')
        }
        row.push(orderKey, billNo, '未匹配')
        rows.push(row)
      } else {
        // 模板字段为空：辅助字段也留空
        const row: any[] = []
        for (const col of table2Cols) {
          row.push(tmplRow[col] ?? '')
        }
        for (const _col of dataCols) {
          row.push('')
        }
        row.push('', '', '')
        rows.push(row)
      }
    }
  }

  const { dir: stepDir, fallbackUsed } = await resolveWritableDir(outputDir, '步骤2a_Join结果')
  const outputPath = path.join(stepDir, 'join结果.xlsx')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Join结果')
  ws.addRow(headers)
  for (const row of rows) {
    ws.addRow(row)
  }
  await writeWorkbookSafe(wb, outputPath)

  return { outputPath, totalRows: rows.length, matchedCount, unmatchedCount, fallbackWarning: fallbackUsed ? `步骤2a输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

// ═══════════════════════════════════════════════════════════════
// Step 2b：删除未匹配行
// ═══════════════════════════════════════════════════════════════

interface Step2bOutput {
  outputPath: string
  totalRows: number
  matchedRows: number
  unmatchedDeleted: number
  fallbackWarning?: string
}

export async function step2bDeleteUnmatched(
  inputDir: string,
  outputDir: string
): Promise<Step2bOutput> {
  const inputFile = path.join(inputDir, 'join结果.xlsx')
  if (!fs.existsSync(inputFile)) {
    throw new Error(`未找到步骤2a的输出文件: ${inputFile}，请先执行步骤2a`)
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputFile)
  const ws = wb.worksheets[0]

  const headers = readHeaderRow(ws)
  const matchStatusIdx = headers.indexOf('_matchStatus')
  if (matchStatusIdx === -1) throw new Error('未找到_matchStatus列，请确认输入文件为步骤2a的输出')

  const keptRows: any[][] = []
  let matchedRows = 0
  let unmatchedDeleted = 0

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = readRowValues(ws, r)
    if (row[matchStatusIdx] === '匹配成功') {
      keptRows.push(row)
      matchedRows++
    } else {
      unmatchedDeleted++
    }
  }

  const { dir: stepDir, fallbackUsed } = await resolveWritableDir(outputDir, '步骤2b_删除未匹配')
  const outputPath = path.join(stepDir, '已匹配行.xlsx')
  const outWb = new ExcelJS.Workbook()
  const outWs = outWb.addWorksheet('已匹配行')
  outWs.addRow(headers)
  for (const row of keptRows) {
    outWs.addRow(row)
  }
  await writeWorkbookSafe(outWb, outputPath)

  return { outputPath, totalRows: keptRows.length, matchedRows, unmatchedDeleted, fallbackWarning: fallbackUsed ? `步骤2b输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

// ═══════════════════════════════════════════════════════════════
// Step 2c：按字段映射 + 自定义填充规则填充数据
// ═══════════════════════════════════════════════════════════════

interface Step2cOutput {
  outputPath: string
  totalRows: number
  fallbackWarning?: string
}

export async function step2cFillData(
  inputDir: string,
  fieldMappings: FieldMapping[],
  date: string,
  matchFieldTable1: string,
  matchFieldTable2: string,
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  table2Path: string,
  outputDir: string,
  seqConfigs: SeqConfig[] = []
): Promise<Step2cOutput> {
  const inputFile = path.join(inputDir, '已匹配行.xlsx')
  if (!fs.existsSync(inputFile)) {
    throw new Error(`未找到步骤2b的输出文件: ${inputFile}，请先执行步骤2b`)
  }

  // 构建 seq 配置索引
  const seqConfigMap = new Map(seqConfigs.map(c => [c.id, c]))

  // 校验：所有 fieldBased 类型且被 fieldMappings 引用的配置必须设置 baseField
  for (const mapping of fieldMappings) {
    const cfg = seqConfigMap.get(mapping.sourceType)
    if (cfg && cfg.type === 'fieldBased' && !cfg.baseField) {
      throw new Error(`序号自增"${cfg.name}"配置：请选择基于字段`)
    }
  }

  // 模板只读一次：既取列映射，也取全部行（原先重复读盘两遍）
  const { colMap, resolveCol, columns: table2Cols, allRows: templateAllRows } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  const templateDataStart = templateDataStartRowIndex - 1
  const templateRows: Record<string, any>[] = []
  for (let i = templateDataStart; i < templateAllRows.length; i++) {
    const row = templateAllRows[i]
    const rowData: Record<string, any> = {}
    Object.keys(colMap).forEach(col => {
      rowData[col] = row[colMap[col]] ?? ''
    })
    templateRows.push(rowData)
  }

  const templateMap = new Map<string, Record<string, any>>()
  for (const row of templateRows) {
    const key = clean(row[matchFieldTable2])
    if (key) templateMap.set(key, row)
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputFile)
  const ws = wb.worksheets[0]

  const headers = readHeaderRow(ws)

  const dataColCount = table2Cols.length
  let rowCount = 0

  // 收集所有 fieldBased 的 baseField 列索引（用于排序和分组）
  const fieldBasedSortFields: { idx: number }[] = []
  for (const cfg of seqConfigs) {
    if (cfg.type === 'fieldBased' && cfg.baseField) {
      const idx = headers.indexOf(cfg.baseField)
      if (idx >= 0) fieldBasedSortFields.push({ idx })
    }
  }

  // 预读取所有行
  const allRows: { rowNum: number; data: any[] }[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    allRows.push({ rowNum: r, data: readRowValues(ws, r) })
  }

  // 按所有 fieldBased 的 baseField 排序（确保同组行相邻）
  if (fieldBasedSortFields.length > 0) {
    allRows.sort((a, b) => {
      for (const sf of fieldBasedSortFields) {
        const va = clean(a.data[sf.idx] ?? '')
        const vb = clean(b.data[sf.idx] ?? '')
        const cmp = va.localeCompare(vb)
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }

  // 每个 seq 配置的计数器（用于 sequential / fieldBased 类型）
  const seqCounters = new Map<string, { value: number; prevBaseVal: string }>()

  for (const { rowNum: r, data: rowData } of allRows) {
    for (const mapping of fieldMappings) {
      const colIdx = resolveCol(mapping.templateCol)
      if (colIdx === undefined) continue

      let value: any = ''

      // ★ 核心：动态从 seqConfigs 查找匹配的序列配置
      const seqCfg = seqConfigMap.get(mapping.sourceType)
      if (seqCfg) {
        switch (seqCfg.type) {
          case 'constant':
            value = seqCfg.constantValue || ''
            break
          case 'sequential':
            if (!seqCounters.has(seqCfg.id)) {
              seqCounters.set(seqCfg.id, { value: seqCfg.start, prevBaseVal: '' })
            }
            value = seqCounters.get(seqCfg.id)!.value
            seqCounters.get(seqCfg.id)!.value += seqCfg.step
            break
          case 'fieldBased': {
            if (!seqCounters.has(seqCfg.id)) {
              seqCounters.set(seqCfg.id, { value: seqCfg.start, prevBaseVal: '' })
            }
            const counter = seqCounters.get(seqCfg.id)!
            if (seqCfg.baseField) {
              const bfIdx = headers.indexOf(seqCfg.baseField)
              if (bfIdx >= 0) {
                const currentBaseVal = clean(rowData[bfIdx] ?? '')
                // 与上一行不是同一字段值 → 递增步长（产生新的序列号）
                if (counter.prevBaseVal !== '' && currentBaseVal !== counter.prevBaseVal) {
                  counter.value += seqCfg.step
                }
                counter.prevBaseVal = currentBaseVal
              }
            }
            value = counter.value
            // 不递增：同组内（字段重复）序号也重复
            break
          }
        }
      } else {
        // 后备：非序列类型的标准取值（date、table1、constant 仍活跃使用）
        switch (mapping.sourceType) {
          case 'date':
            value = date
            break
          case 'table1':
            value = rowData[headers.indexOf(mapping.table1Col || '')] ?? ''
            break
          case 'constant':
            value = mapping.constantValue || ''
            break
          // ⚠ materialCode / materialName 仅用于读取极旧的预设文件（已废弃的映射来源类型）
          // 正常情况下新创建的映射不会用到此分支，保留仅确保旧预设兼容
          case 'materialCode': {
            const dataIdx = headers.indexOf(mapping.table1Col || '')
            if (dataIdx >= dataColCount) {
              value = rowData[dataIdx] ?? ''
            }
            break
          }
          case 'materialName': {
            const codeIdx = headers.indexOf(mapping.table1Col || '')
            const matCode = codeIdx >= 0 ? clean(rowData[codeIdx]) : ''
            const tmplRow = templateMap.get(matCode)
            value = tmplRow?.[matchFieldTable2.replace('编码', '名称')] ?? ''
            break
          }
        }
      }

      if (colIdx < dataColCount) {
        rowData[colIdx] = value
      }
    }
    rowCount++

    const writeRow = ws.getRow(r)
    for (let c = 0; c < headers.length; c++) {
      writeRow.getCell(c + 1).value = rowData[c] ?? ''
    }
    writeRow.commit()
  }

  const { dir: stepDir, fallbackUsed } = await resolveWritableDir(outputDir, '步骤2c_填充数据')
  const outputPath = path.join(stepDir, '已填充数据.xlsx')
  await writeWorkbookSafe(wb, outputPath)

  return { outputPath, totalRows: rowCount, fallbackWarning: fallbackUsed ? `步骤2c输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

// ═══════════════════════════════════════════════════════════════
// Step 2d：按订单分组恢复模板结构，输出填充模板文件
// ═══════════════════════════════════════════════════════════════

interface Step2dOutput {
  outputDir: string
  filledTemplateFiles: { orderKey: string; billNo: number; filePath: string; rowCount: number }[]
  totalRows: number
  fallbackWarning?: string
}

export async function step2dRestoreStructure(
  inputDir: string,
  table2Path: string,
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  outputDir: string
): Promise<Step2dOutput> {
  const inputFile = path.join(inputDir, '已填充数据.xlsx')
  if (!fs.existsSync(inputFile)) {
    throw new Error(`未找到步骤2c的输出文件: ${inputFile}，请先执行步骤2c`)
  }

  // 一次读盘同时拿到：sheet 名 / 表头行 / 模板列
  const { columns: table2Cols, headerRows, sheetName } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputFile)
  const ws = wb.worksheets[0]

  const headers = readHeaderRow(ws)
  const orderKeyIdx = headers.indexOf('_orderKey')
  const billNoIdx = headers.indexOf('_billNo')

  const groups = new Map<string, { billNo: number; rows: any[][] }>()
  for (let r = 2; r <= ws.rowCount; r++) {
    const rowData = readRowValues(ws, r)
    const orderKey = rowData[orderKeyIdx] ?? ''
    const billNo = rowData[billNoIdx] ?? 0
    const templateRow: any[] = []
    for (let c = 0; c < table2Cols.length; c++) {
      templateRow.push(c < rowData.length ? rowData[c] : '')
    }
    if (!groups.has(orderKey)) {
      groups.set(orderKey, { billNo, rows: [] })
    }
    groups.get(orderKey)!.rows.push(templateRow)
  }

  const filledTemplateFiles: { orderKey: string; billNo: number; filePath: string; rowCount: number }[] = []
  let totalRows = 0

  const { dir: stepDir, fallbackUsed } = await resolveWritableDir(outputDir, '步骤2d_恢复结构')

  for (const [orderKey, group] of groups) {
    const orderFile = path.join(stepDir, `填充模板_${orderKey}_${group.billNo}.xlsx`)
    const outWb = new ExcelJS.Workbook()
    const outWs = outWb.addWorksheet(sheetName)
    for (const hRow of headerRows) {
      outWs.addRow(hRow)
    }
    for (const row of group.rows) {
      outWs.addRow(row)
    }
    await writeWorkbookSafe(outWb, orderFile)
    filledTemplateFiles.push({ orderKey, billNo: group.billNo, filePath: orderFile, rowCount: group.rows.length })
    totalRows += group.rows.length
  }

  return { outputDir: stepDir, filledTemplateFiles, totalRows, fallbackWarning: fallbackUsed ? `步骤2d输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

// ═══════════════════════════════════════════════════════════════
// Step 3：汇总各模板为金蝶导入总表
// ═══════════════════════════════════════════════════════════════

interface Step3Output {
  outputPath: string
  totalOrders: number
  totalRows: number
  fallbackWarning?: string
  /** 数据转换的部分失败提示（失败单元格保留原值 / 列不存在跳过） */
  transformWarning?: string
}

export async function step3MergeTemplates(
  table2Path: string,
  filledTemplateFiles: { filePath: string }[],
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  outputDir: string,
  outputPrefix: string,
  textFormatColumns: string[],
  transforms: TransformRule[] = []
): Promise<Step3Output> {
  // 一次读盘同时拿到：表头行 / 列映射 / 模板 sheet 名
  const { headerRows, colMap, sheetName: templateSheetName } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  // Create output workbook with same sheet name
  const wbOut = new ExcelJS.Workbook()
  const wsOut = wbOut.addWorksheet(templateSheetName)

  // Add header rows from template
  for (const headerRow of headerRows) {
    wsOut.addRow(headerRow)
  }

  let totalOut = 0
  const headerCount = headerRows.length

  for (const fileInfo of filledTemplateFiles) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(fileInfo.filePath)
    const ws = wb.worksheets[0]

    // Skip header rows, only read data rows
    for (let r = headerCount + 1; r <= ws.rowCount; r++) {
      wsOut.addRow(readRowValues(ws, r))
      totalOut++
    }
  }

  if (textFormatColumns && textFormatColumns.length > 0) {
    const maxRow = wsOut.rowCount
    for (const colName of textFormatColumns) {
      const colIdx = colMap[colName]
      if (colIdx !== undefined) {
        // Start from headerCount+1 to skip header rows
        for (let r = headerCount + 1; r <= maxRow; r++) {
          const cell = wsOut.getRow(r).getCell(colIdx + 1)
          cell.numFmt = '@'
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

  // ── 数据转换（可选规则，仅数据行；表头不动；未配置时完全跳过）──
  let transformWarning: string | undefined
  if (transforms && transforms.length > 0) {
    const tr = applyTransforms(wsOut, colMap, headerCount, transforms)
    const parts: string[] = []
    if (tr.failed > 0) parts.push(`${tr.failed} 个单元格转换失败，已保留原值`)
    if (tr.skippedColumns.length > 0) parts.push(`以下列在汇总表中不存在，对应规则已跳过：${[...new Set(tr.skippedColumns)].join('、')}`)
    if (parts.length > 0) transformWarning = parts.join('；')
  }

  const timeTag = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)
  const fileName = `${outputPrefix}_${timeTag}.xlsx`
  // 直接写入输出目录，不创建子文件夹
  const { dir: finalDir, fallbackUsed: dirFallback } = await resolveWritableDir(outputDir, '')
  const finalOutputPath = path.join(finalDir, fileName)

  const fallbackWarning3 = dirFallback ? `步骤3输出目录不可写入，已回退至: ${finalDir}` : undefined

  await writeWorkbookSafe(wbOut, finalOutputPath)

  return {
    outputPath: finalOutputPath,
    totalOrders: filledTemplateFiles.length,
    totalRows: totalOut,
    fallbackWarning: fallbackWarning3,
    transformWarning
  }
}
