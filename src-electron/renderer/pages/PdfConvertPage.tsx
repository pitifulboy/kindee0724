import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import {
  addFiles,
  removeFile,
  clearFiles,
  setOutputDir,
  setFormat,
  setScale,
  setQuality,
  setPageRange,
  startConversion,
  updateProgress,
  conversionComplete,
  conversionError,
  resetState
} from '../store/slices/pdfConvertSlice'
import type { PdfFile } from '../store/slices/pdfConvertSlice'

const PdfConvertPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const {
    files, outputDir, format, scale, quality, pageRange,
    isConverting, progress, results, error
  } = useAppSelector((state) => state.pdfConvert)

  const [isDragging, setIsDragging] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const progressUnsubscribeRef = useRef<(() => void) | null>(null)
  const pageRangeRef = useRef<HTMLInputElement>(null)

  // ─── 初始化输出目录（默认桌面） ───
  useEffect(() => {
    const initOutputDir = async () => {
      if (!outputDir) {
        const desktopPath = await window.electronAPI.app.getPath('desktop')
        dispatch(setOutputDir(desktopPath))
      }
    }
    initOutputDir()
  }, [])

  // ─── 清理进度监听 ───
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
      }
    }
  }, [])

  // ─── Toast 自动消失 ───
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // ─── 转换完成后加载预览图 ───
  useEffect(() => {
    if (results.length > 0 && !isConverting) {
      loadPreviews()
    }
  }, [results, isConverting])

  const loadPreviews = async () => {
    setLoadingPreviews(true)
    const previews: string[] = []
    // 最多预览前 20 张图片
    const toPreview = results.slice(0, 20)
    for (const imgPath of toPreview) {
      const result = await window.electronAPI.file.readImage(imgPath)
      if (result.success && result.data) {
        previews.push(result.data)
      }
    }
    setPreviewImages(previews)
    setLoadingPreviews(false)
  }

  // ─── 选择 PDF 文件 ───
  const handleSelectFiles = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }],
      multiSelections: true
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const newFiles: PdfFile[] = []
      for (const fp of result.filePaths) {
        const info = await window.electronAPI.file.getFileInfo(fp)
        newFiles.push({
          path: fp,
          name: info.success ? info.data.name : fp.split(/[/\\]/).pop() || fp,
          size: info.success ? info.data.size : 0
        })
      }
      dispatch(addFiles(newFiles))
    }
  }

  // ─── 拖拽处理 ───
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isScanning) return  // 防重入

    const allFiles = Array.from(e.dataTransfer.files)
    const newFiles: PdfFile[] = []
    const folderPaths: string[] = []

    // 遍历拖入项，区分 PDF 文件和可能为文件夹的项
    for (const file of allFiles) {
      const filePath = (file as any).path
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // 直接是 PDF 文件
        newFiles.push({
          path: filePath,
          name: file.name,
          size: file.size
        })
      } else if (filePath) {
        // 非 PDF 文件项，可能是文件夹，记录路径稍后扫描
        folderPaths.push(filePath)
      }
    }

    // 扫描所有可能的文件夹
    if (folderPaths.length > 0) {
      setIsScanning(true)
      setToast({ type: 'success', msg: '正在扫描文件夹...' })

      let folderPdfCount = 0
      for (const folderPath of folderPaths) {
        try {
          const result = await window.electronAPI.file.scanPdfsInDir(folderPath)
          if (result.success && result.data && result.data.files.length > 0) {
            const scannedFiles: PdfFile[] = result.data.files.map((f) => ({
              path: f.path,
              name: f.name,
              size: f.size
            }))
            newFiles.push(...scannedFiles)
            folderPdfCount += scannedFiles.length
          }
        } catch {
          // 扫描失败则跳过该项
        }
      }

      setIsScanning(false)

      if (folderPdfCount > 0) {
        setToast({ type: 'success', msg: `从文件夹中找到 ${folderPdfCount} 个PDF文件` })
      } else if (newFiles.length === 0) {
        // 没有直接拖入的PDF，文件夹也没扫到PDF
        setToast({ type: 'error', msg: '未在文件夹中找到PDF文件' })
      }
    }

    if (newFiles.length > 0) {
      dispatch(addFiles(newFiles))
    }
  }, [dispatch, isScanning])

  // ─── 选择输出目录 ───
  const handleSelectOutputDir = async () => {
    const result = await window.electronAPI.dialog.openFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      dispatch(setOutputDir(result.filePaths[0]))
    }
  }

  // ─── 开始转换 ───
  const handleStartConvert = async () => {
    if (files.length === 0) {
      setToast({ type: 'error', msg: '请先选择PDF文件' })
      return
    }

    // 校验页码范围格式
    if (pageRange && pageRange.trim()) {
      const trimmed = pageRange.trim()
      if (!/^[\d\s,\-]+$/.test(trimmed)) {
        setToast({ type: 'error', msg: '页码范围格式错误，请使用如 1-3,5,7-9 的格式' })
        return
      }
    }

    dispatch(startConversion())
    setPreviewImages([])
    setToast(null)

    // 注册进度监听
    progressUnsubscribeRef.current = window.electronAPI.pdfConvert.onProgress((prog) => {
      dispatch(updateProgress(prog))
    })

    try {
      const result = await window.electronAPI.pdfConvert.convert({
        filePaths: files.map((f) => f.path),
        outputDir,
        format,
        scale,
        quality,
        pageRange: pageRange || undefined
      })

      if (result.success && result.data) {
        dispatch(conversionComplete(result.data.outputImages))
        setToast({ type: 'success', msg: `转换完成！成功生成 ${result.data.outputImages.length} 张图片` })
      } else {
        dispatch(conversionError(result.error || '转换失败'))
        setToast({ type: 'error', msg: result.error || '转换失败' })
      }
    } catch (err: any) {
      dispatch(conversionError(err.message || '转换失败'))
      setToast({ type: 'error', msg: err.message || '转换失败' })
    } finally {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
        progressUnsubscribeRef.current = null
      }
    }
  }

  // ─── 取消转换 ───
  const handleCancel = async () => {
    await window.electronAPI.pdfConvert.cancel()
    dispatch(resetState())
    setPreviewImages([])
    setToast({ type: 'error', msg: '已取消转换' })
  }

  // ─── 打开输出目录 ───
  const handleOpenOutputDir = async () => {
    await window.electronAPI.shell.openPath(outputDir)
  }

  // ─── 重新开始 ───
  const handleReset = () => {
    dispatch(resetState())
    setPreviewImages([])
    setToast(null)
  }

  // ─── 格式化文件大小 ───
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '未知'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto relative">
      {/* ─── Toast 通知 ─── */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center space-x-2.5 animate-slide-in ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {toast.type === 'success' ? (
            <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="text-white text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* ─── 文件选择区域 ─── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">选择PDF文件</h2>
          {files.length > 0 && (
            <span className="text-xs text-gray-400">支持批量多选</span>
          )}
        </div>

        <div
          className={`drop-zone ${isDragging ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={isScanning ? undefined : handleSelectFiles}
        >
          <div className="flex flex-col items-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
              isDragging ? 'bg-primary-100' : 'bg-gray-50'
            }`}>
              {isScanning ? (
                <div className="w-7 h-7 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              ) : (
                <svg className={`w-7 h-7 transition-colors ${isDragging ? 'text-primary-500' : 'text-gray-300'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
            </div>
            <p className="text-gray-600 mb-1 font-medium">
              {isScanning ? '正在扫描文件夹...' : isDragging ? '松开鼠标即可上传' : '拖拽PDF文件或文件夹到此处'}
            </p>
            <p className="text-sm text-gray-400">或点击选择文件（支持多选）</p>
          </div>
        </div>

        {/* 文件列表 */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                已选择 <span className="font-semibold text-primary-600">{files.length}</span> 个文件
              </span>
              <button
                onClick={() => dispatch(clearFiles())}
                className="text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                清空列表
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-2">
              {files.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between bg-gray-50 rounded-lg p-3 group hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
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
                    onClick={() => dispatch(removeFile(file.path))}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 ml-2 p-1"
                    title="移除文件"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── 转换设置 ─── */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">转换设置</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 输出格式 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">输出格式</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => dispatch(setFormat('png'))}
                disabled={isConverting}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  format === 'png'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex flex-col items-center">
                  <span>PNG</span>
                  <span className={`text-[10px] ${format === 'png' ? 'text-primary-200' : 'text-gray-400'}`}>无损 · 透明背景</span>
                </div>
              </button>
              <button
                onClick={() => dispatch(setFormat('jpg'))}
                disabled={isConverting}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  format === 'jpg'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex flex-col items-center">
                  <span>JPG</span>
                  <span className={`text-[10px] ${format === 'jpg' ? 'text-primary-200' : 'text-gray-400'}`}>压缩 · 体积小</span>
                </div>
              </button>
            </div>
          </div>

          {/* 分辨率 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              分辨率倍数：<span className="text-primary-600 font-semibold">{scale}x</span>
            </label>
            <input
              type="range"
              min="1"
              max="4"
              step="0.5"
              value={scale}
              onChange={(e) => dispatch(setScale(parseFloat(e.target.value)))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              disabled={isConverting}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>1x · 标清</span>
              <span>2x · 高清</span>
              <span>3x · 超清</span>
              <span>4x · 极清</span>
            </div>
          </div>

          {/* JPG 质量滑块（仅 JPG 格式时显示） */}
          {format === 'jpg' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                JPG 质量：<span className="text-primary-600 font-semibold">{Math.round(quality * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.3"
                max="1"
                step="0.02"
                value={quality}
                onChange={(e) => dispatch(setQuality(parseFloat(e.target.value)))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                disabled={isConverting}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>30% · 最小体积</span>
                <span>70% · 均衡</span>
                <span>100% · 最高质量</span>
              </div>
            </div>
          )}

          {/* 页码范围 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              页码范围<span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              ref={pageRangeRef}
              type="text"
              value={pageRange}
              onChange={(e) => dispatch(setPageRange(e.target.value))}
              className="input-field"
              placeholder="留空=全部页面，如 1-3,5,7-9"
              disabled={isConverting}
            />
            <p className="text-xs text-gray-400 mt-1">示例：1-3,5,7-9 表示转第1~3页、第5页、第7~9页</p>
          </div>

          {/* 输出目录 */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">保存位置</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => dispatch(setOutputDir(e.target.value))}
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

      {/* ─── 进度显示 ─── */}
      {(isConverting || progress) && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">转换进度</h2>

          <div className="space-y-4">
            {/* 总体进度条 */}
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

            {/* 当前处理信息 */}
            {progress && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs block mb-0.5">当前文件</span>
                    <p className="font-medium text-gray-800 truncate">{progress.currentFile || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block mb-0.5">文件进度</span>
                    <p className="font-medium text-gray-800">
                      {progress.currentFileIndex} / {progress.totalFiles}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block mb-0.5">页面进度</span>
                    <p className="font-medium text-gray-800">
                      {progress.currentPage} / {progress.totalPages || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block mb-0.5">状态</span>
                    <p className={`font-medium flex items-center ${
                      progress.status === 'completed' ? 'text-green-600' :
                      progress.status === 'error' ? 'text-red-600' :
                      'text-primary-600'
                    }`}>
                      {progress.status === 'converting' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse mr-1.5" />
                      )}
                      {progress.status === 'converting' ? '转换中' :
                       progress.status === 'completed' ? '已完成' :
                       progress.status === 'error' ? '错误' : '等待中'}
                    </p>
                  </div>
                </div>
                {progress.message && (
                  <p className="text-sm text-gray-500 mt-3">{progress.message}</p>
                )}
              </div>
            )}

            {/* 错误信息 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 转换结果 + 图片预览 ─── */}
      {results.length > 0 && !isConverting && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">转换完成</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleReset}
                className="btn-secondary text-sm"
              >
                重新开始
              </button>
              <button
                onClick={handleOpenOutputDir}
                className="btn-primary text-sm"
              >
                打开输出目录
              </button>
            </div>
          </div>

          {/* 结果统计卡片 */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{results.length}</p>
              <p className="text-xs text-green-600 mt-0.5">生成图片总数</p>
            </div>
            <div className="bg-primary-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary-600">{files.length}</p>
              <p className="text-xs text-primary-600 mt-0.5">处理PDF文件数</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-600">{format.toUpperCase()}</p>
              <p className="text-xs text-gray-500 mt-0.5">输出格式 · {scale}x</p>
            </div>
          </div>

          {/* 图片预览网格 */}
          {loadingPreviews ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                <span className="text-sm text-gray-400">加载预览中...</span>
              </div>
            </div>
          ) : previewImages.length > 0 ? (
            <>
              <p className="text-xs text-gray-400 mb-3">
                预览前 {Math.min(previewImages.length, 20)} 张
                {results.length > 20 && `（共 ${results.length} 张，打开目录查看全部）`}
              </p>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {previewImages.map((img, index) => (
                  <div
                    key={index}
                    className="aspect-[3/4] bg-gray-50 rounded-lg overflow-hidden border border-gray-100 group relative cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <img
                      src={img}
                      alt={`第${index + 1}张`}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                      <span className="text-[10px] text-white">第 {index + 1} 张</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── 操作按钮 ─── */}
      <div className="flex justify-center pt-2 pb-6">
        {!isConverting ? (
          <button
            onClick={handleStartConvert}
            disabled={files.length === 0 || isScanning}
            className="btn-primary px-12 py-3 text-base font-medium flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>开始转换</span>
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

export default PdfConvertPage
