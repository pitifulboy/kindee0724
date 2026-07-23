import React, { useState, useEffect, useCallback, useRef } from 'react'
import SearchableSelect from '../components/SearchableSelect'

// ─── 类型定义（与后端 types.ts 对应，前端内联声明避免跨进程导入）───
interface MatchPair {
  orderCol: string
  auxCol: string
}

interface AuxTableConfig {
  id: string
  name: string
  fileName: string
  filePath: string
  matchPairs: MatchPair[]
  how: 'left' | 'inner' | 'right'
}

interface OrderFileInfo {
  path: string
  name: string
}

interface PresetConfig {
  name: string
  orderSubFolder: string
  auxSubFolder: string
  textColumns: string[]
  auxiliaryTables: AuxTableConfig[]
  outputFileName: string
  orderFilePaths: OrderFileInfo[]
  outputDir: string
}

interface PresetListItem {
  name: string
  auxiliaryTableCount: number
  lastModified: string
}

interface ExcelMergeProgress {
  step: string
  currentTable: string
  currentTableIndex: number
  totalTables: number
  overallProgress: number
  status: 'pending' | 'reading' | 'merging' | 'writing' | 'completed' | 'error'
  message?: string
}

interface ExcelMergeResult {
  outputPath: string
  totalRows: number
  totalColumns: number
  matchedCount: number
  unmatchedCount: number
}

interface MergeParams {
  orderFilePaths: string[]
  auxFilePaths: Record<string, string>
  config: PresetConfig
  outputDir: string
}

interface OrderFile {
  id: string
  path: string
  name: string
}

