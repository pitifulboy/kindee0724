import React, { useEffect } from 'react'

export interface ToastMessage {
  type: 'success' | 'error'
  msg: string
}

/** 成功提示 4 秒；错误提示多留 3 秒，避免用户没看清就消失 */
const AUTO_CLOSE_MS = { success: 4000, error: 7000 } as const

/** 右下角浮层提示（成功 / 失败），可手动关闭，超时自动关闭 */
const Toast: React.FC<{ toast: ToastMessage | null; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onClose, AUTO_CLOSE_MS[toast.type])
    return () => clearTimeout(timer)
  }, [toast, onClose])

  if (!toast) return null

  const isSuccess = toast.type === 'success'

  return (
    <div
      role="status"
      aria-live={isSuccess ? 'polite' : 'assertive'}
      className={`animate-slide-in fixed top-14 right-6 z-[100] max-w-md pl-4 pr-2 py-3 rounded-xl shadow-lg flex items-start gap-2 ${
        isSuccess ? 'bg-success-700' : 'bg-red-700'
      }`}
    >
      <svg className="w-5 h-5 text-white flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {isSuccess ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        )}
      </svg>
      <span className="text-white text-sm font-medium whitespace-pre-line leading-snug">{toast.msg}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭提示"
        title="关闭提示"
        className="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded text-white/90 hover:text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default Toast
