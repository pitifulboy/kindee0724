import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * PDF拆分页面
 * 支持三种拆分模式：自定义范围、每页一个文件、每N页一个文件
 */

interface PdfFile {
  path: string
  name: string
  size: number
}

type SplitMode = 'range' | 'eachPage' | 'everyN'

interface PdfSplitProgress {
  currentPart: number
  totalParts: number
  overallProgress: number
  status: 'pending' | 'splitting' | 'completed' | 'error'
  message?: string
}

interface PdfSplitResult {
  success: boolean
  outputFiles: string[]
  error?: string
}

const PdfSplitPage: React.FC = () => {
  // 文件状态
  const [file, setFile] = useState<PdfFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // 拆分设置
  const [mode, setMode] = useState<SplitMode>('range')
  const [pageRanges, setPageRanges] = useState('')
  const [pagesPerFile, setPagesPerFile] = useState(1)
  const [filePrefix, setFilePrefix] = useState('')
  const [outputDir, setOutputDir] = useState('')

  // 运行状态
  const [isSplitting, setIsSplitting] = useState(false)
  const [progress, setProgress] = useState<PdfSplitProgress | null>(null)
  const [result, setResult] = useState<PdfSplitResult | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const progressUnsubscribeRef = useRef<(() => void) | null>(null)

  // 初始化输出目录（默认桌面）
  useEffect(() => {
    const initDir = async () => {
      if (!outputDir) {
        const desktop = await window.electronAPI.app.getPath('desktop')
        setOutputDir(desktop)
      }
    }
    initDir()
  }, [])

  // 清理进度监听
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
      }
    }
  }, [])

  // Toast 自动消失
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '未知'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 从文件路径提取文件名（去扩展名）
  const getNameWithoutExt = (filePath: string): string => {
    const basename = filePath.split(/[/\\]/).pop() || filePath
    const lastDot = basename.lastIndexOf('.')
    return lastDot > 0 ? basename.substring(0, lastDot) : basename
  }

  // 从文件路径提取目录
  const getDirFromPath = (filePath: string): string => {
    const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    return lastSep > 0 ? filePath.substring(0, lastSep) : ''
  }

  // 选择PDF文件（单个）
  const handleSelectFile = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }],
      multiSelections: false
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const fp = result.filePaths[0]
      const info = await window.electronAPI.file.getFileInfo(fp)
      const fileName = info.success ? info.data.name : fp.split(/[/\\]/).pop() || fp
      const fileSize = info.success ? info.data.size : 0

      setFile({ path: fp, name: fileName, size: fileSize })

      // 智能默认值：输出目录默认为源文件所在目录，前缀默认为源文件名
      const dir = getDirFromPath(fp)
      if (dir) {
        setOutputDir(dir)
      }
      setFilePrefix(getNameWithoutExt(fp))
    }
  }

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    // 拆分只处理单个PDF文件，取第一个匹配的
    const pdfFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
    )

    if (pdfFiles.length === 0) {
      setToast({ type: 'error', msg: '请拖入PDF文件' })
      return
    }

    if (pdfFiles.length > 1) {
      setToast({ type: 'error', msg: '拆分仅支持单个PDF文件，已选取第一个' })
    }

    const droppedFile = pdfFiles[0]
    const filePath = (droppedFile as any).path
    if (!filePath) {
      setToast({ type: 'error', msg: '无法获取文件路径' })
      return
    }
    setFile({
      path: filePath,
      name: droppedFile.name,
      size: droppedFile.size
    })

    // 智能默认值
    const dir = getDirFromPath(filePath)
    if (dir) {
      setOutputDir(dir)
    }
    setFilePrefix(getNameWithoutExt(filePath))
  }, [])

  // 选择输出目录
  const handleSelectOutputDir = async () => {
    const result = await window.electronAPI.dialog.openFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      setOutputDir(result.filePaths[0])
    }
  }

  // 验证页码范围格式（支持单页、范围、混合，如 "5" 或 "1-3,4-6,7-9" 或 "1-3,5,7-9"）
  const validatePageRanges = (ranges: string): boolean => {
    const pattern = /^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/
    return pattern.test(ranges.trim())
  }

  const renderPdfToImages = async (filePath: string): Promise<{ imageData: string; width: number; height: number }[]> => {
    const response = await fetch(`file:///${filePath.replace(/\\/g, '/')}`)
    const pdfBytes = await response.arrayBuffer()
    
    const pdfDocument = await pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true
    }).promise
    
    const pagesData: { imageData: string; width: number; height: number }[] = []
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i)
      const viewport = page.getViewport({ scale: 2.0 })
      
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      const ctx = canvas.getContext('2d')!
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise
      
      pagesData.push({
        imageData: canvas.toDataURL('image/png'),
        width: viewport.width,
        height: viewport.height
      })
    }
    
    return pagesData
  }

  // 开始拆分
  const handleStartSplit = async () => {
    if (!file) {
      setToast({ type: 'error', msg: '请先选择PDF文件' })
      return
    }

    if (!outputDir) {
      setToast({ type: 'error', msg: '请选择输出目录' })
      return
    }

    // 根据模式验证输入
    if (mode === 'range') {
      if (!pageRanges.trim()) {
        setToast({ type: 'error', msg: '请输入页码范围' })
        return
      }
      if (!validatePageRanges(pageRanges)) {
        setToast({ type: 'error', msg: '页码范围格式不正确，请使用如 1-3,4-6,7-9 的格式' })
        return
      }
    }

    if (mode === 'everyN') {
      if (!pagesPerFile || pagesPerFile < 1) {
        setToast({ type: 'error', msg: '每文件页数需大于0' })
        return
      }
    }

    setIsSplitting(true)
    setError('')
    setResult(null)
    setToast(null)

    progressUnsubscribeRef.current = window.electronAPI.pdfSplit.onProgress((prog: PdfSplitProgress) => {
      setProgress(prog)
    })

    try {
      const splitOptions: {
        filePath: string
        outputDir: string
        mode: 'range' | 'eachPage' | 'everyN'
        pageRanges?: string
        pagesPerFile?: number
        filePrefix?: string
      } = {
        filePath: file.path,
        outputDir,
        mode
      }

      if (mode === 'range') {
        splitOptions.pageRanges = pageRanges.trim()
      } else if (mode === 'everyN') {
        splitOptions.pagesPerFile = pagesPerFile
      }

      if (filePrefix.trim()) {
        splitOptions.filePrefix = filePrefix.trim()
      }

      const result = await window.electronAPI.pdfSplit.split(splitOptions)

      if (result.success && result.data) {
        setResult(result.data)
        setToast({ type: 'success', msg: `拆分完成！共生成 ${result.data.outputFiles.length} 个文件` })
      } else {
        console.log('普通拆分失败，尝试图片模式:', result.error)
        setToast({ type: 'error', msg: '普通拆分失败，尝试图片模式...' })
        
        setProgress({
          currentPart: 0,
          totalParts: 1,
          overallProgress: 0,
          status: 'splitting',
          message: '正在将PDF渲染为图片...'
        })
        
        const pagesData = await renderPdfToImages(file.path)
        
        const imageResult = await window.electronAPI.pdfSplit.splitFromImages({
          pagesData,
          options: splitOptions
        })
        
        if (imageResult.success && imageResult.data) {
          setResult(imageResult.data)
          setToast({ type: 'success', msg: `拆分完成（图片模式）！共生成 ${imageResult.data.outputFiles.length} 个文件` })
        } else {
          const errMsg = imageResult.error || '图片模式拆分失败'
          setError(errMsg)
          setToast({ type: 'error', msg: errMsg })
        }
      }
    } catch (err: any) {
      setError(err.message || '拆分失败')
      setToast({ type: 'error', msg: err.message || '拆分失败' })
    } finally {
      setIsSplitting(false)
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
        progressUnsubscribeRef.current = null
      }
    }
  }

  // 取消拆分
  const handleCancel = async () => {
    await window.electronAPI.pdfSplit.cancel()
    setIsSplitting(false)
    setToast({ type: 'error', msg: '已取消拆分' })
  }

  // 打开输出目录
  const handleOpenDir = async () => {
    if (outputDir) {
      await window.electronAPI.shell.openPath(outputDir)
    }
  }

  // 重新开始
  const handleReset = () => {
    setFile(null)
    setResult(null)
    setProgress(null)
    setError('')
    setToast(null)
    setPageRanges('')
    setPagesPerFile(1)
    setFilePrefix('')
  }

  // 移除已选文件
  const handleRemoveFile = () => {
    setFile(null)
    setFilePrefix('')
  }

  // 拆分模式选项
  const modeOptions: { value: SplitMode; label: string; desc: string }[] = [
    { value: 'range', label: '自定义范围', desc: '按页码范围分组拆分' },
    { value: 'eachPage', label: '每页一个文件', desc: '每一页拆分为单独PDF' },
    { value: 'everyN', label: '每N页一个文件', desc: '每N页拆分为一个PDF' }
  ]

  return (
    <div className="space-y-5 max-w-5xl mx-auto relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center space-x-2.5 animate-slide-in ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <span className="text-white text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* 文件选择区域 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">选择PDF文件</h2>
          {file && (
            <button
              onClick={handleRemoveFile}
              disabled={isSplitting}
              className="text-sm text-red-500 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              移除文件
            </button>
          )}
        </div>

        {!file ? (
          <div
            className={`drop-zone ${isDragging ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleSelectFile}
          >
            <div className="flex flex-col items-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
                isDragging ? 'bg-primary-100' : 'bg-gray-50'
              }`}>
                <svg className={`w-7 h-7 transition-colors ${isDragging ? 'text-primary-500' : 'text-gray-300'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-600 mb-1 font-medium">
                {isDragging ? '松开鼠标即可上传' : '拖拽PDF文件到此处'}
              </p>
              <p className="text-sm text-gray-400">仅支持单个PDF文件</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 overflow-hidden flex-1">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                </svg>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm text-gray-700 truncate font-medium">{file.name}</p>
                {file.size > 0 && (
                  <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleSelectFile}
              disabled={isSplitting}
              className="btn-secondary text-sm whitespace-nowrap ml-2"
            >
              重新选择
            </button>
          </div>
        )}
      </div>

      {/* 拆分设置 */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">拆分设置</h2>

        {/* 拆分模式选择 */}
        <div className="space-y-3">
          <label className="text-sm text-gray-600 font-medium">选择拆分模式</label>
          <div className="grid grid-cols-3 gap-3">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setMode(option.value)}
                disabled={isSplitting}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  mode === option.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${isSplitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    mode === option.value ? 'border-primary-500' : 'border-gray-300'
                  }`}>
                    {mode === option.value && (
                      <div className="w-2 h-2 rounded-full bg-primary-500" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    mode === option.value ? 'text-primary-600' : 'text-gray-700'
                  }`}>
                    {option.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 ml-6">{option.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 根据模式显示不同输入 */}
        <div className="mt-5">
          {mode === 'range' && (
            <div className="space-y-2">
              <label className="text-sm text-gray-600 font-medium">页码范围</label>
              <input
                type="text"
                value={pageRanges}
                onChange={(e) => setPageRanges(e.target.value)}
                className="input-field"
                placeholder="例如：1-3,4-6,7-9"
                disabled={isSplitting}
              />
              <p className="text-xs text-gray-400">
                使用逗号分隔多组范围，每组生成一个PDF文件。例如 "1-3,4-6,7-9" 将生成3个PDF文件。
              </p>
            </div>
          )}

          {mode === 'eachPage' && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-600">
                  将每一页拆分为单独的PDF文件。无需额外设置。
                </p>
              </div>
            </div>
          )}

          {mode === 'everyN' && (
            <div className="space-y-2">
              <label className="text-sm text-gray-600 font-medium">每文件页数</label>
              <input
                type="number"
                value={pagesPerFile}
                onChange={(e) => setPagesPerFile(Math.max(1, parseInt(e.target.value) || 1))}
                className="input-field"
                min={1}
                placeholder="例如：2"
                disabled={isSplitting}
              />
              <p className="text-xs text-gray-400">
                每N页拆分为一个PDF文件。例如输入2，则第1-2页为一个文件，第3-4页为下一个文件，以此类推。
              </p>
            </div>
          )}
        </div>

        {/* 输出文件名前缀 */}
        <div className="mt-5 space-y-2">
          <label className="text-sm text-gray-600 font-medium">
            输出文件名前缀 <span className="text-gray-400 font-normal">（可选）</span>
          </label>
          <input
            type="text"
            value={filePrefix}
            onChange={(e) => setFilePrefix(e.target.value)}
            className="input-field"
            placeholder="默认使用源文件名"
            disabled={isSplitting}
          />
          <p className="text-xs text-gray-400">
            拆分后的文件将以此前缀命名，如 "文档_第1部分.pdf"。留空则使用源文件名。
          </p>
        </div>

        {/* 输出目录 */}
        <div className="mt-5 space-y-2">
          <label className="text-sm text-gray-600 font-medium">输出目录</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              className="input-field flex-1"
              placeholder="选择输出目录"
              disabled={isSplitting}
            />
            <button
              onClick={handleSelectOutputDir}
              className="btn-secondary whitespace-nowrap"
              disabled={isSplitting}
            >
              浏览
            </button>
          </div>
        </div>
      </div>

      {/* 进度显示 */}
      {(isSplitting || progress) && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">拆分进度</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>总体进度</span>
                <span className="font-medium text-primary-600">{progress?.overallProgress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress?.overallProgress || 0}%` }}
                />
              </div>
            </div>
            {progress?.message && (
              <p className="text-sm text-gray-500">{progress.message}</p>
            )}
            {progress && progress.totalParts > 0 && (
              <p className="text-sm text-gray-400">
                正在处理第 {progress.currentPart} / {progress.totalParts} 部分
              </p>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 拆分结果 */}
      {result && !isSplitting && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">拆分完成</h2>
            <div className="flex items-center space-x-2">
              <button onClick={handleReset} className="btn-secondary text-sm">重新开始</button>
              <button onClick={handleOpenDir} className="btn-primary text-sm">打开所在目录</button>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center mb-4">
            <p className="text-2xl font-bold text-green-600">{result.outputFiles.length}</p>
            <p className="text-xs text-green-600 mt-0.5">生成文件数</p>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {result.outputFiles.map((filePath, index) => {
              const fileName = filePath.split(/[/\\]/).pop() || filePath
              return (
                <div
                  key={index}
                  className="flex items-center space-x-3 bg-gray-50 rounded-lg p-3"
                >
                  <span className="text-xs text-gray-400 font-mono w-6 text-center flex-shrink-0">{index + 1}</span>
                  <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-700 truncate font-medium">{fileName}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-center pt-2 pb-6">
        {!isSplitting ? (
          <button
            onClick={handleStartSplit}
            disabled={!file}
            className="btn-primary px-12 py-3 text-base font-medium flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>开始拆分</span>
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="btn-danger px-12 py-3 text-base font-medium flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>取消拆分</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default PdfSplitPage
