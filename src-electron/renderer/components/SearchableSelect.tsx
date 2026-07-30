import React, { useState, useRef, useEffect, useMemo } from 'react'
import { combinedPage as t } from '../config/appText'

/**
 * SearchableSelect - 可搜索的下拉选择组件
 *
 * 功能：
 * - 点击展开下拉面板，面板顶部有搜索输入框实时过滤选项
 * - 选项列表可滚动（max-height 200px）
 * - 点击选项后关闭面板
 * - 点击外部区域关闭面板
 * - 键盘支持：Escape 关闭，Enter 选中第一个匹配项
 * - 选中值高亮显示
 * - 空过滤结果时显示"无匹配结果"
 * - 无选项时（options 为空）显示"请先上传文件"
 */
interface SearchableSelectProps {
  /** 当前选中的值 */
  value: string
  /** 可选项列表 */
  options: string[]
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 占位提示文本 */
  placeholder?: string
  /** 是否禁用 */
  disabled?: boolean
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = t.selectPlaceholder,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 过滤选项（不区分大小写的包含匹配）
  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) {
      return options
    }
    const lowerSearch = searchText.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(lowerSearch))
  }, [options, searchText])

  // 点击外部关闭下拉
  useEffect(() => {
    if (!isOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchText('')
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen])

  // 打开时自动聚焦搜索框并重置状态
  useEffect(() => {
    if (isOpen) {
      setSearchText('')
      setHighlightedIndex(0)
      // 延迟聚焦以确保 DOM 已渲染
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
      })
    }
  }, [isOpen])

  // 过滤结果变化时重置高亮索引
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  // 处理选项点击
  const handleSelect = (opt: string) => {
    onChange(opt)
    setIsOpen(false)
    setSearchText('')
  }

  // 切换下拉面板
  const handleToggle = () => {
    if (disabled) return
    setIsOpen((prev) => !prev)
  }

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setSearchText('')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions.length > 0) {
        handleSelect(filteredOptions[highlightedIndex] ?? filteredOptions[0])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
    }
  }

  // 确定显示文本
  const displayText = value || placeholder
  const isPlaceholder = !value

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 触发器 - 模拟 select 外观 */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left transition-all duration-200 flex items-center justify-between ${
          disabled
            ? 'bg-gray-50 cursor-not-allowed opacity-50'
            : 'bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
        } ${isPlaceholder ? 'text-gray-400' : 'text-gray-700'}`}
      >
        <span className="truncate">{displayText}</span>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.selectSearchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              // 无选项（文件未上传）
              <div className="px-3 py-4 text-sm text-gray-400 text-center">{t.selectNoOptions}</div>
            ) : filteredOptions.length === 0 ? (
              // 过滤后无匹配
              <div className="px-3 py-4 text-sm text-gray-400 text-center">{t.selectNoMatch}</div>
            ) : (
              filteredOptions.map((opt, idx) => (
                <div
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    opt === value
                      ? 'bg-primary-50 text-primary-600 font-medium'
                      : highlightedIndex === idx
                        ? 'bg-gray-100 text-gray-700'
                        : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate block">{opt}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
