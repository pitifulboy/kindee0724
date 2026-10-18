/**
 * applyTransforms 单元测试（第 6 步数据转换）
 * 覆盖：4 种操作、仅数据行/表头不动、失败保原值、链式执行、跳过不存在列、无效正则跳过
 */
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { applyTransforms } from '../src-electron/main/modules/kingdeeImport/transform'
import type { TransformRule } from '../src-electron/main/modules/kingdeeImport/transform'

/** 构造 1 行表头 + N 行数据的工作表，返回 { ws, colMap } */
function makeSheet(header: string[], rows: unknown[][]) {
  const ws = new ExcelJS.Workbook().addWorksheet('t')
  ws.addRow(header)
  for (const r of rows) ws.addRow(r)
  const colMap: Record<string, number> = {}
  header.forEach((h, i) => { colMap[h] = i })
  return { ws, colMap, headerCount: 1 }
}

const rule = (partial: Partial<TransformRule>): TransformRule => ({
  id: 'r1',
  targetColumn: '',
  op: 'replace',
  ...partial,
})

describe('applyTransforms · textToNumber', () => {
  it('常规数字字符串转数字', () => {
    const { ws, colMap } = makeSheet(['金额'], [['1,234.5'], [' 42 ']])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'textToNumber' })])
    expect(ws.getRow(2).getCell(1).value).toBe(1234.5)
    expect(ws.getRow(3).getCell(1).value).toBe(42)
    expect(r.failed).toBe(0)
  })

  it('全角数字与货币符号清洗', () => {
    const { ws, colMap } = makeSheet(['金额'], [['１２３'], ['￥99']])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'textToNumber' })])
    expect(ws.getRow(2).getCell(1).value).toBe(123)
    expect(ws.getRow(3).getCell(1).value).toBe(99)
  })

  it('转不了的保留原值并计数', () => {
    const { ws, colMap } = makeSheet(['金额'], [['abc'], ['']])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'textToNumber' })])
    expect(ws.getRow(2).getCell(1).value).toBe('abc')
    expect(r.failed).toBe(1) // 空字符串不算失败
  })
})

describe('applyTransforms · numberToText', () => {
  it('数字转文本并设 @ 格式', () => {
    const { ws, colMap } = makeSheet(['编码'], [[12345]])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '编码', op: 'numberToText' })])
    const cell = ws.getRow(2).getCell(1)
    expect(cell.value).toBe('12345')
    expect(cell.numFmt).toBe('@')
  })
})

describe('applyTransforms · replace', () => {
  it('普通替换', () => {
    const { ws, colMap } = makeSheet(['名称'], [['苹果（赠品）']])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '名称', op: 'replace', find: '（赠品）', replaceWith: '' })])
    expect(ws.getRow(2).getCell(1).value).toBe('苹果')
  })

  it('正则替换', () => {
    const { ws, colMap } = makeSheet(['名称'], [['苹果12斤3两']])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '名称', op: 'replace', find: '\\d+', replaceWith: '#', useRegex: true })])
    expect(ws.getRow(2).getCell(1).value).toBe('苹果#斤#两')
  })

  it('无效正则：整条规则跳过并记入 skippedColumns', () => {
    const { ws, colMap } = makeSheet(['名称'], [['苹果']])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '名称', op: 'replace', find: '([', useRegex: true, replaceWith: '' })])
    expect(ws.getRow(2).getCell(1).value).toBe('苹果')
    expect(r.skippedColumns).toContain('名称')
  })
})

describe('applyTransforms · formula', () => {
  it('{列名} 引用本行其他列并计算后填值', () => {
    const { ws, colMap } = makeSheet(['数量', '单价', '金额'], [[3, 2.5, null]])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'formula', expr: '{数量}*{单价}' })])
    expect(ws.getRow(2).getCell(3).value).toBe(7.5)
  })

  it('ROUND 函数与四则混合运算', () => {
    const { ws, colMap } = makeSheet(['金额'], [[null]])
    // 常量表达式：不引用任何列
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'formula', expr: 'ROUND((1+2)*3.333, 1)' })])
    expect(ws.getRow(2).getCell(1).value).toBe(10)
  })

  it('除数为 0：保留原值并计数', () => {
    const { ws, colMap } = makeSheet(['金额'], [['原值']])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'formula', expr: '1/0' })])
    expect(ws.getRow(2).getCell(1).value).toBe('原值')
    expect(r.failed).toBe(1)
  })

  it('引用的列不存在：保留原值并计数', () => {
    const { ws, colMap } = makeSheet(['金额'], [[5]])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'formula', expr: '{不存在}+1' })])
    expect(ws.getRow(2).getCell(1).value).toBe(5)
    expect(r.failed).toBe(1)
  })
})

describe('applyTransforms · 通用行为', () => {
  it('表头行不受影响', () => {
    const { ws, colMap } = makeSheet(['金额'], [['100']])
    applyTransforms(ws, colMap, 1, [rule({ targetColumn: '金额', op: 'textToNumber' })])
    expect(ws.getRow(1).getCell(1).value).toBe('金额')
  })

  it('目标列不存在：整条跳过，记入 skippedColumns', () => {
    const { ws, colMap } = makeSheet(['金额'], [['100']])
    const r = applyTransforms(ws, colMap, 1, [rule({ targetColumn: '不存在', op: 'textToNumber' })])
    expect(r.skippedColumns).toEqual(['不存在'])
    expect(ws.getRow(2).getCell(1).value).toBe('100')
  })

  it('多条规则按顺序链式执行（先转数字再公式）', () => {
    const { ws, colMap } = makeSheet(['数量', '金额'], [['3', null]])
    applyTransforms(ws, colMap, 1, [
      rule({ id: 'a', targetColumn: '数量', op: 'textToNumber' }),
      rule({ id: 'b', targetColumn: '金额', op: 'formula', expr: '{数量}*2' }),
    ])
    expect(ws.getRow(2).getCell(1).value).toBe(3)
    expect(ws.getRow(2).getCell(2).value).toBe(6)
  })

  it('空规则数组：返回零失败零跳过', () => {
    const { ws, colMap } = makeSheet(['金额'], [['100']])
    const r = applyTransforms(ws, colMap, 1, [])
    expect(r).toEqual({ failed: 0, skippedColumns: [] })
  })
})
