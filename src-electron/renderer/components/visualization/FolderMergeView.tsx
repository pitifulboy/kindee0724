import React from 'react'

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
        <span className="text-sm font-semibold text-black">待合并文件清单</span>
        <span className="text-xs text-black">{count} 个文件</span>
      </div>
      <div className="p-3 max-h-64 overflow-y-auto">
        {count === 0 ? (
          <p className="text-xs text-black text-center py-6">尚未拖入待合并的订单文件夹</p>
        ) : (
          <div className="space-y-1">
            {orderFiles.map((f, i) => (
              <div key={f.id} className="flex items-center text-xs text-black">
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