const ExcelMergePage: React.FC = () => {
  // ─── 预设 ───
  const [presetName, setPresetName] = useState('')
  const [presetList, setPresetList] = useState<PresetListItem[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  // ─── 订单文件 ───
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([])

  // ─── 辅助表配置 ───
  const [auxTables, setAuxTables] = useState<AuxTableConfig[]>([])
  const [auxFilePaths, setAuxFilePaths] = useState<Record<string, string>>({})

  // ─── 列名 ───
  const [orderColumns, setOrderColumns] = useState<string[]>([])
  const [auxColumnsMap, setAuxColumnsMap] = useState<Record<string, string[]>>({})

  // ─── 文本列 ───
  const [textColumns, setTextColumns] = useState<string[]>([])
  const [newTextColumn, setNewTextColumn] = useState('')

  // ─── 输出 ───
  const [outputDir, setOutputDir] = useState('')
  const [outputFileName, setOutputFileName] = useState('合并结果.xlsx')

  // ─── 执行状态 ───
  const [isMerging, setIsMerging] = useState(false)
  const [progress, setProgress] = useState<ExcelMergeProgress | null>(null)
  const [progressLogs, setProgressLogs] = useState<string[]>([])
  const [result, setResult] = useState<ExcelMergeResult | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // ─── 拖拽 ───
  const [isDragging, setIsDragging] = useState(false)

  const progressUnsubscribeRef = useRef<(() => void) | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // ─── 初始化 ───
  useEffect(() => {
    const init = async () => {
      const desktop = await window.electronAPI.app.getPath('desktop')
      setOutputDir(desktop)
      await refreshPresetList()
    }
    init()
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

  // 自动滚动日志到底部
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [progressLogs])

  // ─── 预设列表刷新 ───
  const refreshPresetList = async () => {
    const res = await window.electronAPI.excelMerge.listPresets()
    if (res.success && res.data) {
      setPresetList(res.data)
    }
  }

  // ─── 加载预设 ───
  const handleLoadPreset = async (name: string) => {
    if (!name) return
    const res = await window.electronAPI.excelMerge.getPreset(name)
    if (res.success && res.data) {
      const config = res.data as PresetConfig
      setPresetName(name)
      setAuxTables(config.auxiliaryTables || [])
      setTextColumns(config.textColumns || [])
      setOutputFileName(config.outputFileName || '合并结果.xlsx')

      // 还原订单文件列表
      const orderPaths: OrderFileInfo[] = config.orderFilePaths || []
      if (orderPaths.length > 0) {
        const restoredOrderFiles: OrderFile[] = orderPaths.map(f => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path: f.path,
          name: f.name
        }))
        setOrderFiles(restoredOrderFiles)

        // 自动读取第一个订单文件的列名
        try {
          const colRes = await window.electronAPI.excelMerge.getColumns(orderPaths[0].path)
          if (colRes.success && colRes.data) {
            setOrderColumns(colRes.data)
          } else {
            setOrderColumns([])
          }
        } catch {
          // 文件可能已移动/删除，静默处理
          setOrderColumns([])
        }
      } else {
        setOrderFiles([])
        setOrderColumns([])
      }

      // 还原辅助表文件路径和列名
      const restoredAuxPaths: Record<string, string> = {}
      const restoredAuxCols: Record<string, string[]> = {}
      for (const aux of (config.auxiliaryTables || [])) {
        const fp = aux.filePath || ''
        if (fp) {
          restoredAuxPaths[aux.id] = fp
          // 自动读取辅助表列名
          try {
            const colRes = await window.electronAPI.excelMerge.getColumns(fp)
            if (colRes.success && colRes.data) {
              restoredAuxCols[aux.id] = colRes.data
            }
          } catch {
            // 文件可能已移动/删除，静默处理
          }
        }
      }
      setAuxFilePaths(restoredAuxPaths)
      setAuxColumnsMap(restoredAuxCols)

      // 还原输出目录
      if (config.outputDir) {
        setOutputDir(config.outputDir)
      }

      setToast({ type: 'success', msg: `已加载预设"${name}"` })
    } else {
      setToast({ type: 'error', msg: res.error || '加载失败' })
    }
  }

  // ─── 保存预设 ───
  const handleSavePreset = async () => {
    const name = newPresetName.trim()
    if (!name) {
      setToast({ type: 'error', msg: '请输入预设名称' })
      return
    }
    // 把 auxFilePaths 中的路径写入 auxiliaryTables 的 filePath
    const auxTablesWithPath: AuxTableConfig[] = auxTables.map(t => ({
      ...t,
      filePath: auxFilePaths[t.id] || ''
    }))
    const config: PresetConfig = {
      name,
      orderSubFolder: '',
      auxSubFolder: '',
      textColumns,
      auxiliaryTables: auxTablesWithPath,
      outputFileName,
      orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
      outputDir
    }
    const res = await window.electronAPI.excelMerge.savePreset(config)
    if (res.success) {
      setToast({ type: 'success', msg: `预设"${name}"已保存` })
      setPresetName(name)
      setShowSaveDialog(false)
      setNewPresetName('')
      await refreshPresetList()
    } else {
      setToast({ type: 'error', msg: res.error || '保存失败' })
    }
  }

  // ─── 删除预设 ───
  const handleDeletePreset = async () => {
    if (!presetName) {
      setToast({ type: 'error', msg: '请先选择一个预设' })
      return
    }
    const res = await window.electronAPI.excelMerge.deletePreset(presetName)
    if (res.success) {
      setToast({ type: 'success', msg: `预设"${presetName}"已删除` })
      setPresetName('')
      await refreshPresetList()
    } else {
      setToast({ type: 'error', msg: res.error || '删除失败' })
    }
  }

  // ─── 新建空白配置 ───
  const handleNewConfig = () => {
    setPresetName('')
    setOrderFiles([])
    setAuxTables([])
    setAuxFilePaths({})
    setAuxColumnsMap({})
    setOrderColumns([])
    setTextColumns([])
    setOutputFileName('合并结果.xlsx')
    setResult(null)
    setProgress(null)
    setProgressLogs([])
    setError('')
    setToast({ type: 'success', msg: '已创建空白配置' })
  }

  // ─── 选择订单文件 ───
  const handleSelectOrderFiles = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
      multiSelections: true
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const newFiles: OrderFile[] = result.filePaths.map(fp => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        path: fp,
        name: fp.split(/[/\\]/).pop() || fp
      }))
      setOrderFiles(prev => [...prev, ...newFiles])

      // 读取第一个文件的列名（如果还没有列名）
      if (orderColumns.length === 0) {
        const res = await window.electronAPI.excelMerge.getColumns(result.filePaths[0])
        if (res.success && res.data) {
          setOrderColumns(res.data)
        }
      }
    }
  }

  // ─── 删除订单文件 ───
  const handleRemoveOrderFile = (id: string) => {
    setOrderFiles(prev => prev.filter(f => f.id !== id))
    if (orderFiles.length <= 1) {
      setOrderColumns([])
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

    const excelFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    )

    if (excelFiles.length > 0) {
      const newFiles: OrderFile[] = excelFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        path: (file as any).path,
        name: file.name
      }))
      setOrderFiles(prev => [...prev, ...newFiles])

      if (orderColumns.length === 0) {
        const firstPath = (excelFiles[0] as any).path
        if (firstPath) {
          const res = await window.electronAPI.excelMerge.getColumns(firstPath)
          if (res.success && res.data) {
            setOrderColumns(res.data)
          }
        }
      }
    }
  }, [orderColumns])

  // ─── 辅助表操作 ───
  const handleAddAuxTable = () => {
    const newTable: AuxTableConfig = {
      id: `aux-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `辅助表${auxTables.length + 1}`,
      fileName: '',
      filePath: '',
      matchPairs: [{ orderCol: '', auxCol: '' }],
      how: 'left'
    }
    setAuxTables(prev => [...prev, newTable])
  }

  const handleRemoveAuxTable = (id: string) => {
    setAuxTables(prev => prev.filter(t => t.id !== id))
    setAuxFilePaths(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setAuxColumnsMap(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleSelectAuxFile = async (auxId: string) => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
      multiSelections: false
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const fp = result.filePaths[0]
      const fileName = fp.split(/[/\\]/).pop() || fp

      // 更新辅助表文件名和完整路径
      setAuxTables(prev => prev.map(t =>
        t.id === auxId ? { ...t, fileName, filePath: fp, name: fileName.replace(/\.xlsx?$/, '') } : t
      ))
      setAuxFilePaths(prev => ({ ...prev, [auxId]: fp }))

      // 读取列名
      const res = await window.electronAPI.excelMerge.getColumns(fp)
      if (res.success && res.data) {
        setAuxColumnsMap(prev => ({ ...prev, [auxId]: res.data! }))
      }
    }
  }

  // ─── 更新辅助表配置 ───
  const updateAuxTable = (auxId: string, updates: Partial<AuxTableConfig>) => {
    setAuxTables(prev => prev.map(t =>
      t.id === auxId ? { ...t, ...updates } : t
    ))
  }

  // ─── 添加匹配字段对 ───
  const handleAddMatchPair = (auxId: string) => {
    setAuxTables(prev => prev.map(t =>
      t.id === auxId
        ? { ...t, matchPairs: [...t.matchPairs, { orderCol: '', auxCol: '' }] }
        : t
    ))
  }

  // ─── 删除匹配字段对 ───
  const handleRemoveMatchPair = (auxId: string, pairIndex: number) => {
    setAuxTables(prev => prev.map(t =>
      t.id === auxId
        ? { ...t, matchPairs: t.matchPairs.filter((_, i) => i !== pairIndex) }
        : t
    ))
  }

  // ─── 更新匹配字段对 ───
  const updateMatchPair = (auxId: string, pairIndex: number, field: 'orderCol' | 'auxCol', value: string) => {
    setAuxTables(prev => prev.map(t =>
      t.id === auxId
        ? {
            ...t,
            matchPairs: t.matchPairs.map((p, i) =>
              i === pairIndex ? { ...p, [field]: value } : p
            )
          }
        : t
    ))
  }

  // ─── 文本列操作 ───
  const handleRemoveTextColumn = (col: string) => {
    setTextColumns(prev => prev.filter(c => c !== col))
  }

  // ─── 选择输出目录 ───
  const handleSelectOutputDir = async () => {
    const result = await window.electronAPI.dialog.openFolder()
    if (!result.canceled && result.filePaths.length > 0) {
      setOutputDir(result.filePaths[0])
    }
  }

  // ─── 执行合并 ───
  const handleMerge = async () => {
    // 验证
    if (orderFiles.length === 0) {
      setToast({ type: 'error', msg: '请先选择订单文件' })
      return
    }
    if (auxTables.length === 0) {
      setToast({ type: 'error', msg: '请至少添加一个辅助表' })
      return
    }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) {
        setToast({ type: 'error', msg: `辅助表"${aux.name}"未选择文件` })
        return
      }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) {
          setToast({ type: 'error', msg: `辅助表"${aux.name}"有未完成的匹配字段` })
          return
        }
      }
    }
    if (!outputDir) {
      setToast({ type: 'error', msg: '请选择输出目录' })
      return
    }

    setIsMerging(true)
    setError('')
    setResult(null)
    setProgressLogs([])

    const params: MergeParams = {
      orderFilePaths: orderFiles.map(f => f.path),
      auxFilePaths,
      config: {
        name: presetName || '临时配置',
        orderSubFolder: '',
        auxSubFolder: '',
        textColumns,
        auxiliaryTables: auxTables,
        outputFileName,
        orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
        outputDir
      },
      outputDir
    }

    // 监听进度
    progressUnsubscribeRef.current = window.electronAPI.excelMerge.onProgress((prog) => {
      setProgress(prog)
      if (prog.message) {
        setProgressLogs(prev => [...prev, prog.message!])
      }
    })

    const res = await window.electronAPI.excelMerge.merge(params)
    setIsMerging(false)

    if (progressUnsubscribeRef.current) {
      progressUnsubscribeRef.current()
      progressUnsubscribeRef.current = null
    }

    if (res.success && res.data) {
      setResult(res.data)
      setToast({ type: 'success', msg: '合并完成！' })
    } else {
      setError(res.error || '合并失败')
      setToast({ type: 'error', msg: res.error || '合并失败' })
    }
  }

  // ─── 取消合并 ───
  const handleCancel = async () => {
    await window.electronAPI.excelMerge.cancel()
    setIsMerging(false)
    if (progressUnsubscribeRef.current) {
      progressUnsubscribeRef.current()
      progressUnsubscribeRef.current = null
    }
    setToast({ type: 'error', msg: '已取消合并' })
  }

  // ─── 打开输出目录 ───
  const handleOpenOutput = async () => {
    if (result) {
      const dir = result.outputPath.split(/[/\\]/).slice(0, -1).join('/')
      await window.electronAPI.shell.openPath(dir)
    }
  }

  // ─── 重置 ───
  const handleReset = () => {
    setResult(null)
    setProgress(null)
    setProgressLogs([])
    setError('')
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center space-x-2.5 ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <span className="text-white text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* ─── 预设管理栏 ─── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">预设管理</h2>
          <button
            onClick={handleNewConfig}
            disabled={isMerging}
            className="text-sm text-gray-500 hover:text-primary-600 disabled:opacity-50 transition-colors"
          >
            新建空白配置
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={presetName}
            onChange={(e) => {
              setPresetName(e.target.value)
              if (e.target.value) {
                handleLoadPreset(e.target.value)
              }
            }}
            disabled={isMerging}
            className="input-field flex-1"
          >
            <option value="">— 选择预设 —</option>
            {presetList.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}（{p.auxiliaryTableCount} 个辅助表）
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setNewPresetName(presetName)
              setShowSaveDialog(true)
            }}
            disabled={isMerging}
            className="btn-secondary whitespace-nowrap"
          >
            另存为...
          </button>
          <button
            onClick={handleDeletePreset}
            disabled={isMerging || !presetName}
            className="px-3 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            删除
          </button>
        </div>

        {/* 另存为对话框 */}
        {showSaveDialog && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg flex items-center space-x-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="输入预设名称（如：京东万商）"
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset()
              }}
            />
            <button onClick={handleSavePreset} className="btn-primary whitespace-nowrap">
              保存
            </button>
            <button
              onClick={() => { setShowSaveDialog(false); setNewPresetName('') }}
              className="btn-secondary whitespace-nowrap"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* ─── 订单文件区 ─── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">订单文件</h2>
          <button
            onClick={handleSelectOrderFiles}
            disabled={isMerging}
            className="btn-primary text-sm"
          >
            选择文件
          </button>
        </div>

        <div
          className={`drop-zone ${isDragging ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectOrderFiles}
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
              {isDragging ? '松开鼠标即可上传' : '拖拽 Excel 文件到此处'}
            </p>
            <p className="text-sm text-gray-400">选择多个订单 Excel 文件，将纵向合并</p>
          </div>
        </div>

        {/* 文件列表 */}
        {orderFiles.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                已选择 <span className="font-semibold text-primary-600">{orderFiles.length}</span> 个文件
              </span>
              <button
                onClick={() => { setOrderFiles([]); setOrderColumns([]) }}
                disabled={isMerging}
                className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                清空列表
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {orderFiles.map((file, index) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <span className="text-xs text-gray-400 font-mono w-6 text-center flex-shrink-0">{index + 1}</span>
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm text-gray-700 truncate font-medium">{file.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveOrderFile(file.id)}
                    disabled={isMerging}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    title="移除"
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

      {/* ─── 辅助表配置区 ─── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">辅助表配置</h2>
          <button
            onClick={handleAddAuxTable}
            disabled={isMerging}
            className="btn-primary text-sm"
          >
            + 添加辅助表
          </button>
        </div>

        {auxTables.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            尚未添加辅助表。点击「添加辅助表」开始配置关联表。
          </div>
        )}

        <div className="space-y-4">
          {auxTables.map((aux, auxIndex) => {
            const auxCols = auxColumnsMap[aux.id] || []
            return (
              <div key={aux.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                {/* 辅助表头部 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {auxIndex + 1}
                    </span>
                    <input
                      type="text"
                      value={aux.name}
                      onChange={(e) => updateAuxTable(aux.id, { name: e.target.value })}
                      disabled={isMerging}
                      className="text-sm font-medium text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveAuxTable(aux.id)}
                    disabled={isMerging}
                    className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                  >
                    删除辅助表
                  </button>
                </div>

                {/* 文件选择 */}
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">文件：</span>
                  <div className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 truncate">
                    {aux.fileName || '未选择文件'}
                  </div>
                  <button
                    onClick={() => handleSelectAuxFile(aux.id)}
                    disabled={isMerging}
                    className="btn-secondary text-sm whitespace-nowrap"
                  >
                    选择文件
                  </button>
                </div>

                {/* 连接方式 */}
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">连接方式：</span>
                  <select
                    value={aux.how}
                    onChange={(e) => updateAuxTable(aux.id, { how: e.target.value as 'left' | 'inner' | 'right' })}
                    disabled={isMerging}
                    className="input-field w-40"
                  >
                    <option value="left">Left Join（左连接）</option>
                    <option value="inner">Inner Join（内连接）</option>
                    <option value="right">Right Join（右连接）</option>
                  </select>
                </div>

                {/* 匹配字段 */}
                <div className="mb-2">
                  <p className="text-sm text-gray-500 mb-2">匹配字段：</p>
                  <div className="space-y-2">
                    {aux.matchPairs.map((pair, pairIndex) => (
                      <div key={pairIndex} className="flex items-center space-x-2">
                        <span className="text-xs text-gray-400 w-12 flex-shrink-0">订单表</span>
                        <SearchableSelect
                          value={pair.orderCol}
                          options={orderColumns}
                          onChange={(val) => updateMatchPair(aux.id, pairIndex, 'orderCol', val)}
                          placeholder="— 选择列 —"
                          disabled={isMerging}
                        />
                        <span className="text-gray-400 text-sm">↔</span>
                        <span className="text-xs text-gray-400 w-12 flex-shrink-0">辅助表</span>
                        <SearchableSelect
                          value={pair.auxCol}
                          options={auxCols}
                          onChange={(val) => updateMatchPair(aux.id, pairIndex, 'auxCol', val)}
                          placeholder="— 选择列 —"
                          disabled={isMerging}
                        />
                        {aux.matchPairs.length > 1 && (
                          <button
                            onClick={() => handleRemoveMatchPair(aux.id, pairIndex)}
                            disabled={isMerging}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            title="删除匹配字段"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleAddMatchPair(aux.id)}
                    disabled={isMerging}
                    className="mt-2 text-sm text-primary-500 hover:text-primary-600 transition-colors"
                  >
                    + 添加匹配字段
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── 输出与执行区 ─── */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">输出与执行</h2>

        {/* 输出目录 */}
        <div className="flex items-center space-x-2 mb-3">
          <span className="text-sm text-gray-500 w-20 flex-shrink-0">输出目录：</span>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            className="input-field flex-1"
            placeholder="选择输出目录"
            disabled={isMerging}
          />
          <button
            onClick={handleSelectOutputDir}
            disabled={isMerging}
            className="btn-secondary whitespace-nowrap"
          >
            浏览...
          </button>
        </div>

        {/* 输出文件名 */}
        <div className="flex items-center space-x-2 mb-3">
          <span className="text-sm text-gray-500 w-20 flex-shrink-0">输出文件名：</span>
          <input
            type="text"
            value={outputFileName}
            onChange={(e) => setOutputFileName(e.target.value)}
            className="input-field flex-1"
            placeholder="合并结果.xlsx"
            disabled={isMerging}
          />
        </div>

        {/* 文本列 */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm text-gray-500 w-20 flex-shrink-0">文本列：</span>
            <div className="flex-1">
              <SearchableSelect
                value={newTextColumn}
                options={orderColumns.filter(col => !textColumns.includes(col))}
                onChange={(val) => {
                  if (val && !textColumns.includes(val)) {
                    setTextColumns(prev => [...prev, val])
                    setNewTextColumn('')
                  }
                }}
                placeholder="选择需要强制转文本的列"
                disabled={isMerging}
              />
            </div>
          </div>
          {textColumns.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-20">
              {textColumns.map(col => (
                <span
                  key={col}
                  className="inline-flex items-center px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-sm group"
                >
                  {col}
                  <button
                    onClick={() => handleRemoveTextColumn(col)}
                    disabled={isMerging}
                    className="ml-1.5 text-amber-400 hover:text-amber-600"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 执行按钮 */}
        <div className="flex justify-center pt-2">
          {!isMerging ? (
            <button
              onClick={handleMerge}
              disabled={orderFiles.length === 0 || auxTables.length === 0}
              className="btn-primary px-12 py-3 text-base font-medium flex items-center space-x-2 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

      {/* ─── 进度日志区 ─── */}
      {(isMerging || progress || progressLogs.length > 0) && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">进度日志</h2>
          <div className="space-y-4">
            {/* 进度条 */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{progress?.step || '等待中'}</span>
                <span className="font-medium text-primary-600">{progress?.overallProgress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-green-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress?.overallProgress || 0}%` }}
                />
              </div>
            </div>

            {/* 日志列表 */}
            {progressLogs.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                {progressLogs.map((log, i) => (
                  <div key={i} className="text-gray-300">
                    <span className="text-gray-500">&gt;</span> {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}

            {/* 错误 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 合并结果 ─── */}
      {result && !isMerging && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">合并完成</h2>
            <div className="flex items-center space-x-2">
              <button onClick={handleReset} className="btn-secondary text-sm">重新开始</button>
              <button onClick={handleOpenOutput} className="btn-primary text-sm">打开所在目录</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.totalRows}</p>
              <p className="text-xs text-green-600 mt-0.5">总行数</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.totalColumns}</p>
              <p className="text-xs text-blue-600 mt-0.5">总列数</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.matchedCount}</p>
              <p className="text-xs text-green-600 mt-0.5">匹配成功</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.unmatchedCount}</p>
              <p className="text-xs text-amber-600 mt-0.5">未匹配</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExcelMergePage
