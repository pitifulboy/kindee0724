import React from 'react'
import { combinedPage as t, visualization as v } from '../../config/appText'

/**
 * 界面3 · 拆分示意图（第 3 步 · 订单拆分）
 *
 * 与「界面1 · 合并示意图」同款效果，方向相反：
 *   合并 = 多个订单文件 → 合并 → 一张合并结果
 *   拆分 = 一张合并结果 → 拆分 → 多个订单文件（最多显示 2 个文件名，其余用省略号示意）
 */

interface SplitSketchViewProps {
  /** 拆分依据列（groupByColumn） */
  groupByColumn: string
  /** 首个编号（startBillNo） */
  startBillNo: number
  /** 单号递增值（billNoStep） */
  billNoStep: number
}

/** 示意用的分组名（真实分组名取决于数据） */
const SAMPLE_GROUPS = ['A', 'B']

/** 单个文件方框 */
const FileBox: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex items-center min-w-0 px-2.5 py-2 border-2 border-gray-300 rounded-md bg-white">
    <svg className="w-4 h-4 flex-shrink-0 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    <span className="ml-1.5 text-xs text-black truncate" title={name}>{name}</span>
  </div>
)

const SplitSketchView: React.FC<SplitSketchViewProps> = ({ groupByColumn, startBillNo, billNoStep }) => {
  const step = billNoStep || 1

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-black">{v.splitSketchTitle}</span>
        <span className="text-xs text-black">
          {groupByColumn ? v.splitGroupBy(groupByColumn) : v.splitPending}
        </span>
      </div>

      <div className="p-3">
        {!groupByColumn ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <svg className="w-8 h-8 text-black/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
            </svg>
            <p className="text-sm text-black">{v.splitNeedGroupBy}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {/* 左：输入 —— 上一步的合并结果（合并示意里的结果框） */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center px-2.5 py-2 border-2 border-primary-400 bg-primary-50 rounded-md">
                  <svg className="w-4 h-4 mr-1.5 flex-shrink-0 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
                  </svg>
                  <span className="text-xs font-medium text-black truncate" title={t.defaultMergeOutput}>{t.defaultMergeOutput}</span>
                </div>
              </div>

              {/* 中：向右箭头 — 拆分 */}
              <div className="flex flex-col items-center justify-center flex-shrink-0 px-0.5">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m0 0l-6-6m6 6l-6 6" />
                </svg>
                <span className="text-xs text-black/70 mt-0.5">{v.splitSketchArrow}</span>
              </div>

              {/* 右：拆分结果 —— 最多显示 2 个文件名 */}
              <div className="flex-1 min-w-0 space-y-2">
                {SAMPLE_GROUPS.map((g, i) => (
                  <FileBox key={g} name={v.splitSketchFileName(g, startBillNo + i * step)} />
                ))}
                <div className="flex items-center justify-center gap-1.5 px-2.5 py-2 border-2 border-dashed border-gray-300 rounded-md">
                  <span className="text-sm leading-none text-black">…</span>
                  <span className="text-xs text-black/70 truncate">{v.splitSketchMore}</span>
                </div>
                <FileBox name={v.splitSketchSummaryFile} />
              </div>
            </div>

            <div className="pt-1 space-y-0.5 text-center">
              <p className="text-xs text-black/70">{v.splitBillNoRule(startBillNo, step)}</p>
              <p className="text-xs text-black/70">{v.splitSketchOnlyTwo}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SplitSketchView
