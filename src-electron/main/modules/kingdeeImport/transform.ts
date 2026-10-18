/**
 * 汇总表数据转换（第 6 步可选后处理）
 *
 * 只作用于数据行（表头不动）；规则按列表顺序链式执行。
 * 未配置任何规则时 step3 完全不调用本模块，行为与旧版一致。
 */
import type ExcelJS from 'exceljs'

export type TransformOp = 'textToNumber' | 'numberToText' | 'replace' | 'formula'

export interface TransformRule {
  id: string
  /** 作用列（汇总表的列名） */
  targetColumn: string
  op: TransformOp
  /** replace：查找内容 */
  find?: string
  /** replace：替换为 */
  replaceWith?: string
  /** replace：按正则替换 */
  useRegex?: boolean
  /** formula：表达式，{列名} 引用本行其他列，填入计算后的值 */
  expr?: string
}

export interface ApplyTransformsResult {
  /** 转换失败（已保留原值）的单元格数 */
  failed: number
  /** 列在汇总表中不存在而整条跳过的列名 */
  skippedColumns: string[]
}

// ─── 文本 → 数字 ───

/** 清洗并转数字：全角→半角、去千分位/空格/货币符号；失败返回 null */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s) return null
  // 全角数字/．/－/＋/，转半角
  s = s.replace(/[０-９．－＋，]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
  s = s.replace(/[,\s￥$]/g, '')
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ─── 公式安全求值（不用 eval）───

class ExprError extends Error {}

/** 递归下降求值：+ - * / % ( )、一元 ±、ROUND/ABS/MAX/MIN/CEILING/FLOOR */
function evalExpr(src: string): number {
  let i = 0
  const skip = () => { while (i < src.length && /\s/.test(src[i])) i++ }

  function parseExpr(): number {
    let v = parseTerm()
    for (;;) {
      skip()
      const c = src[i]
      if (c === '+') { i++; v += parseTerm() } else if (c === '-') { i++; v -= parseTerm() } else return v
    }
  }

  function parseTerm(): number {
    let v = parseFactor()
    for (;;) {
      skip()
      const c = src[i]
      if (c === '*') { i++; v *= parseFactor() } else if (c === '/') {
        i++; const d = parseFactor()
        if (d === 0) throw new ExprError('除数为 0')
        v /= d
      } else if (c === '%') { i++; const d = parseFactor(); if (d === 0) throw new ExprError('取模数为 0'); v %= d } else return v
    }
  }

  function parseFactor(): number {
    skip()
    if (src[i] === '+') { i++; return parseFactor() }
    if (src[i] === '-') { i++; return -parseFactor() }
    if (src[i] === '(') {
      i++
      const v = parseExpr()
      skip()
      if (src[i] !== ')') throw new ExprError('缺少右括号')
      i++
      return v
    }
    const fn = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (fn) {
      const name = fn[0].toUpperCase()
      i += fn[0].length
      skip()
      if (src[i] !== '(') throw new ExprError(`「${name}」后应为左括号`)
      i++
      const args: number[] = [parseExpr()]
      skip()
      while (src[i] === ',') { i++; args.push(parseExpr()); skip() }
      if (src[i] !== ')') throw new ExprError('缺少右括号')
      i++
      return applyFn(name, args)
    }
    const num = /^\d+(?:\.\d+)?|^\.\d+/.exec(src.slice(i))
    if (num) { i += num[0].length; return Number(num[0]) }
    throw new ExprError(`第 ${i + 1} 个字符处无法解析`)
  }

  const v = parseExpr()
  skip()
  if (i < src.length) throw new ExprError('表达式末尾有多余内容')
  return v
}

function applyFn(name: string, args: number[]): number {
  switch (name) {
    case 'ROUND': {
      // Excel ROUND 语义：0.5 远离零
      if (args.length < 1 || args.length > 2) throw new ExprError('ROUND 需要 1~2 个参数')
      const p = args.length === 2 ? Math.round(args[1]) : 0
      const f = Math.pow(10, p)
      return args[0] >= 0 ? Math.round(args[0] * f) / f : -Math.round(-args[0] * f) / f
    }
    case 'ABS': return Math.abs(args[0])
    case 'MAX': return Math.max(...args)
    case 'MIN': return Math.min(...args)
    case 'CEILING': return Math.ceil(args[0])
    case 'FLOOR': return Math.floor(args[0])
    default: throw new ExprError(`不支持的函数 ${name}`)
  }
}

/** 把 {列名} 替换为该行对应列的数值后求值 */
function evalFormulaForCell(
  expr: string,
  colMap: Record<string, number>,
  ws: ExcelJS.Worksheet,
  row: number
): number {
  const resolved = expr.replace(/\{([^{}]+)\}/g, (_, rawName: string) => {
    const name = rawName.trim()
    const idx = colMap[name]
    if (idx === undefined) throw new ExprError(`列「${name}」在汇总表中不存在`)
    const v = toNumber(ws.getRow(row).getCell(idx + 1).value)
    if (v === null) throw new ExprError(`列「${name}」的值不是数字`)
    return String(v)
  })
  return evalExpr(resolved)
}

// ─── 主入口 ───

/**
 * 对工作表数据行逐条应用转换规则（仅数据行，表头不动）。
 * 单个单元格失败不中断，保留原值并计数。
 */
export function applyTransforms(
  ws: ExcelJS.Worksheet,
  colMap: Record<string, number>,
  headerCount: number,
  rules: TransformRule[]
): ApplyTransformsResult {
  let failed = 0
  const skippedColumns: string[] = []

  for (const rule of rules ?? []) {
    if (!rule || !rule.targetColumn || !rule.op) continue
    const colIdx = colMap[rule.targetColumn]
    if (colIdx === undefined) { skippedColumns.push(rule.targetColumn); continue }

    // 无效正则：整条规则跳过
    let re: RegExp | null = null
    if (rule.op === 'replace' && rule.useRegex && rule.find) {
      try { re = new RegExp(rule.find, 'g') } catch { skippedColumns.push(rule.targetColumn); continue }
    }

    for (let r = headerCount + 1; r <= ws.rowCount; r++) {
      const cell = ws.getRow(r).getCell(colIdx + 1)
      const v = cell.value
      try {
        switch (rule.op) {
          case 'textToNumber': {
            const n = toNumber(v)
            if (n === null && v !== null && v !== '') { failed++; break }
            if (n !== null) cell.value = n
            break
          }
          case 'numberToText': {
            if (typeof v === 'number') {
              cell.numFmt = '@'
              cell.value = String(v)
            }
            break
          }
          case 'replace': {
            if (typeof v === 'string' && v && rule.find) {
              const rw = rule.replaceWith ?? ''
              cell.value = re ? v.replace(re, rw) : v.split(rule.find).join(rw)
            }
            break
          }
          case 'formula': {
            if (!rule.expr) break
            cell.value = evalFormulaForCell(rule.expr, colMap, ws, r)
            break
          }
        }
      } catch {
        failed++ // 保留原值
      }
    }
  }

  return { failed, skippedColumns }
}
