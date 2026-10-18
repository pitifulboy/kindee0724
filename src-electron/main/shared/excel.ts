/**
 * 主进程共享 Excel 助手
 *
 * 统一 excelMerge 与 kingdeeImport 两个模块中重复的「读表 / 取值 / 清洗 / 写盘 / 目录探测」逻辑。
 * 本模块只做等价抽取，对外行为与拆分前保持一致：
 * - 表头空列裁剪、行内空行跳过规则不变
 * - 重复列名的解析口径不变（colMap 以最后一次出现为准，仅额外打印告警）
 *
 * 读表支持的输入格式（按扩展名分派）：
 * - .xlsx / .xlsm → exceljs（原有口径不变）
 * - .xls           → SheetJS（BIFF 二进制，exceljs 读不了）
 * - .csv           → 内置 CSV 解析（自动识别 BOM / UTF-8 / GBK）
 * 写盘一律输出 .xlsx（exceljs）。
 */
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { app } from 'electron'

// ═══════════════════════════════════════════════════════════════
// 单元格取值与值清洗
// ═══════════════════════════════════════════════════════════════

/** exceljs 单元格取值：统一处理公式 / 富文本 / 超链接 / 文本包装类型 */
export function getCellValue(cell: ExcelJS.Cell): any {
  const val = cell.value as any
  if (val && typeof val === 'object') {
    if ('text' in val) return val.text
    if ('result' in val) return val.result
    if ('richText' in val) return (val.richText as any[]).map(r => r.text || '').join('')
    if ('hyperlink' in val) return val.text || val.hyperlink
  }
  return val
}

/**
 * 归一化取值：null/undefined → ''；数字整数去小数；字符串去首尾空格。
 * 原 excelMerge.cleanValue / kingdeeImport.clean 合并为此函数（二者行为一致）。
 */
export function clean(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    return val === Math.floor(val) ? String(Math.floor(val)) : String(val)
  }
  return String(val).trim()
}

/** 严格匹配 key：仅处理 null/undefined 与数字，不做 trim（匹配键必须原样比较） */
export function strictKey(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    return val === Math.floor(val) ? String(Math.floor(val)) : String(val)
  }
  return String(val)
}

// ═══════════════════════════════════════════════════════════════
// 写盘
// ═══════════════════════════════════════════════════════════════

const WRITE_CACHE_DIR = 'excel-write-cache'

/**
 * 写入工作簿到目标路径。
 *
 * exceljs 写 .xlsx 时会在**同目录**创建临时文件，部分安全软件（如 360）会对桌面等
 * 目录的文件创建操作做深度检查，导致 EPERM。
 * 解决：先在 temp 目录写出，再拷贝到目标目录（拷贝带重试），把两步分离。
 */
export async function writeWorkbookSafe(wb: ExcelJS.Workbook, targetPath: string): Promise<void> {
  const tmpDir = path.join(app.getPath('temp'), WRITE_CACHE_DIR)
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

  const tmpPath = path.join(tmpDir, `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`)
  try {
    await wb.xlsx.writeFile(tmpPath)

    const maxRetries = 5
    for (let attempt = 1; ; attempt++) {
      try {
        fs.copyFileSync(tmpPath, targetPath)
        break
      } catch (err: any) {
        const locked = err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EACCES'
        if (!locked || attempt >= maxRetries) throw err
        await new Promise(r => setTimeout(r, 200 * attempt))
      }
    }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}

/**
 * 探测可写目录：依次尝试 baseDir → 文档 → 桌面 → temp，返回第一个可写目录。
 * fallbackUsed=true 表示发生了回退（调用方据此给出提示）。
 */
export async function resolveWritableDir(
  baseDir: string,
  subDirName: string
): Promise<{ dir: string; fallbackUsed: boolean }> {
  const candidates: string[] = [baseDir]
  try {
    candidates.push(app.getPath('documents'))
    candidates.push(app.getPath('desktop'))
    candidates.push(app.getPath('temp'))
  } catch { /* ignore */ }

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

// ═══════════════════════════════════════════════════════════════
// 读表
// ═══════════════════════════════════════════════════════════════

export interface SheetTable {
  columns: string[]
  rows: Record<string, any>[]
}

/** 原始二维网格：rows[0] = 第 1 行，cells 为 exceljs 口径的原始值（数字保持数字） */
interface RawSheet {
  sheetName: string
  rows: any[][]
}

/** exceljs 读取 .xlsx / .xlsm（保持原有口径：每个单元格走 getCellValue） */
async function readRowsViaExcelJS(filePath: string): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)

  const rows: any[][] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    const rowData: any[] = []
    sheet.getRow(r).eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell)
    })
    rows.push(rowData)
  }
  return { sheetName: sheet.name, rows }
}

