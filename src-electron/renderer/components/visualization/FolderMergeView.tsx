import React from 'react'
import { visualization as v } from '../../config/appText'

/**
 * 界面1 · 待合并文件清单
 *
 * 简化版：拖入待合并的订单文件夹后，只展示其中文件的清单。
 * 不展示字段、不展示数据、不展示合并结果。
 */

interface OrderFileItem {
  id: string
  name: string
}

interface FolderMergeViewProps {
  /** 订单文件清单（来自 CombinedPage 的 orderFiles） */
  orderFiles: OrderFileItem[]
}

const FolderMergeView: React.FC<FolderMergeViewProps> = ({ orderFiles }) => {
  const count = orderFiles.length

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-black">{v.folderMergeTitle}</span>
        <span className="text-xs text-black">{v.fileCount(count)}</span>
      </div>
      <div className="p-3 max-h-64 overflow-y-auto">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <svg className="w-8 h-8 text-black/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 13h6m-3-3v6m-9 4h18a2 2 0 002-2V7a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-black">{v.folderMergeEmpty}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {orderFiles.map((f, i) => (
              <div key={f.id} className="flex items-center text-sm text-black">
                <span className="w-6 flex-shrink-0 text-black">{i + 1}.</span>
                <span className="truncate" title={f.name}>{f.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FolderMergeView
