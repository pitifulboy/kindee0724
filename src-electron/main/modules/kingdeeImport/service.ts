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

function clean(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    return val === Math.floor(val) ? String(Math.floor(val)) : String(val)
  }
  return String(val).trim()
}

/** 严格匹配用的key转换：仅处理null/undefined和数字，不做trim等模糊处理 */
function strictKey(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    return val === Math.floor(val) ? String(Math.floor(val)) : String(val)
  }
  return String(val)
}

async function resolveWritableDir(baseDir: string, subDirName: string): Promise<{ dir: string; fallbackUsed: boolean }> {
  const candidates: string[] = [baseDir]
  try {
    const { app } = require('electron')
    candidates.push(app.getPath('documents'))
    candidates.push(app.getPath('desktop'))
    candidates.push(app.getPath('temp'))
  } catch {}

  const seen = new Set<string>()
  const uniqueCandidates = candidates.filter(c => {
    if (seen.has(c)) return false
    seen.add(c)
    return true
  })

  for (const candidate of uniqueCandidates) {
    const dir = path.join(candidate, subDirName)
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const testFile = path.join(dir, `.write-test-${Date.now()}`)
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      return { dir, fallbackUsed: candidate !== baseDir }
    } catch {
      continue
    }
  }

  throw new Error(
    `无法创建目录 "${subDirName}"：所有目标路径均无写入权限。\n` +
    `请更换输出目录，或检查是否有权限写入「文档」「桌面」等系统目录。`
  )
}

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

async function readTable1(
  filePath: string,
  onProgress?: (msg: string) => void
): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)

  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    columns[colNumber - 1] = String(cell.value || '').trim()
  })
  const lastNonEmpty = columns.reduce((last, val, i) => val ? i : last, -1)
  const validColumns = columns.slice(0, lastNonEmpty + 1)

  const rows: Record<string, any>[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const rowData: Record<string, any> = {}
    let hasData = false
    validColumns.forEach((col, i) => {
      const cell = row.getCell(i + 1)
      const val = getCellValue(cell)
      rowData[col] = val ?? ''
      if (val !== '' && val !== null && val !== undefined) hasData = true
    })
    if (hasData) rows.push(rowData)
  }

  onProgress?.(`读取数据表：${rows.length} 行，${validColumns.length} 列`)
  return { columns: validColumns, rows }
}

async function readTemplate(
  filePath: string,
  headerRowIndex: number,
  dataStartRowIndex: number,
  onProgress?: (msg: string) => void
): Promise<{
  colMap: Record<string, number>
  resolveCol: (templateCol: string) => number | undefined
  allRows: any[][]
  sampleRow: any[]
  headerRows: any[][]
  templateDataRows: any[][]
  columns: string[]
}> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)

  const allRows: any[][] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const rowData: any[] = []
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell)
    })
    allRows.push(rowData)
  }

  const colMap: Record<string, number> = {}
  const normalizedColMap: Record<string, number> = {}
  const columns: string[] = []
  if (allRows[headerRowIndex - 1]) {
    allRows[headerRowIndex - 1].forEach((name, i) => {
      if (name !== null && name !== undefined && String(name).trim()) {
        const rawName = String(name).trim()
        colMap[rawName] = i
        columns.push(rawName)
        const normalized = rawName.replace(/\s+/g, '').toLowerCase()
        normalizedColMap[normalized] = i
      }
    })
  }

  function resolveCol(templateCol: string): number | undefined {
    if (colMap[templateCol] !== undefined) return colMap[templateCol]
    const normalized = templateCol.replace(/\s+/g, '').toLowerCase()
    return normalizedColMap[normalized]
  }

  const sampleRow = allRows[dataStartRowIndex - 1]
    ? [...allRows[dataStartRowIndex - 1]]
    : []

  const headerRows = allRows.slice(0, dataStartRowIndex - 1)
  const templateDataRows = allRows.slice(dataStartRowIndex - 1)

  onProgress?.(`读取模板：识别 ${Object.keys(colMap).length} 个列名`)
  return { colMap, resolveCol, allRows, sampleRow, headerRows, templateDataRows, columns }
}

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