/** SheetJS 读取 .xls（BIFF 二进制），保留空行以维持「表头行号」对齐 */
function readRowsViaSheetJS(filePath: string): RawSheet {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)
  const aoa = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], {
    header: 1, raw: true, defval: '', blankrows: true
  })
  return { sheetName, rows: aoa.map(r => (Array.isArray(r) ? r.slice() : [])) }
}

/**
 * 文本解码：优先按 BOM 判定 UTF-8 / UTF-16；
 * 无 BOM 时先试 UTF-8，若出现替换字符（乱码）则回退 GBK（国内 Excel 导出的 CSV 常见编码）。
 */
function decodeTextBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf-8')
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le')
  }
  const utf8 = buf.toString('utf-8')
  if (utf8.includes('\uFFFD')) {
    try { return new TextDecoder('gbk').decode(buf) } catch { /* 无 GBK 支持时保持 UTF-8 */ }
  }
  return utf8
}

/** RFC4180 CSV 解析：支持引号包裹、引号转义（""）、字段内换行 */
function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

/** CSV 读取为原始网格（文本值，数字不还原为 number，交由 clean/strictKey 统一处理） */
function readRowsViaCsv(filePath: string): RawSheet {
  return { sheetName: 'CSV', rows: parseCsvGrid(decodeTextBuffer(fs.readFileSync(filePath))) }
}

/** 按扩展名分派读取原始网格（.xls → SheetJS，.csv → 文本解析，其余 → exceljs） */
async function readRawSheet(filePath: string): Promise<RawSheet> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.xls') return readRowsViaSheetJS(filePath)
  if (ext === '.csv') return readRowsViaCsv(filePath)
  return readRowsViaExcelJS(filePath)
}

/** 读取单个工作表为「表头 + 行对象数组」（首行作表头，跳过全空行，裁剪末尾空列） */
export async function readTable(filePath: string): Promise<SheetTable> {
  const { rows } = await readRawSheet(filePath)
  const header = rows[0] ?? []
  const columns: string[] = header.map(v => String(v ?? '').trim())
  const lastNonEmpty = columns.reduce((last, val, i) => (val ? i : last), -1)
  const validColumns = columns.slice(0, lastNonEmpty + 1)

  const out: Record<string, any>[] = []
  for (let r = 1; r < rows.length; r++) {
    const src = rows[r] ?? []
    const rowData: Record<string, any> = {}
    let hasData = false
    validColumns.forEach((col, i) => {
      const val = src[i] ?? ''
      rowData[col] = val
      if (val !== '' && val !== null && val !== undefined) hasData = true
    })
    if (hasData) out.push(rowData)
  }

  return { columns: validColumns, rows: out }
}

/** 读取指定表头行的列名列表（用于前端字段下拉） */
export async function readColumnsAtRow(filePath: string, headerRowIndex = 1): Promise<string[]> {
  const { rows } = await readRawSheet(filePath)
  const header = rows[headerRowIndex - 1] ?? []

  const columns: string[] = []
  header.forEach((v, i) => {
    const val = String(v ?? '').trim()
    if (val) columns[i] = val
  })
  return columns.filter(c => c)
}

export interface WorkbookMeta {
  /** 全部工作表名称（.csv 无工作表概念，返回空数组） */
  sheetNames: string[]
  /** 第一张工作表的首行列名（口径与 readTable 的列一致：去空 + 裁掉末尾空列） */
  headerColumns: string[]
}

/** 首行 → 列名（与 readTable 同口径） */
function firstRowColumns(rows: any[][]): string[] {
  const columns = (rows[0] ?? []).map(v => String(v ?? '').trim())
  const lastNonEmpty = columns.reduce((last, val, i) => (val ? i : last), -1)
  return columns.slice(0, lastNonEmpty + 1)
}

/**
 * 读取工作簿元信息：全部工作表名 + 第一张表的首行列名。
 * 供第 1 步合并前检测「工作表名不一致 / 各文件字段不一致」使用。
 */
export async function readWorkbookMeta(filePath: string): Promise<WorkbookMeta> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.csv') {
    return { sheetNames: [], headerColumns: firstRowColumns(readRowsViaCsv(filePath).rows) }
  }
  if (ext === '.xls') {
    const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: false })
    const first = wb.SheetNames[0]
    const rows = first
      ? XLSX.utils.sheet_to_json<any[]>(wb.Sheets[first], { header: 1, raw: true, defval: '', blankrows: true })
      : []
    return { sheetNames: wb.SheetNames.slice(), headerColumns: firstRowColumns(rows) }
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const first = wb.worksheets[0]
  if (!first) throw new Error(`文件 ${path.basename(filePath)} 没有工作表`)
  return { sheetNames: wb.worksheets.map(ws => ws.name), headerColumns: firstRowColumns([readHeaderRow(first)]) }
}

