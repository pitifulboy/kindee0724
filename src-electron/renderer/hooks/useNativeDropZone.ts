import { useCallback, useEffect, useRef, useState } from 'react'

export interface NativeDropZoneBinding<T extends HTMLElement> {
  /** 绑定到目标元素的 callback ref（身份稳定，不会每次渲染重新挂载） */
  ref: (el: T | null) => void
  /** 是否有文件正在拖拽悬停 */
  dragOver: boolean
}

/**
 * 原生文件拖拽落区。
 *
 * 用 useEffect 统一绑定 / 解绑 dragover / dragleave / drop，组件卸载自动回收。
 * 回调通过 ref 保持最新，避免因回调身份变化而反复重绑。
 */
export function useNativeDropZone<T extends HTMLElement = HTMLDivElement>(
  onFiles: (files: File[]) => void
): NativeDropZoneBinding<T> {
  const [dragOver, setDragOver] = useState(false)
  const [el, setEl] = useState<T | null>(null)
  const onFilesRef = useRef(onFiles)

  useEffect(() => {
    onFilesRef.current = onFiles
  }, [onFiles])

  useEffect(() => {
    if (!el) return

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    }
    const handleDragLeave = () => setDragOver(false)
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) onFilesRef.current(files)
    }

    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)

    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
    }
  }, [el])

  const ref = useCallback((node: T | null) => setEl(node), [])

  return { ref, dragOver }
}
