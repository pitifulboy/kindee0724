import React from 'react'
import { combinedPage as t, visualization as v } from '../../config/appText'

/**
 * 界面1 · 合并示意图
 *
 * 用文件方框示意「多个订单文件合并成一张表」：
 * 最多只显示前 2 个文件名，多于 2 个时用省略号方框示意其余文件。
 */

interface OrderFileItem {
  id: string
  name: string
}

interface MergeSketchViewProps {
  /** 订单文件清单（来自 CombinedPage 的 orderFiles） */
  orderFiles: OrderFileItem[]
}

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

const MergeSketchView: React.FC<MergeSketchViewProps> = ({ orderFiles }) => {
  const count = orderFiles.length
  const shown = orderFiles.slice(0, 2)
  const rest = count - shown.length

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-black">{v.mergeSketchTitle}</span>
        <span className="text-xs text-black">{v.fileCount(count)}</span>
      </div>

      <div className="p-3">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <svg className="w-8 h-8 text-black/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 13h6m-3-3v6m-9 4h18a2 2 0 002-2V7a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-black">{v.mergeSketchEmpty}</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* 左：待合并的订单文件 */}
            <div className="flex-1 min-w-0 space-y-2">
              {shown.map(f => <FileBox key={f.id} name={f.name} />)}
              {rest > 0 && (
                <div className="flex items-center justify-center gap-1.5 px-2.5 py-2 border-2 border-dashed border-gray-300 rounded-md">
                  <span className="text-sm leading-none text-black">…</span>
                  <span className="text-xs text-black/70 truncate">{v.mergeSketchMore(rest)}</span>
                </div>
              )}
            </div>

            {/* 中：向右箭头 — 合并 */}
            <div className="flex flex-col items-center justify-center flex-shrink-0 px-0.5">
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m0 0l-6-6m6 6l-6 6" />
              </svg>
              <span className="text-xs text-black/70 mt-0.5">{v.mergeSketchArrow}</span>
            </div>

            {/* 右：合并结果方框 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center px-2.5 py-2 border-2 border-primary-400 bg-primary-50 rounded-md">
                <svg className="w-4 h-4 mr-1.5 flex-shrink-0 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
                </svg>
                <span className="text-xs font-medium text-black truncate" title={t.defaultMergeOutput}>{t.defaultMergeOutput}</span>
              </div>
              {count > 2 && <p className="mt-1 text-xs text-black/70 text-center">{v.mergeSketchOnlyTwo}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MergeSketchView
