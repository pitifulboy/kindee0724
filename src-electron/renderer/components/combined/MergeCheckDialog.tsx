import React, { useEffect, useRef } from 'react'
import { combinedPage as t } from '../../config/appText'

/** 单个文件在某项检测里的问题描述 */
export interface MergeCheckDetail {
  fileName: string
  filePath: string
  /** 该文件对应的问题说明（如工作表名、缺列/多列） */
  value: string
}

/** 一项检测发现的问题 */
export interface MergeCheckIssue {
  title: string
  desc: string
  details: MergeCheckDetail[]
}

interface MergeCheckDialogProps {
  /** 检测结果；为 null 时不渲染 */
  issues: MergeCheckIssue[] | null
  /** 先去改文件（关闭弹框，不继续） */
  onClose: () => void
  /** 仍然继续合并 */
  onContinue: () => void
}

/**
 * 第 1 步合并前「工作表名不一致 / 各文件字段不一致」提示弹框。
 * 只提示不阻断：用户可点「仍然继续合并」照常执行。
 * 无障碍：role=dialog + aria-modal，打开时聚焦主按钮，Esc 关闭，关闭后归还焦点。
 */
const MergeCheckDialog: React.FC<MergeCheckDialogProps> = ({ issues, onClose, onContinue }) => {
  const primaryBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = 'merge-check-title'

  // 打开时聚焦「仍然继续合并」；关闭后把焦点还给触发元素
  useEffect(() => {
    if (!issues) return
    const prevActive = document.activeElement as HTMLElement | null
    primaryBtnRef.current?.focus()
    return () => prevActive?.focus?.()
  }, [issues])

  // Esc 关闭
  useEffect(() => {
    if (!issues) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [issues, onClose])

  if (!issues) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center px-5 py-4 border-b border-amber-100 bg-amber-50">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span id={titleId} className="ml-2 text-sm font-semibold text-amber-900">{t.checkDialogTitle}</span>
        </div>
        {/* 内容 */}
        <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-4">
          {issues.map((issue, idx) => (
            <div key={idx}>
              <p className="text-sm font-semibold text-black">{issue.title}</p>
              <p className="text-xs text-black/70 mt-1 mb-2">{issue.desc}</p>
              <div className="space-y-1">
                {issue.details.map((d, di) => (
                  <button
                    key={di}
                    type="button"
                    className="flex items-start w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg px-2 py-1.5 cursor-pointer focus-ring"
                    onClick={() => window.electronAPI.shell.showItemInFolder(d.filePath)}
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="min-w-0">
                      <span className="block text-xs text-black truncate" title={d.filePath}>{d.fileName}</span>
                      <span className="block text-xs text-black/70 break-words">{d.value}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* 底部按钮：改文件 / 仍然继续 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-press px-4 py-2 text-sm text-black border border-gray-200 rounded-lg hover:bg-gray-50 font-medium transition-colors focus-ring">
            {t.checkClose}
          </button>
          <button
            ref={primaryBtnRef}
            onClick={onContinue}
            className="btn-press px-4 py-2 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors focus-ring">
            {t.checkContinue}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MergeCheckDialog
