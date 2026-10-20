/**
 * leftJoin / 计算字段单元测试
 * 覆盖：left/inner/right 语义、一对多展开、列名冲突加后缀、未匹配填空、多字段联合匹配、
 *       计算字段四则运算（文本转数字、链式顺序、除零留空、空值按 0）
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import ExcelJS from 'exceljs'

// joinAuxExcelData 写盘会调用 electron.app.getPath('temp')，测试环境用 os.tmpdir() 兜底
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import { leftJoin, applyComputedFields, joinAuxExcelData } from '../src-electron/main/modules/excelMerge/service'

describe('leftJoin', () => {
  const pairs = [{ orderCol: '单号', auxCol: '订单号' }]

  it('left：未匹配行保留，辅助列填空（辅助表全部列含匹配列都会并入）', () => {
    const order = [{ 单号: 'A1' }, { 单号: 'A2' }]
    const aux = [{ 订单号: 'A1', 产品: '苹果' }]
    const r = leftJoin(order, aux, pairs, '产品表', 'left')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toEqual({ 单号: 'A1', 订单号: 'A1', 产品: '苹果' })
    expect(r.rows[1]).toEqual({ 单号: 'A2', 订单号: '', 产品: '' })
    expect(r.matched).toBe(1)
    expect(r.unmatched).toBe(1)
  })

  it('inner：未匹配行被剔除', () => {
    const order = [{ 单号: 'A1' }, { 单号: 'A2' }]
    const aux = [{ 订单号: 'A1', 产品: '苹果' }]
    const r = leftJoin(order, aux, pairs, '产品表', 'inner')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].单号).toBe('A1')
  })

  it('一对多：一个订单匹配多条辅助行时展开为多行', () => {
    const order = [{ 单号: 'A1' }]
    const aux = [
      { 订单号: 'A1', 产品: '苹果' },
      { 订单号: 'A1', 产品: '香蕉' },
    ]
    const r = leftJoin(order, aux, pairs, '产品表', 'left')
    expect(r.rows).toHaveLength(2)
    expect(r.rows.map(x => x.产品)).toEqual(['苹果', '香蕉'])
    expect(r.matched).toBe(1)
  })

  it('列名冲突：辅助表列与订单表同列名时加 _表名 后缀', () => {
    const order = [{ 单号: 'A1', 备注: '订单备注' }]
    const aux = [{ 订单号: 'A1', 备注: '产品备注' }]
    const r = leftJoin(order, aux, pairs, '产品表', 'left')
    expect(r.rows[0].备注).toBe('订单备注')
    expect(r.rows[0]['备注_产品表']).toBe('产品备注')
  })

  it('多字段联合匹配：所有匹配键都相等才算匹配', () => {
    const order = [{ 单号: 'A1', 仓库: '东' }]
    const aux = [
      { 订单号: 'A1', 仓: '东', 库存: 10 },
      { 订单号: 'A1', 仓: '西', 库存: 99 },
    ]
    const r = leftJoin(
      order,
      aux,
      [
        { orderCol: '单号', auxCol: '订单号' },
        { orderCol: '仓库', auxCol: '仓' },
      ],
      '库存表',
      'left'
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].库存).toBe(10)
  })

  it('辅助表为空：全部行未匹配，辅助列无列名可合', () => {
    const order = [{ 单号: 'A1' }]
    const r = leftJoin(order, [], pairs, '产品表', 'left')
    expect(r.rows).toEqual([{ 单号: 'A1' }])
    expect(r.unmatched).toBe(1)
  })
})

describe('计算字段 applyComputedFields', () => {
  it('两字段相加：文本数字自动转数字', () => {
    const rows = [{ 单价: '10', 数量: '2.5' }, { 单价: 3, 数量: 4 }]
    applyComputedFields(rows, [{ id: 'f1', name: '金额', items: [{ col: '单价' }, { col: '数量', op: '*' }] }])
    expect(rows[0].金额).toBe(25)
    expect(rows[1].金额).toBe(12)
  })

  it('三字段混合运算：按从上到下顺序链式计算，(a+b)*c', () => {
    const rows = [{ a: 1, b: 2, c: 3 }]
    applyComputedFields(rows, [{
      id: 'f1', name: '结果',
      items: [{ col: 'a' }, { col: 'b', op: '+' }, { col: 'c', op: '*' }],
    }])
    expect(rows[0].结果).toBe(9)
  })

  it('减法与除法', () => {
    const rows = [{ a: 10, b: 4 }]
    applyComputedFields(rows, [{ id: 'f1', name: '差', items: [{ col: 'a' }, { col: 'b', op: '-' }] }])
    expect(rows[0].差).toBe(6)
    applyComputedFields(rows, [{ id: 'f2', name: '商', items: [{ col: 'a' }, { col: 'b', op: '/' }] }])
    expect(rows[0].商).toBe(2.5)
  })

  it('除以 0：结果留空', () => {
    const rows = [{ a: 10, b: 0 }]
    applyComputedFields(rows, [{ id: 'f1', name: '商', items: [{ col: 'a' }, { col: 'b', op: '/' }] }])
    expect(rows[0].商).toBe('')
  })

  it('空单元格 / 无法解析的值按 0 处理', () => {
    const rows = [{ a: '', b: 'abc', c: 5 }]
    applyComputedFields(rows, [{ id: 'f1', name: '和', items: [{ col: 'a' }, { col: 'b', op: '+' }, { col: 'c', op: '+' }] }])
    expect(rows[0].和).toBe(5)
  })

  it('单字段：仅做文本转数字生成新列；浮点噪声被抹平', () => {
    const rows = [{ a: '7' }, { x: 0.1, y: 0.2 }]
    applyComputedFields(rows, [{ id: 'f1', name: '数值', items: [{ col: 'a' }] }])
    expect(rows[0].数值).toBe(7)
    applyComputedFields(rows, [{ id: 'f2', name: '和', items: [{ col: 'x' }, { col: 'y', op: '+' }] }])
    expect(rows[1].和).toBe(0.3)
  })
})

describe('joinAuxExcelData 集成：第 2 步导出结果 = 计算字段之后的表格', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xwzs-joinaux-'))
  const rawPath = path.join(tmpRoot, '合并原表.xlsx')
  const auxPath = path.join(tmpRoot, '价格表.xlsx')
  const outPath = path.join(tmpRoot, '合并结果.xlsx')

  beforeAll(async () => {
    // 合并原表：D01 数量 2，D02 数量 3
    const wb1 = new ExcelJS.Workbook()
    const ws1 = wb1.addWorksheet('数据')
    ws1.addRow(['单号', '物料', '数量'])
    ws1.addRow(['D01', 'P1', 2])
    ws1.addRow(['D02', 'P2', 3])
    await wb1.xlsx.writeFile(rawPath)
    // 辅助表：P1 单价 10，P2 单价 5
    const wb2 = new ExcelJS.Workbook()
    const ws2 = wb2.addWorksheet('价格')
    ws2.addRow(['物料', '单价'])
    ws2.addRow(['P1', 10])
    ws2.addRow(['P2', 5])
    await wb2.xlsx.writeFile(auxPath)
  })

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('导出的合并结果.xlsx 包含计算字段列，值在 join 后按行计算', async () => {
    const res = await joinAuxExcelData({
      inputPath: rawPath,
      auxFilePaths: { t1: auxPath },
      config: {
        name: '测试', orderSubFolder: '', auxSubFolder: '', textColumns: [],
        auxiliaryTables: [{
          id: 't1', name: '价格表', fileName: '价格表.xlsx', filePath: auxPath,
          matchPairs: [{ orderCol: '物料', auxCol: '物料' }], how: 'left',
        }],
        outputFileName: '合并结果.xlsx', orderFilePaths: [], outputDir: tmpRoot,
      },
      outputDir: tmpRoot,
      computedFields: [
        { id: 'f1', name: '金额', items: [{ col: '数量' }, { col: '单价', op: '*' }] },
        { id: 'f2', name: '翻倍数量', items: [{ col: '数量' }, { col: '数量', op: '+' }] },
      ],
    }, () => {})

    // 读回导出文件验证：计算字段列在表头末尾，值正确（xlsx 重读不保留列 key，按索引取值）
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(res.outputPath)
    const ws = wb.worksheets[0]
    const headers: string[] = []
    ws.getRow(1).eachCell((c) => headers.push(String(c.value)))
    const colOf = (name: string) => headers.indexOf(name) + 1
    expect(headers[headers.length - 2]).toBe('金额')
    expect(headers[headers.length - 1]).toBe('翻倍数量')
    expect(ws.getRow(2).getCell(colOf('金额')).value).toBe(20)  // D01: 2 × 10
    expect(ws.getRow(3).getCell(colOf('金额')).value).toBe(15)  // D02: 3 × 5
    expect(ws.getRow(2).getCell(colOf('翻倍数量')).value).toBe(4)
    expect(ws.getRow(3).getCell(colOf('翻倍数量')).value).toBe(6)
    expect(res.outputPath).toBe(outPath)
  })
})
