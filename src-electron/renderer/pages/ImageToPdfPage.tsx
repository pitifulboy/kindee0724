import React, { useState, useEffect, useCallback, useRef } from 'react'

interface ImageFile {
  path: string
  name: string
  size: number
  preview?: string
}

const ImageToPdfPage: React.FC = () => {
  const [files, setFiles] = useState<ImageFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [margin, setMargin] = useState(10)
  const [quality, setQuality] = useState(0.85)
  const [outputFileName, setOutputFileName] = useState('图片合并.pdf')
  const [outputDir, setOutputDir] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [progress, setProgress] = useState<any>(null)
  const [result, setResult] = useState<{ outputPath: string } | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const progressUnsubscribeRef = useRef<(() => void) | null>(null)

  // 清理
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

  // 加载图片预览
  const loadPreviews = async (newFiles: ImageFile[]) => {
    const withPreviews = [...newFiles]
    for (let i = 0; i < withPreviews.length; i++) {
      if (!withPreviews[i].preview) {
        const result = await window.electronAPI.file.readImage(withPreviews[i].path)
        if (result.success && result.data) {
          withPreviews[i] = { ...withPreviews[i], preview: result.data }
        }
      }
    }
    setFiles(withPreviews)
  }

  // 选择图片文件
  const handleSelectFiles = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
      multiSelections: true
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const newFiles: ImageFile[] = []
      for (const fp of result.filePaths) {
        const info = await window.electronAPI.file.getFileInfo(fp)
        newFiles.push({
          path: fp,
          name: info.success ? info.data.name : fp.split(/[/\\]/).pop() || fp,
          size: info.success ? info.data.size : 0
        })
      }
      // 首次添加图片时，自动设置默认文件名和输出目录
      if (files.length === 0 && newFiles.length > 0) {
        const firstFile = newFiles[0]
        const baseName = firstFile.name.replace(/\.[^.]+$/, '')
        setOutputFileName(baseName + '.pdf')
        const dir = firstFile.path.split(/[/\\]/).slice(0, -1).join('/')
        setOutputDir(dir)
      }

      const combined = [...files, ...newFiles]
      setFiles(combined)
      loadPreviews(combined)
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

    const imageFiles = Array.from(e.dataTransfer.files).filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ['png', 'jpg', 'jpeg', 'bmp', 'webp'].includes(ext || '')
    })

    if (imageFiles.length > 0) {
      const newFiles: ImageFile[] = imageFiles.map((file) => ({
        path: (file as any).path,
        name: file.name,
        size: file.size
      }))

      // 首次添加图片时，自动设置默认文件名和输出目录
      if (files.length === 0 && newFiles.length > 0) {
        const firstFile = newFiles[0]
        const baseName = firstFile.name.replace(/\.[^.]+$/, '')
        setOutputFileName(baseName + '.pdf')
        const dir = firstFile.path.split(/[/\\]/).slice(0, -1).join('/')
        setOutputDir(dir)
      }

      const combined = [...files, ...newFiles]
      setFiles(combined)
      loadPreviews(combined)
    }
  }, [files])

  // 选择输出目录
  const handleSelectOutputDir = async () => {
    const result = await window.electronAPI.dialog.openFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      setOutputDir(result.filePaths[0])
    }
  }

  // 移动文件顺序
  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newFiles.length) return
    ;[newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]]
    setFiles(newFiles)
  }

  // 删除文件
  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  // 拖拽排序：开始拖拽
  const handleItemDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  // 拖拽排序：拖拽经过
  const handleItemDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // 拖拽排序：放置
  const handleItemDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null)
      return
    }
    const newFiles = [...files]
    const [draggedFile] = newFiles.splice(draggedIndex, 1)
    newFiles.splice(index, 0, draggedFile)
    setFiles(newFiles)
    setDraggedIndex(null)
  }

  // 拖拽排序：结束
  const handleItemDragEnd = () => {
    setDraggedIndex(null)
  }

  // 开始转换
  const handleStartConvert = async () => {
    if (files.length === 0) {
      setToast({ type: 'error', msg: '请先选择图片文件' })
      return
    }

    // 校验输出文件名和目录
    if (!outputFileName.trim() || !outputDir.trim()) {
      setToast({ type: 'error', msg: '请设置PDF文件名和保存位置' })
      return
    }

    // 拼接完整输出路径
    const finalOutputPath = `${outputDir.replace(/[/\\]+$/, '')}/${outputFileName.replace(/\.pdf$/i, '')}.pdf`

    setIsConverting(true)
    setError('')
    setResult(null)
    setToast(null)

    progressUnsubscribeRef.current = window.electronAPI.imageToPdf.onProgress((prog) => {
      setProgress(prog)
    })

    try {
      const result = await window.electronAPI.imageToPdf.convert({
        filePaths: files.map((f) => f.path),
        outputPath: finalOutputPath,
        pageSize,
        orientation,
        margin,
        quality
      })

      if (result.success && result.data) {
        setResult(result.data)
        setToast({ type: 'success', msg: `PDF生成成功！共 ${files.length} 页` })
      } else {
        setError(result.error || '转换失败')
        setToast({ type: 'error', msg: result.error || '转换失败' })
      }
    } catch (err: any) {
      setError(err.message || '转换失败')
      setToast({ type: 'error', msg: err.message || '转换失败' })
    } finally {
      setIsConverting(false)
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
        progressUnsubscribeRef.current = null
      }
    }
  }

  // 取消转换
  const handleCancel = async () => {
    await window.electronAPI.imageToPdf.cancel()
    setIsConverting(false)
    setToast({ type: 'error', msg: '已取消转换' })
  }

  // 打开输出文件
  const handleOpenFile = async () => {
    if (result) {
      const dir = result.outputPath.split(/[/\\]/).slice(0, -1).join('/')
      await window.electronAPI.shell.openPath(dir)
    }
  }

  // 重置
  const handleReset = () => {
    setFiles([])
    setResult(null)
    setProgress(null)
    setError('')
    setToast(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '未知'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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
          <h2 className="text-base font-semibold text-gray-800">选择图片文件</h2>
          {files.length > 0 && (
            <span className="text-xs text-gray-400">支持拖拽排序</span>
          )}
        </div>

        <div
          className={`drop-zone ${isDragging ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectFiles}
        >
          <div className="flex flex-col items-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
              isDragging ? 'bg-primary-100' : 'bg-gray-50'
            }`}>
              <svg className={`w-7 h-7 transition-colors ${isDragging ? 'text-primary-500' : 'text-gray-300'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-1 font-medium">
              {isDragging ? '松开鼠标即可上传' : '拖拽图片到此处'}
            </p>
            <p className="text-sm text-gray-400">支持 PNG/JPG/BMP/WEBP（可多选）</p>
          </div>
        </div>

        {/* 图片列表 */}
        {files.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                已选择 <span className="font-semibold text-primary-600">{files.length}</span> 张图片
              </span>
              <button
                onClick={() => setFiles([])}
                className="text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                清空列表
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {files.map((file, index) => (
                <div
                  key={file.path}
                  draggable={!isConverting}
                  onDragStart={(e) => handleItemDragStart(e, index)}
                  onDragOver={(e) => handleItemDragOver(e)}
                  onDrop={(e) => handleItemDrop(e, index)}
                  onDragEnd={handleItemDragEnd}
                  className={`flex items-center justify-between bg-gray-50 rounded-lg p-2.5 group hover:bg-gray-100 transition-colors ${
                    !isConverting ? 'cursor-move' : ''
                  } ${draggedIndex === index ? 'opacity-40 ring-2 ring-primary-400' : ''}`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <span className="text-xs text-gray-400 font-mono w-6 text-center flex-shrink-0">{index + 1}</span>
                    {file.preview ? (
                      <img src={file.preview} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-200 flex-shrink-0" />
                    )}
                    <div className="overflow-hidden">
                      <p className="text-sm text-gray-700 truncate font-medium">{file.name}</p>
                      {file.size > 0 && (
                        <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => moveFile(index, 'up')}
                      disabled={index === 0 || isConverting}
                      className="p-1 text-gray-300 hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="上移"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveFile(index, 'down')}
                      disabled={index === files.length - 1 || isConverting}
                      className="p-1 text-gray-300 hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="下移"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeFile(index)}
                      disabled={isConverting}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      title="移除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 转换设置 */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">PDF设置</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 页面尺寸 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">页面尺寸</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'fit', label: '适应图片', desc: '每页大小跟随图片' },
                { value: 'a4', label: 'A4', desc: '210×297mm' },
                { value: 'letter', label: 'Letter', desc: '216×279mm' }
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPageSize(opt.value)}
                  disabled={isConverting}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    pageSize === opt.value
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex flex-col items-center">
                    <span>{opt.label}</span>
                    <span className={`text-[10px] ${pageSize === opt.value ? 'text-primary-200' : 'text-gray-400'}`}>{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 方向 */}
          {pageSize !== 'fit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">页面方向</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrientation('portrait')}
                  disabled={isConverting}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    orientation === 'portrait' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  纵向
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  disabled={isConverting}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    orientation === 'landscape' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  横向
                </button>
              </div>
            </div>
          )}

          {/* 边距 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              页面边距：<span className="text-primary-600 font-semibold">{margin}px</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={margin}
              onChange={(e) => setMargin(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              disabled={isConverting}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>0 · 无边距</span>
              <span>50 · 适中</span>
              <span>100 · 宽边距</span>
            </div>
          </div>

          {/* 图片质量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              图片质量：<span className="text-primary-600 font-semibold">{Math.round(quality * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              disabled={isConverting}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>30% · 最小体积</span>
              <span>70% · 均衡</span>
              <span>100% · 最高质量</span>
            </div>
          </div>

          {/* 输出设置 */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PDF文件名</label>
              <input
                type="text"
                value={outputFileName}
                onChange={(e) => setOutputFileName(e.target.value)}
                className="input-field w-full"
                placeholder="输入PDF文件名"
                disabled={isConverting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">保存位置</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  className="input-field flex-1"
                  placeholder="选择保存目录"
                  disabled={isConverting}
                />
                <button
                  onClick={handleSelectOutputDir}
                  className="btn-secondary whitespace-nowrap"
                  disabled={isConverting}
                >
                  浏览
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 进度显示 */}
      {(isConverting || progress) && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">转换进度</h2>
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
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 转换结果 */}
      {result && !isConverting && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">生成完成</h2>
            <div className="flex items-center space-x-2">
              <button onClick={handleReset} className="btn-secondary text-sm">重新开始</button>
              <button onClick={handleOpenFile} className="btn-primary text-sm">打开所在目录</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{files.length}</p>
              <p className="text-xs text-green-600 mt-0.5">PDF页数</p>
            </div>
            <div className="bg-primary-50 rounded-lg p-3 text-center">
              <p className="text-sm font-bold text-primary-600 truncate px-2">{result.outputPath.split(/[/\\]/).pop()}</p>
              <p className="text-xs text-primary-600 mt-0.5">输出文件</p>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-center pt-2 pb-6">
        {!isConverting ? (
          <button
            onClick={handleStartConvert}
            disabled={files.length === 0}
            className="btn-primary px-12 py-3 text-base font-medium flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>生成PDF</span>
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
            <span>取消转换</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ImageToPdfPage