export async function getTemplateColumns(
  filePath: string,
  headerRowIndex: number
): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件没有工作表`)

  const headerRow = sheet.getRow(headerRowIndex)
  const columns: string[] = []
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim()
    if (val) columns[colNumber - 1] = val
  })
  return columns.filter(c => c)
}

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
  outputDir: string
): Promise<Step1Output> {
  const { columns: table1Cols, rows: table1Rows } = await readTable1(table1Path)

  const groups = new Map<string, Record<string, any>[]>()
  for (const row of table1Rows) {
    const key = clean(row[groupByColumn])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const orderFiles: { orderKey: string; billNo: number; filePath: string; rowCount: number }[] = []
  let currentBillNo = startBillNo

  const { dir: stepDir, fallbackUsed: dirFallback } = await resolveWritableDir(outputDir, '步骤1_订单拆分')

  for (const [orderKey, items] of groups) {
    const billNo = currentBillNo++
    const orderFile = path.join(stepDir, `订单_${orderKey}_${billNo}.xlsx`)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('订单数据')

    ws.addRow(table1Cols)
    for (const item of items) {
      ws.addRow(table1Cols.map(col => item[col] ?? ''))
    }
    ws.addRow(['', '', '', `单号: ${billNo}`])

    await wb.xlsx.writeFile(orderFile)
    orderFiles.push({ orderKey, billNo, filePath: orderFile, rowCount: items.length })
  }

  const summaryFile = path.join(stepDir, '订单拆分汇总.xlsx')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('订单汇总')
  ws.addRow(['订单标识', '新单号', '明细行数', '文件路径'])
  for (const order of orderFiles) {
    ws.addRow([order.orderKey, order.billNo, order.rowCount, order.filePath])
  }

  await wb.xlsx.writeFile(summaryFile)

  const fallbackWarning1 = dirFallback ? `步骤1输出目录不可写入，已回退至: ${stepDir}` : undefined

  return { outputPath: summaryFile, orderFiles, totalOrders: groups.size, table1Columns: table1Cols, fallbackWarning: fallbackWarning1 }
}

interface MatchedItem {
  orderKey: string
  billNo: number
  table1Item: Record<string, any>
  templateMatch: Record<string, any> | null
  matchStatus: string
  matchValue: string
}

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
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  outputDir: string
): Promise<Step2aOutput> {
  const { rows: table1Rows } = await readTable1(table1Path)
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
  for (const [orderKey, items] of groups) {
    const dataMap = new Map<string, Record<string, any>[]>()
    for (const item of items) {
      const key = strictKey(item[matchFieldTable1])
      if (!dataMap.has(key)) dataMap.set(key, [])
      dataMap.get(key)!.push(item)
    }
    groupDataMap.set(orderKey, dataMap)
  }

  const dataCols = table1Rows.length > 0 ? Object.keys(table1Rows[0]) : []
  const headers = [...table2Cols, ...dataCols, '_orderKey', '_billNo', '_matchStatus']

  let matchedCount = 0
  let unmatchedCount = 0
  let currentBillNo = startBillNo
  const rows: any[][] = []

  for (const [orderKey, dataMap] of groupDataMap) {
    const billNo = currentBillNo++
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
  await wb.xlsx.writeFile(outputPath)

  return { outputPath, totalRows: rows.length, matchedCount, unmatchedCount, fallbackWarning: fallbackUsed ? `步骤2a输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

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

  const headers: string[] = []
  ws.getRow(1).eachCell((cell, colNum) => {
    headers[colNum - 1] = getCellValue(cell)
  })

  const matchStatusIdx = headers.indexOf('_matchStatus')
  if (matchStatusIdx === -1) throw new Error('未找到_matchStatus列，请确认输入文件为步骤2a的输出')

  const keptRows: any[][] = []
  let matchedRows = 0
  let unmatchedDeleted = 0

  for (let r = 2; r <= ws.rowCount; r++) {
    const row: any[] = []
    ws.getRow(r).eachCell((cell, colNum) => {
      row[colNum - 1] = getCellValue(cell)
    })
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
  await outWb.xlsx.writeFile(outputPath)

  return { outputPath, totalRows: keptRows.length, matchedRows, unmatchedDeleted, fallbackWarning: fallbackUsed ? `步骤2b输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

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
  outputDir: string
): Promise<Step2cOutput> {
  const inputFile = path.join(inputDir, '已匹配行.xlsx')
  if (!fs.existsSync(inputFile)) {
    throw new Error(`未找到步骤2b的输出文件: ${inputFile}，请先执行步骤2b`)
  }

  const { colMap, resolveCol, columns: table2Cols } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  const templateDataStart = templateDataStartRowIndex - 1
  const { allRows } = await readTemplate(table2Path, templateHeaderRowIndex, templateDataStartRowIndex)
  const templateRows: Record<string, any>[] = []
  for (let i = templateDataStart; i < allRows.length; i++) {
    const row = allRows[i]
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

  const headers: string[] = []
  ws.getRow(1).eachCell((cell, colNum) => {
    headers[colNum - 1] = getCellValue(cell)
  })

  const dataColCount = table2Cols.length
  let seq = 1
  let rowCount = 0

  for (let r = 2; r <= ws.rowCount; r++) {
    const rowData: any[] = []
    ws.getRow(r).eachCell((cell, colNum) => {
      rowData[colNum - 1] = getCellValue(cell)
    })

    const billNo = rowData[headers.indexOf('_billNo')] ?? 0
    const orderKey = rowData[headers.indexOf('_orderKey')] ?? ''

    for (const mapping of fieldMappings) {
      const colIdx = resolveCol(mapping.templateCol)
      if (colIdx === undefined) continue

      let value: any = ''
      switch (mapping.sourceType) {
        case 'billNo':
          value = billNo
          break
        case 'detailSeq':
          value = seq
          break
        case 'financialSeq':
          value = billNo + (mapping.financialSeqOffset || 1)
          break
        case 'date':
          value = date
          break
        case 'table1':
          value = rowData[dataColCount + (headers.indexOf(mapping.table1Col || '') - dataColCount)] ?? ''
          break
        case 'constant':
          value = mapping.constantValue || ''
          break
        case 'materialCode':
          const dataIdx = headers.indexOf(mapping.table1Col || '')
          if (dataIdx >= dataColCount) {
            value = rowData[dataIdx] ?? ''
          }
          break
        case 'materialName':
          const codeIdx = headers.indexOf(mapping.table1Col || '')
          const matCode = codeIdx >= 0 ? clean(rowData[codeIdx]) : ''
          const tmplRow = templateMap.get(matCode)
          value = tmplRow?.[matchFieldTable2.replace('编码', '名称')] ?? ''
          break
      }

      if (colIdx < dataColCount) {
        rowData[colIdx] = value
      }
    }
    seq++
    rowCount++

    const writeRow = ws.getRow(r)
    for (let c = 0; c < headers.length; c++) {
      writeRow.getCell(c + 1).value = rowData[c] ?? ''
    }
    writeRow.commit()
  }

  const { dir: stepDir, fallbackUsed } = await resolveWritableDir(outputDir, '步骤2c_填充数据')
  const outputPath = path.join(stepDir, '已填充数据.xlsx')
  await wb.xlsx.writeFile(outputPath)

  return { outputPath, totalRows: rowCount, fallbackWarning: fallbackUsed ? `步骤2c输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

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

  const { colMap, columns: table2Cols, headerRows } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  // Read template to preserve sheet name
  const tmpWb = new ExcelJS.Workbook()
  await tmpWb.xlsx.readFile(table2Path)
  const sheetName = tmpWb.worksheets[0]?.name || 'Sheet1'

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputFile)
  const ws = wb.worksheets[0]

  const headers: string[] = []
  ws.getRow(1).eachCell((cell, colNum) => {
    headers[colNum - 1] = getCellValue(cell)
  })

  const orderKeyIdx = headers.indexOf('_orderKey')
  const billNoIdx = headers.indexOf('_billNo')

  const groups = new Map<string, { billNo: number; rows: any[][] }>()
  for (let r = 2; r <= ws.rowCount; r++) {
    const rowData: any[] = []
    ws.getRow(r).eachCell((cell, colNum) => {
      rowData[colNum - 1] = getCellValue(cell)
    })
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
    await outWb.xlsx.writeFile(orderFile)
    filledTemplateFiles.push({ orderKey, billNo: group.billNo, filePath: orderFile, rowCount: group.rows.length })
    totalRows += group.rows.length
  }

  return { outputDir: stepDir, filledTemplateFiles, totalRows, fallbackWarning: fallbackUsed ? `步骤2d输出目录不可写入，已回退至: ${stepDir}` : undefined }
}

