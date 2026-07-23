import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PdfFile {
  id: string
  path: string
  name: string
  size: number
}

const PdfMergePage: React.FC = () => {
  const [files, setFiles] = useState<PdfFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [outputPath, setOutputPath] = useState('')
  const [isMerging, setIsMerging] = useState(false)
  const [progress, setProgress] = useState<any>(null)
  const [result, setResult] = useState<{ outputPath: string; totalPages: number } | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const progressUnsubscribeRef = useRef<(() => void) | null>(null)

  // 初始化输出路径
  useEffect(() => {
    const initPath = async () => {
      if (!outputPath) {
        const desktop = await window.electronAPI.app.getPath('desktop')
        setOutputPath(`${desktop}/合并文档.pdf`)
      }
    }
    initPath()
  }, [])

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

  // 选择PDF文件
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path: fp,
          name: info.success ? info.data.name : fp.split(/[/\\]/).pop() || fp,
          size: info.success ? info.data.size : 0
        })
      }
      setFiles([...files, ...newFiles])
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

    const pdfFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf' || file.name.endsWith('.pdf')
    )

    if (pdfFiles.length > 0) {
      const newFiles: PdfFile[] = pdfFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        path: (file as any).path,
        name: file.name,
        size: file.size
      }))
      setFiles(prev => [...prev, ...newFiles])
    }
  }, [])

  // 选择输出路径
  const handleSelectOutputPath = async () => {
    const result = await window.electronAPI.dialog.openFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      setOutputPath(`${result.filePaths[0]}/合并文档.pdf`)
    }
  }

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newFiles.length) return
    ;[newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]]
    setFiles(newFiles)
  }

  const handleFileDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString())
    setDraggedIndex(index)
  }

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleFileDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    
    if (sourceIndex !== targetIndex && !isNaN(sourceIndex)) {
      const newFiles = [...files]
      const [removed] = newFiles.splice(sourceIndex, 1)
      newFiles.splice(targetIndex, 0, removed)
      setFiles(newFiles)
    }
    
    setDraggedIndex(null)
  }

  const handleFileDragEnd = () => {
    setDraggedIndex(null)
  }

  // 删除文件
  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
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

  // 开始合并
  const handleStartMerge = async () => {
    if (files.length < 2) {
      setToast({ type: 'error', msg: '至少需要选择两个PDF文件' })
      return
    }

    setIsMerging(true)
    setError('')
    setResult(null)
    setToast(null)

    progressUnsubscribeRef.current = window.electronAPI.pdfMerge.onProgress((prog) => {
      setProgress(prog)
    })

    try {
      const result = await window.electronAPI.pdfMerge.merge({
        filePaths: files.map((f) => f.path),
        outputPath
      })

      if (result.success && result.data) {
        setResult(result.data)
        setToast({ type: 'success', msg: `合并成功！共 ${result.data.totalPages} 页` })
      } else {
        console.log('普通合并失败，尝试图片模式:', result.error)
        setToast({ type: 'error', msg: '普通合并失败，尝试图片模式...' })
        
        const pagesData: { imageData: string; width: number; height: number }[][] = []
        
        for (const file of files) {
          setProgress({
            currentFile: file.name,
            currentFileIndex: pagesData.length + 1,
            totalFiles: files.length,
            overallProgress: Math.round((pagesData.length / files.length) * 50),
            status: 'merging',
            message: `正在处理: ${file.name}（图片模式）`
          })
          
          const images = await renderPdfToImages(file.path)
          pagesData.push(images)
        }
        
        const imageResult = await window.electronAPI.pdfMerge.mergeFromImages({
          pagesData,
          outputPath,
          fileNames: files.map(f => f.name)
        })
        
        if (imageResult.success && imageResult.data) {
          setResult(imageResult.data)
          setToast({ type: 'success', msg: `合并成功（图片模式）！共 ${imageResult.data.totalPages} 页` })
        } else {
          setError(imageResult.error || '图片模式合并失败')
          setToast({ type: 'error', msg: imageResult.error || '图片模式合并失败' })
        }
      }
    } catch (err: any) {
      setError(err.message || '合并失败')
      setToast({ type: 'error', msg: err.message || '合并失败' })
    } finally {
      setIsMerging(false)
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current()
        progressUnsubscribeRef.current = null
      }
    }
  }

  // 取消合并
  const handleCancel = async () => {
    await window.electronAPI.pdfMerge.cancel()
    setIsMerging(false)
    setToast({ type: 'error', msg: '已取消合并' })
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
          <h2 className="text-base font-semibold text-gray-800">选择PDF文件</h2>
          {files.length > 0 && (
            <span className="text-xs text-gray-400">拖拽箭头可调整顺序</span>
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
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-1 font-medium">
              {isDragging ? '松开鼠标即可上传' : '拖拽PDF文件到此处'}
            </p>
            <p className="text-sm text-gray-400">至少选择2个PDF文件（可多选）</p>
          </div>
        </div>

        {/* 文件列表 */}
        {files.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                已选择 <span className="font-semibold text-primary-600">{files.length}</span> 个文件
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
                  key={file.id}
                  draggable={!isMerging}
                  onDragStart={(e) => handleFileDragStart(e, index)}
                  onDragOver={handleFileDragOver}
                  onDrop={(e) => handleFileDrop(e, index)}
                  onDragEnd={handleFileDragEnd}
                  className={`flex items-center justify-between rounded-lg p-3 group hover:bg-gray-100 transition-colors ${
                    draggedIndex === index ? 'opacity-50 bg-blue-50' : 'bg-gray-50 cursor-move'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <span className="text-xs text-gray-400 font-mono w-6 text-center flex-shrink-0">{index + 1}</span>
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
                  <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => moveFile(index, 'up')}
                      disabled={index === 0 || isMerging}
                      className="p-1 text-gray-300 hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="上移"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveFile(index, 'down')}
                      disabled={index === files.length - 1 || isMerging}
                      className="p-1 text-gray-300 hover:text-primary-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="下移"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeFile(index)}
                      disabled={isMerging}
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

      {/* 输出设置 */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">输出设置</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            className="input-field flex-1"
            placeholder="选择输出文件路径"
            disabled={isMerging}
          />
          <button
            onClick={handleSelectOutputPath}
            className="btn-secondary whitespace-nowrap"
            disabled={isMerging}
          >
            浏览
          </button>
        </div>
      </div>

      {/* 进度显示 */}
      {(isMerging || progress) && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">合并进度</h2>
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

      {/* 合并结果 */}
      {result && !isMerging && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">合并完成</h2>
            <div className="flex items-center space-x-2">
              <button onClick={handleReset} className="btn-secondary text-sm">重新开始</button>
              <button onClick={handleOpenFile} className="btn-primary text-sm">打开所在目录</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.totalPages}</p>
              <p className="text-xs text-green-600 mt-0.5">合并后总页数</p>
            </div>
            <div className="bg-primary-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary-600">{files.length}</p>
              <p className="text-xs text-primary-600 mt-0.5">合并文件数</p>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-center pt-2 pb-6">
        {!isMerging ? (
          <button
            onClick={handleStartMerge}
            disabled={files.length < 2}
            className="btn-primary px-12 py-3 text-base font-medium flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <span>开始合并</span>
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
            <span>取消合并</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default PdfMergePage
