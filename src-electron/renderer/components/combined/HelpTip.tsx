import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface HelpTipProps {
  /** 气泡里的说明文字（按《UI设计规范.md》§5.3：≤ 2 句，且不得承载「不做就进行不下去」的信息） */
  text: string
  /** 触发器的无障碍名，默认「查看说明」 */
  label?: string
  /** 水平对齐偏好：默认气泡左缘对齐触发器左缘；'right' 为右缘对齐（越界时自动收进视口） */
  align?: 'left' | 'right'
}

/**
 * 「?」帮助提示。
 *
 * 规范依据《UI设计规范.md》§5.3：
 * - 气泡通过 createPortal 挂到 body、position: fixed + 最高层级，
 *   不受任何祖先 overflow-hidden 裁剪，始终悬浮在最顶层
 * - 触达区 ≥ 24×24 CSS px（WCAG 2.5.8）→ 图标 14px + w-6/h-6 容器
 * - 鼠标悬浮与键盘聚焦均可触发（WCAG 2.1.1）
 * - Esc 可关闭（WCAG 1.4.13 Dismissible）
 * - 指针可从触发器移入气泡而不消失（WCAG 1.4.13 Hoverable，离开延时关闭桥接）
 * - 不自动消失（WCAG 1.4.13 Persistent；滚动 / 窗口缩放时关闭以防错位）
 * - role=tooltip + aria-describedby 关联触发器
 * - 点击可切换（无鼠标 / 触控兜底）
 */
const HelpTip: React.FC<HelpTipProps> = ({ text, label = '查看说明', align = 'left' }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const tipId = useId()

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  /** 打开（悬浮 / 聚焦共用）：取消未决的延时关闭 */
  const openTip = () => {
    clearCloseTimer()
    setOpen(true)
  }

  /** 延时关闭：给指针留出从触发器移入气泡的时间（Hoverable 桥接） */
  const scheduleClose = () => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 100)
  }

  // 打开后计算 fixed 坐标（layout effect 在绘制前完成，不闪烁），并做视口越界修正
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const b = bubbleRef.current
    const bw = b ? b.offsetWidth : 0
    const bh = b ? b.offsetHeight : 0
    let left = align === 'right' ? r.right - bw : r.left
    if (bw > 0) left = Math.max(8, Math.min(left, window.innerWidth - bw - 8))
    const below = r.bottom + 6
    const fitsBelow = below + bh <= window.innerHeight - 8
    const top = fitsBelow || r.top - bh - 6 < 8 ? below : r.top - bh - 6
    setPos({ top, left })
  }, [open, text, align])

  // 滚动 / 窗口缩放时直接关闭，避免 fixed 气泡与触发器错位
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // 卸载时清理延时器
  useEffect(() => clearCloseTimer, [])

  // Esc 关闭（关闭时阻止继续冒泡，避免同时关掉外层弹框）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  return (
    <span className="relative inline-flex items-center flex-shrink-0 align-middle">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onMouseEnter={openTip}
        onMouseLeave={scheduleClose}
        onFocus={openTip}
        onBlur={scheduleClose}
        onClick={() => setOpen(v => !v)}
        className="w-6 h-6 flex items-center justify-center rounded-full text-black/60 hover:text-black hover:bg-gray-100 focus-ring"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M9.6 9.2a2.5 2.5 0 114.6 1.3c-.4.7-1.2 1.1-1.6 1.7-.2.3-.3.6-.3 1" />
          <path strokeLinecap="round" d="M12 16.6h.01" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            role="tooltip"
            onMouseEnter={openTip}
            onMouseLeave={scheduleClose}
            className="fixed z-[9999] w-max max-w-xs px-2.5 py-1.5 rounded-md bg-black/85 text-white text-xs leading-relaxed shadow-lg"
            style={{
              top: pos ? pos.top : -9999,
              left: pos ? pos.left : -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  )
}

export default HelpTip
