/**
 * step2aJoin 目标表匹配测试
 * 覆盖：多组匹配列联合定位、单组匹配（向后兼容）、匹配列为空的行留空、
 *       模板表缺列 / 合并结果表缺列报错、未配置匹配列报错
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import ExcelJS from 'exceljs'

// 主进程写盘会调用 electron.app.getPath('temp')，测试环境用 os.tmpdir() 兜底
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import { step2aJoin } from '../src-electron/main/modules/kingdeeImport/service'

let tmpDir = ''
const detailPath = () => path.join(tmpDir, '明细.xlsx')
const templatePath = () => path.join(tmpDir, '目标表.xlsx')

async function writeSheet(filePath: string, rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  rows.forEach(r => ws.addRow(r))
  await wb.xlsx.writeFile(filePath)
}

/** 读回 step2a 输出，返回 _matchStatus 列全部值 */
async function readStatuses(filePath: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.worksheets[0]
  const headerCells = (ws.getRow(1).values as any[]).slice(1)
  const headers = headerCells.map(v => String(v ?? ''))
  const idx = headers.indexOf('_matchStatus')
  expect(idx).toBeGreaterThanOrEqual(0)
  const out: string[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    out.push(String(ws.getRow(r).getCell(idx + 1).value ?? ''))
  }
  return out
}

/** 明细表：同一物料在不同仓库各一行；目标表：三行，其中一行仓库对不上 */
const DETAIL_ROWS = [
  ['物料编码', '仓库', '数量'],
  ['A1', 'W1', 10],
  ['A1', 'W2', 20],
  ['A2', 'W1', 30],
]
const TEMPLATE_ROWS = [
  ['物料编码', '仓库', '数量'],
  ['A1', 'W1', ''],
  ['A1', 'W2', ''],
  ['A2', 'W2', ''],
]

const run = (matchPairs: { mergedCol: string; templateCol: string }[]) =>
  step2aJoin(detailPath(), templatePath(), '物料编码', matchPairs, 111111, 1, '', 1, 2, tmpDir)

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xwzs-step2a-'))
  await writeSheet(detailPath(), DETAIL_ROWS)
  await writeSheet(templatePath(), TEMPLATE_ROWS)
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('step2aJoin · 目标表匹配', () => {
  it('两组匹配列：物料编码 + 仓库 同时相同才算匹配', async () => {
    const res = await run([
      { mergedCol: '物料编码', templateCol: '物料编码' },
      { mergedCol: '仓库', templateCol: '仓库' },
    ])
    // A1 组：W1 命中、W2 命中、A2+W2 未命中；A2 组：三行都未命中（A2 组只有 A2+W1）
    const s1 = await readStatuses(res.outputPath)
    expect(s1).toEqual([
      '匹配成功', '匹配成功', '未匹配',
      '未匹配', '未匹配', '未匹配',
    ])
    expect(res.matchedCount).toBe(2)
    expect(res.unmatchedCount).toBe(4)
  })

  it('单组匹配列：行为与旧版一致（同一物料的多行都会展开）', async () => {
    const res = await run([{ mergedCol: '物料编码', templateCol: '物料编码' }])
    // A1 目标行各匹配 2 条明细 → 一对多展开
    expect(await readStatuses(res.outputPath)).toEqual([
      '匹配成功', '匹配成功', '匹配成功', '匹配成功', '未匹配',
      '未匹配', '未匹配', '匹配成功',
    ])
    expect(res.matchedCount).toBe(3)
    expect(res.unmatchedCount).toBe(3)
  })

  it('匹配列全为空的模板行：状态留空，不参与匹配', async () => {
    await writeSheet(templatePath(), [
      ['物料编码', '仓库', '数量'],
      ['', '', ''],
      ['A1', 'W1', ''],
    ])
    const res = await run([
      { mergedCol: '物料编码', templateCol: '物料编码' },
      { mergedCol: '仓库', templateCol: '仓库' },
    ])
    const statuses = await readStatuses(res.outputPath)
    // 4 行 = 2 个分组 × 2 行模板；空键模板行落在每组第 1 行（索引 0、2）
    expect(statuses[0]).toBe('')
    expect(statuses[2]).toBe('')
    expect(statuses[1]).toBe('匹配成功')
    // 还原目标表内容，避免影响后续用例
    await writeSheet(templatePath(), TEMPLATE_ROWS)
  })

  it('目标表缺列时报错', async () => {
    await expect(run([{ mergedCol: '物料编码', templateCol: '不存在的列' }]))
      .rejects.toThrow(/模板表中未找到匹配字段: 不存在的列/)
  })

  it('合并结果表缺列时报错（多组中任一组缺列都拦截）', async () => {
    await expect(run([
      { mergedCol: '物料编码', templateCol: '物料编码' },
      { mergedCol: '不存在的列', templateCol: '仓库' },
    ])).rejects.toThrow(/合并结果表中未找到匹配字段: 不存在的列/)
  })

  it('未配置匹配列时报错', async () => {
    await expect(run([])).rejects.toThrow(/没有配置匹配列/)
  })
})
