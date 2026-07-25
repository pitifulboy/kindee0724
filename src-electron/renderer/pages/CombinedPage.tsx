import React, { useState, useEffect, useRef } from 'react'
import SearchableSelect from '../components/SearchableSelect'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

interface MatchPair { orderCol: string; auxCol: string }
interface AuxTableConfig {
  id: string; name: string; fileName: string; filePath: string
  matchPairs: MatchPair[]; how: 'left' | 'inner' | 'right'
}
interface ExcelMergeProgress {
  step: string; currentTable: string; currentTableIndex: number; totalTables: number
  overallProgress: number; status: 'pending' | 'reading' | 'merging' | 'writing' | 'completed' | 'error'
  message?: string
}
interface ExcelMergeResult {
  outputPath: string; totalRows: number; totalColumns: number
  matchedCount: number; unmatchedCount: number
}
interface OrderFile { id: string; path: string; name: string }

type SourceType = 'table1' | 'constant' | 'billNo' | 'detailSeq' | 'financialSeq' | 'date' | 'materialCode' | 'materialName'
interface FieldMapping {
  id: string; templateCol: string; sourceType: SourceType
  table1Col?: string; constantValue?: string; financialSeqOffset?: number
}
// KingdeeImportPreset 接口已废弃，改用 project 模式
const sourceTypeOptions = [
  { value: 'table1', label: '数据表取值' }, { value: 'constant', label: '常量值' },
  { value: 'billNo', label: '单号自增' }, { value: 'detailSeq', label: '明细序号自增' },
  { value: 'financialSeq', label: '财务序号(单号+偏移)' }, { value: 'date', label: '日期' },
  { value: 'materialCode', label: '物料编码' }, { value: 'materialName', label: '物料名称(查模板)' },
]

const RECOMMENDED_CONFIG = {
  groupByColumn: '采购单号', matchFieldTable1: '金蝶物料编码', matchFieldTable2: '*(订单明细)物料编码#编码',
  textFormatColumns: ['*(订单明细)物料编码#编码', '*(基本信息)客户#编码', '(基本信息)收货方#编码', '(基本信息)结算方#编码', '(基本信息)付款方#编码', '*(基本信息)交货地点#编码'],
  fieldMappings: [
    { templateCol: '*基本信息(序号)', sourceType: 'billNo' as SourceType },
    { templateCol: '*(基本信息)日期', sourceType: 'date' as SourceType },
    { templateCol: '*(基本信息)交货地点#编码', sourceType: 'table1' as SourceType, table1Col: '*(基本信息)交货地点#编码' },
    { templateCol: '*(基本信息)详细地址', sourceType: 'table1' as SourceType, table1Col: '(基本信息)收货方地址' },
    { templateCol: '(基本信息)客户单号', sourceType: 'table1' as SourceType, table1Col: '采购单号' },
    { templateCol: '*订单明细(序号)', sourceType: 'detailSeq' as SourceType },
    { templateCol: '*财务信息(序号)', sourceType: 'financialSeq' as SourceType, financialSeqOffset: 1 },
    { templateCol: '*(订单明细)物料编码#编码', sourceType: 'materialCode' as SourceType, table1Col: '金蝶物料编码' },
    { templateCol: '(订单明细)物料编码#名称', sourceType: 'materialName' as SourceType, table1Col: '金蝶物料编码' },
    { templateCol: '(订单明细)销售数量', sourceType: 'table1' as SourceType, table1Col: '采购数量' },
    { templateCol: '(订单明细)计价数量', sourceType: 'table1' as SourceType, table1Col: '采购数量' },
    { templateCol: '*(订单明细)要货日期', sourceType: 'date' as SourceType },
  ],
}

// ═══════════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════════

interface CombinedPageProps {
  project: {
    id: string
    name: string
    step1Preset: any
    step2Preset: any
    createdAt: string
    updatedAt: string
  } | null
  onProjectUpdate: (project: any) => void
  onRefreshProjectList: () => Promise<void>
}

const CombinedPage: React.FC<CombinedPageProps> = ({ project, onProjectUpdate, onRefreshProjectList }) => {

  // ─── Excel合并 ───
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([])
  const [auxTables, setAuxTables] = useState<AuxTableConfig[]>([])
  const [auxFilePaths, setAuxFilePaths] = useState<Record<string, string>>({})
  const [orderColumns, setOrderColumns] = useState<string[]>([])
  const [auxColumnsMap, setAuxColumnsMap] = useState<Record<string, string[]>>({})
  const [mergeProgress, setMergeProgress] = useState<ExcelMergeProgress | null>(null)
  const [mergeProgressLogs, setMergeProgressLogs] = useState<string[]>([])
  const [mergeResult, setMergeResult] = useState<ExcelMergeResult | null>(null)
  const [mergeError, setMergeError] = useState('')
  const mergeProgressUnsubRef = useRef<(() => void) | null>(null)
  const mergeLogsEndRef = useRef<HTMLDivElement>(null)

  // ─── 金蝶导入（无 table1Path，由 mergeResult 自动提供）───
  const [table2Path, setTable2Path] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [outputPrefix, setOutputPrefix] = useState('完成_批量金蝶导入')
  const [startBillNo, setStartBillNo] = useState(111111)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [groupByColumn, setGroupByColumn] = useState('')
  const [matchFieldTable1, setMatchFieldTable1] = useState('')
  const [matchFieldTable2, setMatchFieldTable2] = useState('')
  const [templateHeaderRowIndex, setTemplateHeaderRowIndex] = useState(1)
  const [templateDataStartRowIndex, setTemplateDataStartRowIndex] = useState(2)
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
  const [kingdeeTextCols, setKingdeeTextCols] = useState<string[]>([])
  const [newKingdeeTextCol, setNewKingdeeTextCol] = useState('')
  const [table1Columns, setTable1Columns] = useState<string[]>([])
  const [templateColumns, setTemplateColumns] = useState<string[]>([])

  // ─── 两步执行状态 ───
  const [step1Executing, setStep1Executing] = useState(false)
  const [step2Executing, setStep2Executing] = useState(false)
  const [step1Done, setStep1Done] = useState(false)
  const [step1MergedPath, setStep1MergedPath] = useState('')
  const [executePhase, setExecutePhase] = useState('')
  const [finalResult, setFinalResult] = useState<{
    outputPath: string
    totalOrders: number
    totalRows: number
    fallbackWarning?: string
  } | null>(null)
  const isExecuting = step1Executing || step2Executing
  const [isRunAll, setIsRunAll] = useState(false)

  // 拖拽区域 ref（订单文件）
  const orderFileDropRef = useRef<HTMLDivElement>(null)
  const [orderFileDragOver, setOrderFileDragOver] = useState(false)
  // 拖拽区域 ref（模板表）
  const table2DropRef = useRef<HTMLDivElement>(null)
  const [table2DragOver, setTable2DragOver] = useState(false)
  // 拖拽区域 ref（辅助表文件）
  const auxDropRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [auxDragOver, setAuxDragOver] = useState<Record<string, boolean>>({})

  // ─── Toast ───
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) } }, [toast])

  // ─── 初始化 ───
  useEffect(() => {
    const init = async () => {
      const desktop = await window.electronAPI.app.getPath('desktop')
      setOutputDir(desktop)
    }
    init()
    return () => { if (mergeProgressUnsubRef.current) mergeProgressUnsubRef.current() }
  }, [])

  // 记录上一次的项目 ID，用于判断是否切换了项目
  const prevProjectIdRef = useRef<string | null>(null)

  // ─── 当项目切换时，自动加载对应预设 ───
  useEffect(() => {
    const currentId = project?.id ?? null

    if (!project) {
      handleClearAllConfig()
      prevProjectIdRef.current = null
      return
    }

    // 判断是否真的切换了项目（不是同一个项目的更新）
    const isSwitched = prevProjectIdRef.current !== null && prevProjectIdRef.current !== currentId
    const isFirstLoad = prevProjectIdRef.current === null

    // 加载 Step1 预设
    if (project.step1Preset) {
      const s1 = project.step1Preset
      setOrderFiles(s1.orderFiles || [])
      setAuxTables(s1.auxTables || [])
      setAuxFilePaths(s1.auxFilePaths || {})
      setOrderColumns(s1.orderColumns || [])
      setAuxColumnsMap(s1.auxColumnsMap || {})
    }
    // 加载 Step2 预设
    if (project.step2Preset) {
      const s2 = project.step2Preset
      setTable2Path(s2.table2Path || '')
      setOutputDir(s2.outputDir || '')
      setOutputPrefix(s2.outputPrefix || '完成_批量金蝶导入')
      setStartBillNo(s2.startBillNo || 111111)
      setDate(s2.date || new Date().toISOString().slice(0, 10))
      setGroupByColumn(s2.groupByColumn || '')
      setMatchFieldTable1(s2.matchFieldTable1 || '')
      setMatchFieldTable2(s2.matchFieldTable2 || '')
      setTemplateHeaderRowIndex(s2.templateHeaderRowIndex ?? 1)
      setTemplateDataStartRowIndex(s2.templateDataStartRowIndex ?? 2)
      setFieldMappings(s2.fieldMappings || [])
      setKingdeeTextCols(s2.textFormatColumns || [])
      // 读取模板表列名
      if (s2.table2Path) {
        window.electronAPI.kingdeeImport.getTemplateColumns(s2.table2Path, s2.templateHeaderRowIndex ?? 1)
          .then(r => { if (r.success && r.data) setTemplateColumns(r.data) })
          .catch(() => {})
      }
    }

    // 仅在切换到不同项目（或首次加载）时重置执行状态
    if (isFirstLoad || isSwitched) {
      setMergeResult(null); setMergeProgressLogs([]); setMergeError('')
      setFinalResult(null); setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
    }

    prevProjectIdRef.current = currentId
  }, [project])

  useEffect(() => {
    if (mergeLogsEndRef.current) mergeLogsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [mergeProgressLogs])

  // 辅助表拖拽 handler
  const setupAuxDrop = (auxId: string) => {
    const el = auxDropRefs.current[auxId]
    if (!el) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setAuxDragOver(prev => ({ ...prev, [auxId]: true })) }
    const onDragLeave = () => setAuxDragOver(prev => ({ ...prev, [auxId]: false }))
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setAuxDragOver(prev => ({ ...prev, [auxId]: false }))
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        const fp = (files[0] as any).path
        if (fp) {
          const res = await window.electronAPI.file.listExcelFiles(fp)
          if (res.success && res.data && res.data.length > 0) {
            const f = res.data[0]
            setAuxTables(prev => prev.map(t =>
              t.id === auxId ? { ...t, fileName: f.name, filePath: f.path, name: f.name.replace(/\.xlsx?$/, '') } : t
            ))
            setAuxFilePaths(prev => ({ ...prev, [auxId]: f.path }))
            const colRes = await window.electronAPI.excelMerge.getColumns(f.path)
            if (colRes.success && colRes.data) setAuxColumnsMap(prev => ({ ...prev, [auxId]: colRes.data! }))
          } else setToast({ type: 'error', msg: '请拖入Excel文件或包含Excel文件的文件夹' })
        }
      }
    }
    el.addEventListener('dragover', onDragOver); el.addEventListener('dragleave', onDragLeave); el.addEventListener('drop', onDrop)
    return () => { el.removeEventListener('dragover', onDragOver); el.removeEventListener('dragleave', onDragLeave); el.removeEventListener('drop', onDrop) }
  }

  // 订单文件拖拽
  useEffect(() => {
    const el = orderFileDropRef.current; if (!el) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setOrderFileDragOver(true) }
    const onDragLeave = () => setOrderFileDragOver(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setOrderFileDragOver(false)
      const items = Array.from(e.dataTransfer?.files || [])
      if (items.length > 0) {
        const fp = (items[0] as any).path
        if (fp) {
          const res = await window.electronAPI.file.listExcelFiles(fp)
          if (res.success && res.data && res.data.length > 0) {
            const existingPaths = new Set(orderFiles.map(f => f.path))
            const newFiles = res.data
              .filter(f => !existingPaths.has(f.path))
              .map(f => ({ id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, path: f.path, name: f.name }))
            if (newFiles.length > 0) {
              setOrderFiles(prev => [...prev, ...newFiles])
              if (orderColumns.length === 0) {
                const colRes = await window.electronAPI.excelMerge.getColumns(newFiles[0].path)
                if (colRes.success && colRes.data) setOrderColumns(colRes.data)
              }
            } else if (res.data.length > 0) setToast({ type: 'error', msg: '文件已存在' })
          } else setToast({ type: 'error', msg: '未找到Excel文件' })
        }
      }
    }
    el.addEventListener('dragover', onDragOver); el.addEventListener('dragleave', onDragLeave); el.addEventListener('drop', onDrop)
    return () => { el.removeEventListener('dragover', onDragOver); el.removeEventListener('dragleave', onDragLeave); el.removeEventListener('drop', onDrop) }
  }, [orderFiles, orderColumns.length])

  // 模板表拖拽
  useEffect(() => {
    const el = table2DropRef.current; if (!el) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setTable2DragOver(true) }
    const onDragLeave = () => setTable2DragOver(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setTable2DragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        const fp = (files[0] as any).path
        if (fp && (fp.endsWith('.xlsx') || fp.endsWith('.xls'))) {
          setTable2Path(fp)
          const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
          if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
        } else setToast({ type: 'error', msg: '请拖入Excel文件' })
      }
    }
    el.addEventListener('dragover', onDragOver); el.addEventListener('dragleave', onDragLeave); el.addEventListener('drop', onDrop)
    return () => { el.removeEventListener('dragover', onDragOver); el.removeEventListener('dragleave', onDragLeave); el.removeEventListener('drop', onDrop) }
  }, [templateHeaderRowIndex])

  // ═══════════════════════════════════════════════════════════
  // 项目预设操作（按步骤分别保存）
  // ═══════════════════════════════════════════════════════════

  /** 清空全部配置 */
  const handleClearAllConfig = () => {
    setOrderFiles([]); setAuxTables([])
    setAuxFilePaths({}); setAuxColumnsMap({}); setOrderColumns([])
    setTable2Path(''); setOutputPrefix('完成_批量金蝶导入')
    setStartBillNo(111111); setDate(new Date().toISOString().slice(0, 10))
    setGroupByColumn(''); setMatchFieldTable1(''); setMatchFieldTable2('')
    setTemplateHeaderRowIndex(1); setTemplateDataStartRowIndex(2)
    setFieldMappings([]); setKingdeeTextCols([])
    setTable1Columns([]); setTemplateColumns([])
    setMergeResult(null); setMergeProgress(null); setMergeProgressLogs([]); setMergeError('')
    setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
  }

  /** 保存 Step1（合并Excel）预设到当前项目 */
  const handleSaveStep1Preset = async () => {
    if (!project) { setToast({ type: 'error', msg: '请先在左侧选择或新建一个项目' }); return }
    const step1Preset = {
      orderFiles, auxTables, auxFilePaths, orderColumns, auxColumnsMap
    }
    const res = await window.electronAPI.project.updateStep1(project.id, step1Preset)
    if (res.success) {
      onProjectUpdate({ ...project, step1Preset })
      onRefreshProjectList()
      setToast({ type: 'success', msg: '合并Excel预设已保存到项目' })
    } else {
      setToast({ type: 'error', msg: res.error || '保存失败' })
    }
  }

  /** 保存 Step2（金蝶导入）预设到当前项目 */
  const handleSaveStep2Preset = async () => {
    if (!project) { setToast({ type: 'error', msg: '请先在左侧选择或新建一个项目' }); return }
    const step2Preset = {
      table2Path, outputDir, outputPrefix, startBillNo, date,
      groupByColumn, matchFieldTable1, matchFieldTable2,
      templateHeaderRowIndex, templateDataStartRowIndex,
      fieldMappings, textFormatColumns: kingdeeTextCols
    }
    const res = await window.electronAPI.project.updateStep2(project.id, step2Preset)
    if (res.success) {
      onProjectUpdate({ ...project, step2Preset })
      onRefreshProjectList()
      setToast({ type: 'success', msg: '金蝶导入预设已保存到项目' })
    } else {
      setToast({ type: 'error', msg: res.error || '保存失败' })
    }
  }

  const handleLoadRecommended = () => {
    setGroupByColumn(RECOMMENDED_CONFIG.groupByColumn)
    setMatchFieldTable1(RECOMMENDED_CONFIG.matchFieldTable1)
    setMatchFieldTable2(RECOMMENDED_CONFIG.matchFieldTable2)
    setKingdeeTextCols(RECOMMENDED_CONFIG.textFormatColumns)
    setFieldMappings(RECOMMENDED_CONFIG.fieldMappings.map((m, i) => ({ id: `rec-${Date.now()}-${i}`, ...m })))
    setToast({ type: 'success', msg: '已加载推荐配置' })
  }

  // ═══════════════════════════════════════════════════════════
  // 订单文件 & 辅助表操作
  // ═══════════════════════════════════════════════════════════
  const handleSelectOrderFiles = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }], multiSelections: true
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const newFiles = result.filePaths.map(fp => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        path: fp, name: fp.split(/[/\\]/).pop() || fp
      }))
      setOrderFiles(prev => [...prev, ...newFiles])
      if (orderColumns.length === 0) {
        const res = await window.electronAPI.excelMerge.getColumns(result.filePaths[0])
        if (res.success && res.data) setOrderColumns(res.data)
      }
    }
  }

  const handleRemoveOrderFile = (id: string) => {
    setOrderFiles(prev => prev.filter(f => f.id !== id))
    if (orderFiles.length <= 1) setOrderColumns([])
  }

  const handleAddAuxTable = () => {
    setAuxTables(prev => [...prev, {
      id: `aux-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `辅助表${prev.length + 1}`, fileName: '', filePath: '',
      matchPairs: [{ orderCol: '', auxCol: '' }], how: 'left'
    }])
  }

  const handleRemoveAuxTable = (id: string) => {
    setAuxTables(prev => prev.filter(t => t.id !== id))
    setAuxFilePaths(prev => { const n = { ...prev }; delete n[id]; return n })
    setAuxColumnsMap(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const handleSelectAuxFile = async (auxId: string) => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }], multiSelections: false
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const fp = result.filePaths[0]; const fileName = fp.split(/[/\\]/).pop() || fp
      setAuxTables(prev => prev.map(t =>
        t.id === auxId ? { ...t, fileName, filePath: fp, name: fileName.replace(/\.xlsx?$/, '') } : t
      ))
      setAuxFilePaths(prev => ({ ...prev, [auxId]: fp }))
      const res = await window.electronAPI.excelMerge.getColumns(fp)
      if (res.success && res.data) setAuxColumnsMap(prev => ({ ...prev, [auxId]: res.data! }))
    }
  }

  const updateAuxTable = (auxId: string, updates: Partial<AuxTableConfig>) =>
    setAuxTables(prev => prev.map(t => t.id === auxId ? { ...t, ...updates } : t))
  const handleAddMatchPair = (auxId: string) =>
    setAuxTables(prev => prev.map(t => t.id === auxId ? { ...t, matchPairs: [...t.matchPairs, { orderCol: '', auxCol: '' }] } : t))
  const handleRemoveMatchPair = (auxId: string, pi: number) =>
    setAuxTables(prev => prev.map(t => t.id === auxId ? { ...t, matchPairs: t.matchPairs.filter((_, i) => i !== pi) } : t))
  const updateMatchPair = (auxId: string, pi: number, field: 'orderCol' | 'auxCol', value: string) =>
    setAuxTables(prev => prev.map(t => t.id === auxId ? { ...t, matchPairs: t.matchPairs.map((p, i) => i === pi ? { ...p, [field]: value } : p) } : t))

  // ═══════════════════════════════════════════════════════════
  // 金蝶导入操作
  // ═══════════════════════════════════════════════════════════
  const handleSelectTable2 = async () => {
    const res = await window.electronAPI.dialog.openFiles({ filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }] })
    if (!res.canceled && res.filePaths.length > 0) {
      const fp = res.filePaths[0]; setTable2Path(fp)
      const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
      if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
    }
  }

  const handleSelectOutputDir = async () => {
    const res = await window.electronAPI.dialog.openFolder()
    if (!res.canceled && res.filePaths.length > 0) setOutputDir(res.filePaths[0])
  }

  const handleHeaderRowChange = async (val: number) => {
    setTemplateHeaderRowIndex(val)
    if (table2Path) {
      const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(table2Path, val)
      if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
    }
  }

  const handleAddMapping = () => {
    setFieldMappings(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, templateCol: '', sourceType: 'table1', table1Col: '' }])
  }
  const handleUpdateMapping = (id: string, field: string, value: any) =>
    setFieldMappings(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
  const handleDeleteMapping = (id: string) => setFieldMappings(prev => prev.filter(m => m.id !== id))
  const handleAddTextCol = () => {
    if (newKingdeeTextCol && !kingdeeTextCols.includes(newKingdeeTextCol)) {
      setKingdeeTextCols(prev => [...prev, newKingdeeTextCol]); setNewKingdeeTextCol('')
    }
  }
  const handleRemoveKingdeeTextCol = (col: string) => setKingdeeTextCols(prev => prev.filter(c => c !== col))

  // ═══════════════════════════════════════════════════════════
  // Step 1：合并 Excel
  // ═══════════════════════════════════════════════════════════
  const handleStep1Merge = async () => {
    if (orderFiles.length === 0) { setToast({ type: 'error', msg: '请先选择订单文件' }); return }
    if (auxTables.length === 0) { setToast({ type: 'error', msg: '请至少添加一个辅助表' }); return }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) { setToast({ type: 'error', msg: `辅助表"${aux.name}"未选择文件` }); return }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) { setToast({ type: 'error', msg: `辅助表"${aux.name}"有未完成的匹配字段` }); return }
      }
    }
    setStep1Executing(true); setMergeError(''); setMergeProgressLogs([]); setMergeResult(null)
    setStep1Done(false); setStep1MergedPath('')
    setExecutePhase('正在合并Excel文件...')

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const mergeRes = await window.electronAPI.excelMerge.merge({
        orderFilePaths: orderFiles.map(f => f.path), auxFilePaths,
        config: {
          name: project?.name || '临时配置', orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: auxTables, outputFileName: '合并结果.xlsx',
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!mergeRes.success || !mergeRes.data) { setToast({ type: 'error', msg: mergeRes.error || '合并失败' }); setStep1Executing(false); return }
      const mergedPath = mergeRes.data.outputPath
      setMergeResult(mergeRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, `✓ 合并完成：${mergeRes.data.totalRows}行`])
      setExecutePhase('合并完成')
      setToast({ type: 'success', msg: `合并完成！共 ${mergeRes.data.totalRows} 行` })
    } catch (e: any) {
      setToast({ type: 'error', msg: `合并出错: ${e.message}` })
    } finally {
      setStep1Executing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Step 2：生成导入金蝶的汇总表
  // ═══════════════════════════════════════════════════════════
  const handleStep2Import = async () => {
    if (!step1Done || !step1MergedPath) { setToast({ type: 'error', msg: '请先执行合并Excel' }); return }
    if (!table2Path) { setToast({ type: 'error', msg: '请选择模板表(Table2)' }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: '请选择分组列' }); return }
    if (!matchFieldTable1 || !matchFieldTable2) { setToast({ type: 'error', msg: '请配置匹配字段' }); return }
    if (fieldMappings.length === 0) { setToast({ type: 'error', msg: '请至少配置一个字段映射' }); return }
    if (!outputDir) { setToast({ type: 'error', msg: '请选择输出目录' }); return }

    setStep2Executing(true); setFinalResult(null); setMergeProgressLogs([])
    setExecutePhase('正在生成导入金蝶汇总表...')

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')

      // Phase 2: 步骤1 - 订单拆分
      setExecutePhase('步骤1: 订单拆分...')
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: step1MergedPath, groupByColumn, startBillNo, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || '步骤1失败' }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤1: 订单拆分完成`])

      // Phase 3: 步骤2a - Join
      setExecutePhase('步骤2a: 关联...')
      const s21 = await window.electronAPI.kingdeeImport.step2a({ table1Path: step1MergedPath, table2Path, groupByColumn, matchFieldTable1, matchFieldTable2, startBillNo, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s21.success) { setToast({ type: 'error', msg: s21.error || '步骤2a失败' }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2a: Join完成`])

      // Phase 4: 步骤2b - 删除未匹配
      setExecutePhase('步骤2b: 清理未匹配行...')
      const s21Dir = s21.data.outputPath.replace(/\\[^\\]+$/, '')
      const s22 = await window.electronAPI.kingdeeImport.step2b({ inputDir: s21Dir, outputDir: tmpDir })
      if (!s22.success) { setToast({ type: 'error', msg: s22.error || '步骤2b失败' }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2b: 清理完成`])

      // Phase 5: 步骤2c - 填充数据
      setExecutePhase('步骤2c: 填充数据...')
      const s22Dir = s22.data.outputPath.replace(/\\[^\\]+$/, '')
      const s23 = await window.electronAPI.kingdeeImport.step2c({ inputDir: s22Dir, fieldMappings, date, matchFieldTable1, matchFieldTable2, templateHeaderRowIndex, templateDataStartRowIndex, table2Path, outputDir: tmpDir })
      if (!s23.success) { setToast({ type: 'error', msg: s23.error || '步骤2c失败' }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2c: 填充完成`])

      // Phase 6: 步骤2d - 恢复结构
      setExecutePhase('步骤2d: 恢复模板结构...')
      const s23Dir = s23.data.outputPath.replace(/\\[^\\]+$/, '')
      const s24 = await window.electronAPI.kingdeeImport.step2d({ inputDir: s23Dir, table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s24.success) { setToast({ type: 'error', msg: s24.error || '步骤2d失败' }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2d: 恢复完成`])

      // Phase 7: 步骤3 - 汇总
      setExecutePhase('步骤3: 汇总输出...')
      const s3 = await window.electronAPI.kingdeeImport.step3({
        table2Path,
        filledTemplateFiles: s24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })),
        templateHeaderRowIndex, templateDataStartRowIndex,
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols
      })
      if (!s3.success) { setToast({ type: 'error', msg: s3.error || '步骤3失败' }); setStep2Executing(false); return }

      setMergeProgressLogs(prev => [...prev, `✓ 全部完成！输出文件：${s3.data.outputPath}`])
      setFinalResult({
        outputPath: s3.data.outputPath,
        totalOrders: s3.data.totalOrders,
        totalRows: s3.data.totalRows,
        fallbackWarning: s3.data.fallbackWarning
      })
      setExecutePhase('正式生成完成')
      setToast({ type: 'success', msg: '金蝶导入汇总表生成完成！' })
    } catch (e: any) {
      setToast({ type: 'error', msg: `生成出错: ${e.message}` })
    } finally {
      setStep2Executing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 一键执行
  // ═══════════════════════════════════════════════════════════
  const handleRunAll = async () => {
    if (!project) { setToast({ type: 'error', msg: '请先在左侧选择或新建一个项目' }); return }
    // Step1 校验
    if (orderFiles.length === 0) { setToast({ type: 'error', msg: '请先选择订单文件' }); return }
    if (auxTables.length === 0) { setToast({ type: 'error', msg: '请至少添加一个辅助表' }); return }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) { setToast({ type: 'error', msg: `辅助表"${aux.name}"未选择文件` }); return }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) { setToast({ type: 'error', msg: `辅助表"${aux.name}"有未完成的匹配字段` }); return }
      }
    }
    // Step2 校验
    if (!table2Path) { setToast({ type: 'error', msg: '请选择模板表(Table2)' }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: '请选择分组列' }); return }
    if (!matchFieldTable1 || !matchFieldTable2) { setToast({ type: 'error', msg: '请配置匹配字段' }); return }
    if (fieldMappings.length === 0) { setToast({ type: 'error', msg: '请至少配置一个字段映射' }); return }
    if (!outputDir) { setToast({ type: 'error', msg: '请选择输出目录' }); return }

    setIsRunAll(true)
    setMergeError(''); setMergeProgressLogs([]); setMergeResult(null); setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')

      // ── Step 1: 合并 Excel ──
      setStep1Executing(true)
      setExecutePhase('正在合并Excel文件...')
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const mergeRes = await window.electronAPI.excelMerge.merge({
        orderFilePaths: orderFiles.map(f => f.path), auxFilePaths,
        config: {
          name: project.name, orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: auxTables, outputFileName: '合并结果.xlsx',
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!mergeRes.success || !mergeRes.data) { setToast({ type: 'error', msg: mergeRes.error || '合并失败' }); setStep1Executing(false); setIsRunAll(false); return }
      const mergedPath = mergeRes.data.outputPath
      setMergeResult(mergeRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, `✓ 合并完成：${mergeRes.data.totalRows}行`])
      setStep1Executing(false)

      // ── Step 2: 生成导入金蝶汇总表 ──
      setStep2Executing(true)
      setExecutePhase('步骤1: 订单拆分...')
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: mergedPath, groupByColumn, startBillNo, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || '步骤1失败' }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤1: 订单拆分完成`])

      setExecutePhase('步骤2a: 关联...')
      const s21 = await window.electronAPI.kingdeeImport.step2a({ table1Path: mergedPath, table2Path, groupByColumn, matchFieldTable1, matchFieldTable2, startBillNo, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s21.success) { setToast({ type: 'error', msg: s21.error || '步骤2a失败' }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2a: Join完成`])

      setExecutePhase('步骤2b: 清理未匹配行...')
      const s21Dir = s21.data.outputPath.replace(/\\[^\\]+$/, '')
      const s22 = await window.electronAPI.kingdeeImport.step2b({ inputDir: s21Dir, outputDir: tmpDir })
      if (!s22.success) { setToast({ type: 'error', msg: s22.error || '步骤2b失败' }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2b: 清理完成`])

      setExecutePhase('步骤2c: 填充数据...')
      const s22Dir = s22.data.outputPath.replace(/\\[^\\]+$/, '')
      const s23 = await window.electronAPI.kingdeeImport.step2c({ inputDir: s22Dir, fieldMappings, date, matchFieldTable1, matchFieldTable2, templateHeaderRowIndex, templateDataStartRowIndex, table2Path, outputDir: tmpDir })
      if (!s23.success) { setToast({ type: 'error', msg: s23.error || '步骤2c失败' }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2c: 填充完成`])

      setExecutePhase('步骤2d: 恢复模板结构...')
      const s23Dir = s23.data.outputPath.replace(/\\[^\\]+$/, '')
      const s24 = await window.electronAPI.kingdeeImport.step2d({ inputDir: s23Dir, table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s24.success) { setToast({ type: 'error', msg: s24.error || '步骤2d失败' }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, `✓ 步骤2d: 恢复完成`])

      setExecutePhase('步骤3: 汇总输出...')
      const s3 = await window.electronAPI.kingdeeImport.step3({
        table2Path,
        filledTemplateFiles: s24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })),
        templateHeaderRowIndex, templateDataStartRowIndex,
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols
      })
      if (!s3.success) { setToast({ type: 'error', msg: s3.error || '步骤3失败' }); setStep2Executing(false); setIsRunAll(false); return }

      setMergeProgressLogs(prev => [...prev, `✓ 全部完成！输出文件：${s3.data.outputPath}`])
      setFinalResult({
        outputPath: s3.data.outputPath,
        totalOrders: s3.data.totalOrders,
        totalRows: s3.data.totalRows,
        fallbackWarning: s3.data.fallbackWarning
      })
      setExecutePhase('全部完成')
      setToast({ type: 'success', msg: '一键执行完成！金蝶导入汇总表已生成' })
    } catch (e: any) {
      setToast({ type: 'error', msg: `执行出错: ${e.message}` })
    } finally {
      setStep1Executing(false)
      setStep2Executing(false)
      setIsRunAll(false)
    }
  }

  const handleOpenFinalOutput = async () => {
    if (finalResult?.outputPath) {
      const dir = finalResult.outputPath.substring(0, finalResult.outputPath.lastIndexOf('\\'))
      await window.electronAPI.shell.openPath(dir)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <span className="text-white text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          项目信息
          ══════════════════════════════════════════════════════ */}
      {project && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <div>
                <span className="text-sm font-semibold text-gray-800">{project.name}</span>
                <span className="text-xs text-gray-400 ml-3">
                  最后修改：{new Date(project.updatedAt).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={handleClearAllConfig} disabled={isExecuting}
                className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50">
                清空配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          快捷操作工具栏
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-4">
        <div className="flex items-center space-x-4">
          <button onClick={handleRunAll} disabled={isExecuting}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
            {isRunAll ? (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            )}
            {isRunAll ? '执行中...' : '一键执行'}
          </button>
          <button onClick={handleStep1Merge} disabled={step1Executing}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
            {step1Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {step1Executing ? '合并中...' : '执行合并Excel'}
          </button>
          <button onClick={handleStep2Import}
            disabled={step2Executing || !step1Done}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            title={!step1Done ? '请先执行合并Excel' : ''}>
            {step2Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {step2Executing ? '生成中...' : '生成导入金蝶汇总表'}
          </button>
          {!step1Done && <span className="text-sm text-gray-400">（需先执行合并Excel）</span>}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          第一步：合并Excel
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
        <h2 className="text-base font-semibold text-blue-700 mb-4 flex items-center">
          <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mr-2">1</span>
          合并Excel
        </h2>

        {/* 文件配置 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">文件配置</h3>

          {/* 订单文件 */}
          <div className="mb-4">
            <div ref={orderFileDropRef}
              className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
                orderFileDragOver ? 'border-blue-400 bg-blue-50 border-dashed' : 'border-gray-200'
              }`}>
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">订单文件:</label>
              <button onClick={handleSelectOrderFiles} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50">选择文件</button>
              <span className="text-sm text-gray-500 truncate flex-1">
                {orderFiles.length > 0 ? `已选 ${orderFiles.length} 个文件` : '拖拽文件或文件夹到此处'}
              </span>
              {orderFiles.length > 0 && (
                <button onClick={() => { setOrderFiles([]); setOrderColumns([]) }} disabled={isExecuting}
                  className="text-xs text-red-500 hover:text-red-600 flex-shrink-0">清空</button>
              )}
            </div>
            {orderFiles.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto space-y-0.5 pl-2">
                {orderFiles.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between px-1 py-0.5 hover:bg-gray-50 rounded">
                    <span className="text-xs text-gray-500 truncate flex-1">
                      <span className="text-gray-400 mr-1">{i + 1}.</span>
                      {f.name}
                    </span>
                    <button onClick={() => handleRemoveOrderFile(f.id)} disabled={isExecuting}
                      className="p-0.5 text-gray-300 hover:text-red-500 text-xs flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 辅助表 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">辅助表配置</h3>
              <button onClick={handleAddAuxTable} disabled={isExecuting} className="btn-primary text-sm">+ 添加辅助表</button>
            </div>
            {auxTables.length === 0 && <p className="text-xs text-gray-400 text-center py-3">尚未添加辅助表</p>}
            <div className="space-y-3">
              {auxTables.map((aux, auxIndex) => {
                const auxCols = auxColumnsMap[aux.id] || []
                return (
                  <div key={aux.id} className="border-2 border-gray-200 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">{auxIndex + 1}</span>
                        <input type="text" value={aux.name} onChange={e => updateAuxTable(aux.id, { name: e.target.value })}
                          disabled={isExecuting}
                          className="text-sm font-medium text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1" />
                      </div>
                      <button onClick={() => handleRemoveAuxTable(aux.id)} disabled={isExecuting}
                        className="text-xs text-red-500 hover:text-red-600">删除</button>
                    </div>
                    <div ref={el => { auxDropRefs.current[aux.id] = el }}
                      onMouseEnter={() => setupAuxDrop(aux.id)}
                      className={`flex items-center space-x-3 mb-2 p-2 rounded-lg border-2 transition-colors ${
                        auxDragOver[aux.id] ? 'border-blue-400 bg-blue-50 border-dashed' : 'border-gray-200'
                      }`}>
                      <label className="text-xs text-gray-500 w-12 flex-shrink-0">文件:</label>
                      <span className="flex-1 text-sm text-gray-600 truncate">{aux.fileName || '拖入文件或点击选择'}</span>
                      <button onClick={() => handleSelectAuxFile(aux.id)} disabled={isExecuting}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50">选择</button>
                    </div>
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-xs text-gray-500">连接方式:</span>
                      <select value={aux.how} onChange={e => updateAuxTable(aux.id, { how: e.target.value as 'left' | 'inner' | 'right' })}
                        disabled={isExecuting} className="px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 w-36">
                        <option value="left">Left Join</option>
                        <option value="inner">Inner Join</option>
                        <option value="right">Right Join</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">匹配字段:</p>
                      {aux.matchPairs.map((pair, pi) => (
                        <div key={pi} className="flex items-center space-x-2 mb-1">
                          <span className="text-xs text-gray-400 w-10">订单</span>
                          <SearchableSelect value={pair.orderCol} options={orderColumns}
                            onChange={v => updateMatchPair(aux.id, pi, 'orderCol', v)}
                            placeholder="— 列 —" disabled={isExecuting} />
                          <span className="text-gray-400 text-xs">↔</span>
                          <span className="text-xs text-gray-400 w-10">辅助</span>
                          <SearchableSelect value={pair.auxCol} options={auxCols}
                            onChange={v => updateMatchPair(aux.id, pi, 'auxCol', v)}
                            placeholder="— 列 —" disabled={isExecuting} />
                          {aux.matchPairs.length > 1 && (
                            <button onClick={() => handleRemoveMatchPair(aux.id, pi)} disabled={isExecuting}
                              className="p-1 text-gray-300 hover:text-red-500 text-xs">✕</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => handleAddMatchPair(aux.id)} disabled={isExecuting}
                        className="text-xs text-blue-500 hover:text-blue-600 mt-1">+ 添加匹配字段</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Step 1 — 操作按钮 */}
        <div className="flex items-center space-x-3 mb-4">
          {step1Done && (
            <span className="text-sm text-green-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              合并已完成
            </span>
          )}
          <div className="flex-1" />
          <button onClick={handleSaveStep1Preset} disabled={isExecuting || !project}
            className="px-3 py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            保存预设
          </button>
        </div>

        {/* Step 1 — 输出/进度 */}
        {(step1Executing || mergeProgressLogs.length > 0 || mergeResult || mergeError) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            {/* 当前阶段 */}
            {executePhase && (
              <div className="text-sm text-gray-700 font-medium mb-2">
                {step1Executing && (
                  <svg className="animate-spin h-4 w-4 inline mr-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {executePhase}
              </div>
            )}

            {/* 合并进度条 */}
            {step1Executing && mergeProgress && (
              <>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{mergeProgress.step || ''}</span>
                  <span className="font-medium text-blue-600">{mergeProgress.overallProgress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                  <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${mergeProgress?.overallProgress || 0}%` }} />
                </div>
              </>
            )}

            {/* 日志 */}
            {mergeProgressLogs.length > 0 && (
              <div className="bg-gray-900 rounded p-2 max-h-36 overflow-y-auto font-mono text-xs space-y-0.5">
                {mergeProgressLogs.map((log, i) => (
                  <div key={i} className={log.startsWith('✓') ? 'text-green-400' : 'text-gray-300'}>
                    <span className="text-gray-500">&gt;</span> {log}
                  </div>
                ))}
                <div ref={mergeLogsEndRef} />
              </div>
            )}

            {/* 错误 */}
            {mergeError && <div className="mt-2 bg-red-50 border border-red-200 rounded p-2"><p className="text-red-600 text-xs">{mergeError}</p></div>}

            {/* 合并结果统计 */}
            {mergeResult && !step1Executing && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{mergeResult.totalRows}</p>
                    <p className="text-xs text-blue-600">合并总行数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{mergeResult.totalColumns}</p>
                    <p className="text-xs text-blue-600">合并总列数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{mergeResult.matchedCount}</p>
                    <p className="text-xs text-blue-600">匹配行数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{mergeResult.unmatchedCount}</p>
                    <p className="text-xs text-amber-600">未匹配行数</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          第二步：生成导入金蝶的汇总表
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border-2 border-green-200 p-4">
        <h2 className="text-base font-semibold text-green-700 mb-4 flex items-center">
          <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
          生成导入金蝶的汇总表
        </h2>

        {/* 模板表 & 输出配置 */}
        <div className="bg-white rounded-lg border-2 border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">模板表 & 输出配置</h3>
          <div className="space-y-3">
            <div ref={table2DropRef}
              className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
                table2DragOver ? 'border-blue-400 bg-blue-50 border-dashed' : 'border-gray-200'
              }`}>
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板表(Table2):</label>
              <button onClick={handleSelectTable2} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50">选择文件</button>
              <span className="text-sm text-gray-500 truncate flex-1">{table2Path || '拖入文件或点击选择'}</span>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">输出目录:</label>
              <input type="text" value={outputDir} onClick={handleSelectOutputDir} readOnly
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50 cursor-pointer"
                placeholder="点击选择目录" />
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">输出文件前缀:</label>
              <input type="text" value={outputPrefix} onChange={e => setOutputPrefix(e.target.value)}
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
            </div>
          </div>
        </div>

        {/* 客户订单拆分字段配置 */}
        <div className="bg-white rounded-lg border-2 border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">客户订单拆分字段配置</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-28 flex-shrink-0">起始单号:</label>
              <input type="number" value={startBillNo} onChange={e => setStartBillNo(parseInt(e.target.value) || 0)}
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-28 flex-shrink-0">分组列:</label>
              <div className="flex-1">
                <SearchableSelect value={groupByColumn} options={orderColumns} onChange={setGroupByColumn}
                  placeholder="— 选择列 —" disabled={isExecuting} />
              </div>
            </div>
          </div>
        </div>

        {/* 表格字段配置 */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">表格字段配置</h3>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">数据表匹配字段:</label>
              <div className="flex-1">
                <SearchableSelect value={matchFieldTable1} options={table1Columns} onChange={setMatchFieldTable1}
                  placeholder="— 选择数据表列 —" disabled={isExecuting} />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板匹配字段:</label>
              <div className="flex-1">
                <SearchableSelect value={matchFieldTable2} options={templateColumns} onChange={setMatchFieldTable2}
                  placeholder="— 选择模板列 —" disabled={isExecuting} />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板表头行:</label>
              <input type="number" value={templateHeaderRowIndex}
                onChange={e => handleHeaderRowChange(parseInt(e.target.value) || 0)}
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-600 w-32 flex-shrink-0">数据起始行:</label>
              <input type="number" value={templateDataStartRowIndex}
                onChange={e => setTemplateDataStartRowIndex(parseInt(e.target.value) || 0)}
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
            </div>
          </div>

          <div className="flex items-center space-x-3 mb-4">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">日期:</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              disabled={isExecuting}
              className="w-52 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
          </div>

          {/* 字段映射 */}
          <div className="mb-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-gray-700">字段映射:</span>
              <button onClick={handleAddMapping} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">+ 添加映射</button>
            </div>
            <div className="space-y-2">
              {fieldMappings.map((mapping) => (
                <div key={mapping.id} className="border border-gray-200 rounded p-3 bg-white">
                  <div className="flex items-start space-x-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">模板列</label>
                      <SearchableSelect value={mapping.templateCol} options={templateColumns}
                        onChange={val => handleUpdateMapping(mapping.id, 'templateCol', val)}
                        placeholder="— 选择模板列 —" disabled={isExecuting} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">来源类型</label>
                      <select value={mapping.sourceType} onChange={e => handleUpdateMapping(mapping.id, 'sourceType', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50">
                        {sourceTypeOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                      </select>
                    </div>
                    <div className="w-24 flex-shrink-0 pt-5">
                      <button onClick={() => handleDeleteMapping(mapping.id)} disabled={isExecuting}
                        className="px-3 py-1.5 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200 disabled:opacity-50">删除</button>
                    </div>
                  </div>
                  {(mapping.sourceType === 'table1' || mapping.sourceType === 'materialCode' || mapping.sourceType === 'materialName') && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-500 block mb-1">数据表列</label>
                      <SearchableSelect value={mapping.table1Col || ''} options={table1Columns}
                        onChange={val => handleUpdateMapping(mapping.id, 'table1Col', val)}
                        placeholder="— 选择数据表列 —" disabled={isExecuting} />
                    </div>
                  )}
                  {mapping.sourceType === 'constant' && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-500 block mb-1">常量值</label>
                      <input type="text" value={mapping.constantValue || ''}
                        onChange={e => handleUpdateMapping(mapping.id, 'constantValue', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
                    </div>
                  )}
                  {mapping.sourceType === 'financialSeq' && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-500 block mb-1">偏移量(默认1)</label>
                      <input type="number" value={mapping.financialSeqOffset ?? 1}
                        onChange={e => handleUpdateMapping(mapping.id, 'financialSeqOffset', parseInt(e.target.value) || 1)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 文本格式列 */}
          <div className="mb-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-gray-700">文本格式列（步骤3汇总用）:</span>
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-56">
                <SearchableSelect value={newKingdeeTextCol} options={templateColumns}
                  onChange={setNewKingdeeTextCol}
                  placeholder="— 选择列 —" disabled={isExecuting} />
              </div>
              <button onClick={handleAddTextCol} disabled={isExecuting || !newKingdeeTextCol}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">添加</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {kingdeeTextCols.map(col => (
                <span key={col} className="inline-flex items-center px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                  {col}
                  <button onClick={() => handleRemoveKingdeeTextCol(col)} disabled={isExecuting}
                    className="ml-2 text-gray-400 hover:text-gray-600">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2 — 操作按钮 */}
        <div className="flex items-center space-x-3 mb-4">
          {!step1Done && <span className="text-sm text-gray-400">（需先执行合并Excel）</span>}
          {finalResult && !step2Executing && (
            <span className="text-sm text-green-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              已生成
            </span>
          )}
          <div className="flex-1" />
          <button onClick={handleLoadRecommended} disabled={isExecuting}
            className="px-3 py-2 text-sm border border-amber-300 text-amber-600 rounded-lg hover:bg-amber-50 shadow-sm disabled:opacity-50">
            加载推荐配置
          </button>
          <button onClick={handleSaveStep2Preset} disabled={isExecuting || !project}
            className="px-3 py-2 text-sm border border-green-300 text-green-600 rounded-lg hover:bg-green-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            保存预设
          </button>
        </div>

        {/* Step 2 — 输出/进度 */}
        {(step2Executing || finalResult) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            {/* 当前阶段 */}
            {executePhase && step2Executing && (
              <div className="text-sm text-gray-700 font-medium mb-2">
                <svg className="animate-spin h-4 w-4 inline mr-2 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {executePhase}
              </div>
            )}

            {/* 日志 */}
            {mergeProgressLogs.length > 0 && step2Executing && (
              <div className="bg-gray-900 rounded p-2 max-h-36 overflow-y-auto font-mono text-xs space-y-0.5 mb-3">
                {mergeProgressLogs.map((log, i) => (
                  <div key={i} className={log.startsWith('✓') ? 'text-green-400' : 'text-gray-300'}>
                    <span className="text-gray-500">&gt;</span> {log}
                  </div>
                ))}
                <div ref={mergeLogsEndRef} />
              </div>
            )}

            {/* 最终结果 */}
            {finalResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                {finalResult.fallbackWarning && (
                  <div className="mb-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">{finalResult.fallbackWarning}</div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-green-700">
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    金蝶导入汇总表已生成
                  </span>
                  <button onClick={handleOpenFinalOutput}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">打开输出目录</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-green-600">{finalResult.totalOrders}</p>
                    <p className="text-xs text-green-600">拆分订单数</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-amber-600">{finalResult.totalRows}</p>
                    <p className="text-xs text-amber-600">汇总输出行数</p>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-green-800 mb-1">输出文件:</div>
                  <button onClick={() => window.electronAPI.shell.openPath(finalResult.outputPath)}
                    className="text-xs text-green-600 hover:text-green-800 truncate block max-w-xs">
                    {finalResult.outputPath}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

export default CombinedPage