export interface TemplateSheet {
  /** 工作表名（供输出沿用模板 sheet 名，避免重复读盘） */
  sheetName: string
  /** 全部行（原始二维数组，索引 0 = 第 1 行） */
  allRows: any[][]
  /** 表头行的列名（保留重复列名与顺序） */
  columns: string[]
  /** 列名 → 列下标（重复列名以最后一次出现为准，保持既有行为） */
  colMap: Record<string, number>
  /** 解析模板列名 → 列下标（先精确、再去空格小写归一化） */
  resolveCol: (templateCol: string) => number | undefined
  /** 数据起始行之前的全部行（用于恢复模板结构） */
  headerRows: any[][]
  /** 数据起始行号（1-based） */
  dataStartRowIndex: number
}

/**
 * 模板读盘缓存。
 *
 * 同一条流水线里 step2a / step2c / step2d / step3 会各自读一次同一个模板文件；
 * 解析结果只取决于「文件内容 + 表头行 + 数据起始行」，与调用方无关，因此可安全复用。
 * 失效判定用 mtime + size：模板被外部改动（如用户在 Excel 里改完重新执行）会自动重读。
 * 只保留最近 1 个模板（模板体积很小），避免大文件常驻内存。
 *
 * 注意：返回的 TemplateSheet 会被多个步骤共享，调用方**不得**原地修改其中的数组。
 */
interface TemplateCacheEntry {
  key: string
  mtimeMs: number
  size: number
  sheet: TemplateSheet
}
let templateCache: TemplateCacheEntry | null = null

/** 清空模板缓存（文件被程序自身改写后调用） */
export function clearTemplateCache(): void {
  templateCache = null
}

/** 读取金蝶模板：表头行 + 列名映射 + 全部行（跨步骤带缓存，供 2a/2c/2d/3 复用） */
export async function readTemplate(
  filePath: string,
  headerRowIndex: number,
  dataStartRowIndex: number
): Promise<TemplateSheet> {
  const cacheKey = `${filePath}|${headerRowIndex}|${dataStartRowIndex}`
  let stat: fs.Stats | null = null
  try {
    stat = fs.statSync(filePath)
  } catch {
    /* 文件不存在等异常交由下方正常流程抛出更明确的错误 */
  }

  if (
    templateCache &&
    stat &&
    templateCache.key === cacheKey &&
    templateCache.mtimeMs === stat.mtimeMs &&
    templateCache.size === stat.size
  ) {
    return templateCache.sheet
  }

  const { sheetName, rows: allRows } = await readRawSheet(filePath)

  const colMap: Record<string, number> = {}
  const normalizedColMap: Record<string, number> = {}
  const columns: string[] = []
  const duplicates: string[] = []

  const header = allRows[headerRowIndex - 1]
  if (header) {
    header.forEach((name, i) => {
      if (name !== null && name !== undefined && String(name).trim()) {
        const rawName = String(name).trim()
        if (colMap[rawName] !== undefined) duplicates.push(rawName)
        colMap[rawName] = i
        columns.push(rawName)
        normalizedColMap[rawName.replace(/\s+/g, '').toLowerCase()] = i
      }
    })
  }

  if (duplicates.length > 0) {
    console.warn(`[excel] 模板表头存在重复列名（解析以最后一次出现为准）: ${[...new Set(duplicates)].join('、')}`)
  }

  const resolveCol = (templateCol: string): number | undefined => {
    if (colMap[templateCol] !== undefined) return colMap[templateCol]
    return normalizedColMap[templateCol.replace(/\s+/g, '').toLowerCase()]
  }

  const result: TemplateSheet = {
    sheetName,
    allRows,
    columns,
    colMap,
    resolveCol,
    headerRows: allRows.slice(0, dataStartRowIndex - 1),
    dataStartRowIndex,
  }

  if (stat) {
    templateCache = { key: cacheKey, mtimeMs: stat.mtimeMs, size: stat.size, sheet: result }
  }

  return result
}

/** 读取 join / 填充结果表的表头（保留列序，含 _orderKey / _billNo / _matchStatus 等内部列） */
export function readHeaderRow(ws: ExcelJS.Worksheet): string[] {
  const headers: string[] = []
  ws.getRow(1).eachCell((cell, colNum) => {
    headers[colNum - 1] = getCellValue(cell)
  })
  return headers
}

/** 读取工作表某一行为原生数组 */
export function readRowValues(ws: ExcelJS.Worksheet, rowNumber: number): any[] {
  const rowData: any[] = []
  ws.getRow(rowNumber).eachCell((cell, colNum) => {
    rowData[colNum - 1] = getCellValue(cell)
  })
  return rowData
}