interface Step3Output {
  outputPath: string
  totalOrders: number
  totalRows: number
  fallbackWarning?: string
}

export async function step3MergeTemplates(
  table2Path: string,
  filledTemplateFiles: { filePath: string }[],
  templateHeaderRowIndex: number,
  templateDataStartRowIndex: number,
  outputDir: string,
  outputPrefix: string,
  textFormatColumns: string[]
): Promise<Step3Output> {
  const { headerRows, colMap } = await readTemplate(
    table2Path, templateHeaderRowIndex, templateDataStartRowIndex
  )

  // Read original template to get sheet name
  const tmpWb = new ExcelJS.Workbook()
  await tmpWb.xlsx.readFile(table2Path)
  const templateSheetName = tmpWb.worksheets[0]?.name || 'Sheet1'

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
      const row = ws.getRow(r)
      const rowData: any[] = []
      row.eachCell((cell, colNumber) => {
        rowData[colNumber - 1] = getCellValue(cell)
      })
      wsOut.addRow(rowData)
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

  const timeTag = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)
  const fileName = `${outputPrefix}_${timeTag}.xlsx`
  // 直接写入输出目录，不创建子文件夹
  const { dir: finalDir, fallbackUsed: dirFallback } = await resolveWritableDir(outputDir, '')
  const finalOutputPath = path.join(finalDir, fileName)

  const fallbackWarning3 = dirFallback ? `步骤3输出目录不可写入，已回退至: ${finalDir}` : undefined

  await wbOut.xlsx.writeFile(finalOutputPath)

  return {
    outputPath: finalOutputPath,
    totalOrders: filledTemplateFiles.length,
    totalRows: totalOut,
    fallbackWarning: fallbackWarning3
  }
}

