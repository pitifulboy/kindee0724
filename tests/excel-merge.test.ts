/**
 * leftJoin 单元测试
 * 覆盖：left/inner/right 语义、一对多展开、列名冲突加后缀、未匹配填空、多字段联合匹配
 */
import { describe, it, expect } from 'vitest'
import { leftJoin } from '../src-electron/main/modules/excelMerge/service'

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
