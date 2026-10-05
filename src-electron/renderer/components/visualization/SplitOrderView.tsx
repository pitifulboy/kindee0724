import React from 'react'

/**
 * 界面3 · 订单拆分（客户订单表拆分&匹配 · 第一步）
 *
 * 业务（以 service.ts step1SplitOrders 为准）：
 * - 输入 = 前一步「合并表格 + 关联辅助表」产出的合并总表（table1）
 * - 按「订单表拆分依据」列 groupByColumn 分组（clean 归一化后分组）
 * - 每组按 billNoBaseField 排序，从起始单号 startBillNo 按 billNoStep 递增分配单号
 * - 每组输出一个文件：订单_{组名}_{单号}.xlsx，另汇总输出「订单拆分汇总.xlsx」
 *
 * 本视图仅做可视化示意：左「合并总表」→ 中「拆分规则」→ 右「订单文件」。
 */

interface SplitOrderViewProps {
  /** 合并总表字段列表（来自 table1Columns / orderColumns） */
  mergedColumns: string[]
  /** 订单表拆分依据（groupByColumn） */
  groupByColumn: string
  /** 起始单号（startBillNo） */
  startBillNo: number
  /** 单号递增值（billNoStep） */
  billNoStep: number
}

/** 匹配键/分组键高亮底色，与建模视图保持一致 */
const KEY_FILL = '#d9f2f9'

/** 示例分组名（仅示意，真实分组名取决于数据） */
const SAMPLE_GROUPS = ['A', 'B', 'C']

const SplitOrderView: React.FC<SplitOrderViewProps> = ({
  mergedColumns, groupByColumn, startBillNo, billNoStep,
}) => {
  const step = billNoStep || 1

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-black">订单拆分（第一步）</span>
        <span className="text-xs text-black">
          {groupByColumn ? `按「${groupByColumn}」分组` : '待配置'}
        </span>
      </div>

      {!groupByColumn ? (
        <p className="text-xs text-black text-center py-6">请先选择订单表拆分依据</p>
      ) : (
        <div className="flex items-stretch gap-3 p-3">
          {/* 合并总表 */}
          <div className="flex-1 min-w-0 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-black">合并总表</span>
              <span className="text-[11px] text-gray-500 ml-2">{mergedColumns.length} 列</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
              {mergedColumns.length === 0 ? (
                <p className="text-[11px] text-black text-center py-4">暂无字段</p>
              ) : (
                mergedColumns.map(col => {
                  const isKey = col === groupByColumn
                  return (
                    <div key={col}
                      className={`text-[11px] truncate px-1.5 py-0.5 rounded ${isKey ? 'font-bold text-black' : 'text-black'}`}
                      style={isKey ? { background: KEY_FILL } : undefined}
                      title={col}>
                      {col}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 拆分规则 */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 w-28 text-center">
            <span className="text-lg text-primary-800 leading-none">→</span>
            <span className="text-[11px] text-black mt-1 leading-snug">
              按「{groupByColumn}」分组
            </span>
            <span className="text-[11px] text-black mt-0.5 leading-snug">
              单号 {startBillNo} 起，每单 +{step}
            </span>
          </div>

          {/* 订单文件 */}
          <div className="flex-1 min-w-0 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-black">订单文件</span>
            </div>
            <div className="max-h-48 overflow-y-auto p-1.5 space-y-1">
              {SAMPLE_GROUPS.map((g, i) => (
                <div key={g} className="text-[11px] text-black truncate px-1.5 py-0.5 bg-gray-50 rounded"
                  title={`订单_${g}_${startBillNo + i * step}.xlsx`}>
                  订单_{g}_{startBillNo + i * step}.xlsx
                </div>
              ))}
              <div className="text-[11px] text-gray-500 px-1.5 pt-0.5">…</div>
              <div className="text-[11px] text-black truncate px-1.5 py-0.5 rounded" style={{ background: KEY_FILL }}>
                订单拆分汇总.xlsx
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SplitOrderView