export async function generateImportFile(
  config: KingdeeImportPreset,
  onProgress: (progress: KingdeeImportProgress) => void
): Promise<KingdeeImportResult> {
  isCancelled = false

  if (!fs.existsSync(config.table1Path)) {
    throw new Error(`数据表文件不存在: ${config.table1Path}`)
  }
  if (!fs.existsSync(config.table2Path)) {
    throw new Error(`模板表文件不存在: ${config.table2Path}`)
  }

  onProgress({
    step: '初始化', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 0, status: 'pending',
    message: '准备开始生成...'
  })

  onProgress({
    step: '步骤1: 读取数据表', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 5, status: 'reading',
    message: '正在读取数据表...'
  })
  const { rows: table1Rows } = await readTable1(config.table1Path)
  onProgress({
    step: '步骤1: 读取数据表', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 10, status: 'reading',
    message: `数据表读取完成：${table1Rows.length} 行数据`
  })
  if (table1Rows.length > 0) {
    onProgress({
      step: '步骤1: 读取数据表', currentOrder: '', currentOrderIndex: 0,
      totalOrders: 0, overallProgress: 12, status: 'reading',
      message: `数据表列：${Object.keys(table1Rows[0]).join('、')}`
    })
  }
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '步骤1: 生成单号', currentOrder: '', currentOrderIndex: 0,
    totalOrders: 0, overallProgress: 15, status: 'generating',
    message: '步骤1：根据订单表的指定字段，按起始数生成新的单号...'
  })
  const groups = new Map<string, Record<string, any>[]>()
  for (const row of table1Rows) {
    const key = clean(row[config.groupByColumn])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  const totalOrders = groups.size
  onProgress({
    step: '步骤1: 生成单号', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 20, status: 'generating',
    message: `步骤1完成：共识别 ${totalOrders} 个订单，起始单号 ${config.startBillNo}`
  })

  const billNumbers = new Map<string, number>()
  let currentBillNo = config.startBillNo
  for (const [key] of groups) {
    billNumbers.set(key, currentBillNo++)
  }

  const billNumList = Array.from(billNumbers.entries()).map(
    ([key, num]) => `${key} → ${num}`
  )
  onProgress({
    step: '步骤1: 生成单号', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 22, status: 'generating',
    message: `单号映射：${billNumList.join('; ')}`
  })
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '步骤2: 读取模板表', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 25, status: 'reading',
    message: '步骤2：读取模板表（含参照数据）...'
  })
  const { colMap, resolveCol, sampleRow, headerRows } = await readTemplate(
    config.table2Path,
    config.templateHeaderRowIndex,
    config.templateDataStartRowIndex
  )
  onProgress({
    step: '步骤2: 读取模板表', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 30, status: 'reading',
    message: `模板表读取完成：${Object.keys(colMap).length} 个列名`
  })
  onProgress({
    step: '步骤2: 读取模板表', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 32, status: 'reading',
    message: `模板列：${Object.keys(colMap).join('、')}`
  })
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '步骤2: 匹配订单', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 35, status: 'generating',
    message: '步骤2：遍历订单表，每个订单用指定字段匹配模板表...'
  })
  const matchedOrders: { orderKey: string; billNo: number; items: Record<string, any>[] }[] = []
  for (const [orderKey, items] of groups) {
    const billNo = billNumbers.get(orderKey) || 0
    matchedOrders.push({ orderKey, billNo, items })
  }
  onProgress({
    step: '步骤2: 匹配订单', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 40, status: 'generating',
    message: `步骤2完成：${matchedOrders.length} 个订单匹配成功`
  })
  for (const order of matchedOrders) {
    onProgress({
      step: '步骤2: 匹配订单',
      currentOrder: order.orderKey,
      currentOrderIndex: 0,
      totalOrders,
      overallProgress: 40,
      status: 'generating',
      message: `匹配订单 ${order.orderKey}: ${order.items.length} 条明细，单号 ${order.billNo}`
    })
  }
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '步骤3: 填充模板', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 45, status: 'generating',
    message: '步骤3：按映射关系，填充模板表，生成对应订单的模板...'
  })

  const filledTemplates: any[][][] = []
  let totalFilledRows = 0
  let detailSeq = 1

  const maxColIdx = Object.values(colMap).reduce((max, idx) => Math.max(max, idx), -1)
  const fallbackRow: any[] = new Array(maxColIdx + 1).fill('')

  for (const order of matchedOrders) {
    const orderRows: any[][] = []

    for (const item of order.items) {
      const baseRow = [...(sampleRow.length > 0 ? sampleRow : fallbackRow)]
      const finalRow = [...baseRow]

      for (const mapping of config.fieldMappings) {
        const colIdx = resolveCol(mapping.templateCol)
        if (colIdx === undefined) continue

        let value: any = ''

        switch (mapping.sourceType) {
          case 'billNo':
            value = order.billNo
            break
          case 'detailSeq':
            value = detailSeq
            break
          case 'financialSeq':
            value = order.billNo + (mapping.financialSeqOffset || 1)
            break
          case 'date':
            value = config.date
            break
          case 'table1':
            value = item[mapping.table1Col || ''] ?? ''
            break
          case 'constant':
            value = mapping.constantValue || ''
            break
          case 'materialCode':
            value = item[mapping.table1Col || ''] ?? ''
            break
          case 'materialName':
            value = ''
            break
        }

        finalRow[colIdx] = value
      }

      orderRows.push(finalRow)
      detailSeq++
      totalFilledRows++
    }

    filledTemplates.push(orderRows)

    onProgress({
      step: '步骤3: 填充模板',
      currentOrder: order.orderKey,
      currentOrderIndex: currentBillNo - config.startBillNo,
      totalOrders,
      overallProgress: 50 + Math.round((currentBillNo - config.startBillNo) / totalOrders * 25),
      status: 'generating',
      message: `订单 ${order.orderKey}: 填充 ${orderRows.length} 条，单号 ${order.billNo}`
    })
  }

  onProgress({
    step: '步骤3: 填充模板', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 75, status: 'generating',
    message: `步骤3完成：共填充 ${totalFilledRows} 条数据到 ${filledTemplates.length} 个订单模板`
  })
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '步骤4: 合并模板', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 85, status: 'writing',
    message: '步骤4：合并所有订单的模板...'
  })

  const wbOut = new ExcelJS.Workbook()
  await wbOut.xlsx.readFile(config.table2Path)
  const wsOut = wbOut.worksheets[0]

  wsOut.spliceRows(1, wsOut.rowCount)

  for (const headerRow of headerRows) {
    wsOut.addRow(headerRow)
  }

  let totalOut = 0
  for (const orderRows of filledTemplates) {
    for (const rowData of orderRows) {
      wsOut.addRow(rowData)
      totalOut++
    }
  }

  if (config.textFormatColumns && config.textFormatColumns.length > 0) {
    const maxRow = wsOut.rowCount
    for (const colName of config.textFormatColumns) {
      const colIdx = colMap[colName]
      if (colIdx !== undefined) {
        for (let r = 1; r <= maxRow; r++) {
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

  const os = require('os')
  const timeTag = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)
  const fileName = `${config.outputPrefix}_${timeTag}.xlsx`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kingdee-'))
  const tmpPath = path.join(tmpDir, fileName)
  await wbOut.xlsx.writeFile(tmpPath)

  const tryPaths: string[] = [
    path.join(config.outputDir, fileName),
  ]
  try {
    const { app } = require('electron')
    tryPaths.push(path.join(app.getPath('documents'), fileName))
    tryPaths.push(path.join(app.getPath('desktop'), fileName))
    tryPaths.push(path.join(app.getPath('temp'), fileName))
  } catch {}

  let finalOutputPath: string | null = null
  let lastError: Error | null = null

  for (const tryPath of tryPaths) {
    try {
      const tryDir = path.dirname(tryPath)
      if (!fs.existsSync(tryDir)) {
        fs.mkdirSync(tryDir, { recursive: true })
      }
      fs.copyFileSync(tmpPath, tryPath)
      finalOutputPath = tryPath
      break
    } catch (e: any) {
      lastError = e
    }
  }

  try { fs.unlinkSync(tmpPath) } catch {}
  try { fs.rmdirSync(tmpDir) } catch {}

  if (!finalOutputPath) {
    throw new Error(
      `文件保存失败：所有目标路径均无法写入（${lastError?.message || '未知错误'}）。` +
      `请尝试更换输出目录，或检查是否有权限写入「文档」「桌面」等系统目录。`
    )
  }

  onProgress({
    step: '步骤4: 合并模板', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 95, status: 'writing',
    message: `步骤4完成：合并 ${filledTemplates.length} 个订单模板，输出 ${totalOut} 条数据`
  })
  if (isCancelled) throw new Error('已取消')

  onProgress({
    step: '完成', currentOrder: '', currentOrderIndex: 0,
    totalOrders, overallProgress: 100, status: 'completed',
    message: `生成完成！输出文件：${finalOutputPath}`
  })

  return {
    outputPath: finalOutputPath,
    totalOrders,
    totalRows: totalOut,
    skippedRows: 0
  }
}

export function cancelGenerate() {
  isCancelled = true
}