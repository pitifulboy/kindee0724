import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as XLSX from 'xlsx'
import cptable from 'codepage'

// shared/excel 顶层引用 electron 的 app（仅写盘/目录探测用），这里用最小替身避免拉起 Electron
vi.mock('electron', () => ({ app: { getPath: () => 'C:/tmp' } }))

import { readTable, readColumnsAtRow, readWorkbookMeta } from '../src-electron/main/shared/excel'

let dir: string
const write = (name: string, data: Buffer | string) => {
  const p = path.join(dir, name)
  fs.writeFileSync(p, data)
  return p
}

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xwzs-read-')) })
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('readTable · CSV', () => {
  it('解析 UTF-8（含 BOM）与引号包裹的逗号 / 换行', async () => {
    const csv = '\uFEFF姓名,备注,金额\r\n张三,"含,逗号",100\r\n李四,"第一行\n第二行",200\r\n'
    const { columns, rows } = await readTable(write('utf8.csv', Buffer.from(csv, 'utf-8')))

    expect(columns).toEqual(['姓名', '备注', '金额'])
    expect(rows).toHaveLength(2)
    expect(rows[0]['备注']).toBe('含,逗号')
    expect(rows[1]['备注']).toBe('第一行\n第二行')
    expect(rows[0]['金额']).toBe('100')
  })

  it('无 BOM 的 GBK 编码可自动回退解码', async () => {
    const gbk = Buffer.from(cptable.utils.encode(936, '货号,数量\r\nA01,5\r\nB02,7\r\n'))
    const { columns, rows } = await readTable(write('gbk.csv', gbk))

    expect(columns).toEqual(['货号', '数量'])
    expect(rows.map(r => r['货号'])).toEqual(['A01', 'B02'])
  })

  it('跳过全空行、裁剪末尾空列', async () => {
    const csv = 'a,b,,\n1,2,,\n,,\n3,4,,\n'
    const { columns, rows } = await readTable(write('blank.csv', csv))

    expect(columns).toEqual(['a', 'b'])
    expect(rows).toHaveLength(2)
    expect(rows[1]['a']).toBe('3')
  })

  it('readColumnsAtRow 支持指定表头行', async () => {
    const csv = '说明行,,,\n订单号,物料编码,数量\nA01,M001,5\n'
    const p = write('two-header.csv', csv)

    expect(await readColumnsAtRow(p, 1)).toEqual(['说明行'])
    expect(await readColumnsAtRow(p, 2)).toEqual(['订单号', '物料编码', '数量'])
  })
})

describe('readTable · XLS（BIFF 二进制）', () => {
  it('可读取 .xls 并保留数字类型', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['订单号', '数量'], ['A001', 5], ['A002', 7]]), 'Sheet1')
    const buf: Buffer = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' })

    const { columns, rows } = await readTable(write('orders.xls', buf))

    expect(columns).toEqual(['订单号', '数量'])
    expect(rows).toHaveLength(2)
    expect(rows[0]['数量']).toBe(5)
  })
})

describe('readWorkbookMeta（合并前检测：工作表名 + 首行列名）', () => {
  it('.xls 返回全部工作表名与第一张表的列名', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['订单号', '数量'], ['A001', 5]]), '订单明细')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明']]), '帮助')
    const p = write('meta.xls', XLSX.write(wb, { bookType: 'biff8', type: 'buffer' }) as Buffer)

    expect(await readWorkbookMeta(p)).toEqual({ sheetNames: ['订单明细', '帮助'], headerColumns: ['订单号', '数量'] })
  })

  it('.csv 没有工作表，只返回首行列名', async () => {
    const p = write('meta.csv', '订单号,数量,,\nA001,5,,\n')

    expect(await readWorkbookMeta(p)).toEqual({ sheetNames: [], headerColumns: ['订单号', '数量'] })
  })
})
