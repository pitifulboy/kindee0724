import React from 'react'
import { useNativeDropZone } from '../hooks/useNativeDropZone'

interface NativeDropZoneProps {
  /** 拖入文件（目录亦可，由调用方展开）时回调 */
  onFiles: (files: File[]) => void
  /** 常态样式 */
  className?: string
  /** 拖拽悬停时样式（替换 className，非追加，避免同类样式冲突） */
  activeClassName?: string
  children: React.ReactNode
}

/**
 * 原生拖拽落区容器：统一处理 dragover / dragleave / drop 与悬停高亮。
 * 供订单文件、模板表、辅助表三处复用。
 */
const NativeDropZone: React.FC<NativeDropZoneProps> = ({
  onFiles, className = '', activeClassName = '', children,
}) => {
  const { ref, dragOver } = useNativeDropZone<HTMLDivElement>(onFiles)
  return (
    <div ref={ref} className={dragOver ? activeClassName : className}>
      {children}
    </div>
  )
}

export default NativeDropZone
