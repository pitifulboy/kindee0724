import React, { useState, useEffect, useRef, useMemo } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import { combinedPage as t, app as appText } from '../config/appText'

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

// billNo/detailSeq/financialSeq/materialCode/materialName 已废弃，改用 seq ID（如 seq-billNo）
type SourceType = 'table1' | 'constant' | 'date'
interface FieldMapping {
  id: string; templateCol: string; sourceType: SourceType
  table1Col?: string; constantValue?: string
  // financialSeqOffset?: number  // 已废弃，偏移量统一在序號自增配置中管理
}
type SeqType = 'constant' | 'sequential' | 'fieldBased'
interface SeqConfig {
  id: string
  name: string
  type: SeqType
  constantValue: string
  start: number
  step: number
  baseField: string
}
// KingdeeImportPreset 接口已废弃，改用 project 模式
const sourceTypeOptionsBase = [
  { value: 'table1', label: t.sourceDataTable },
  { value: 'constant', label: t.sourceConstant },
  { value: 'date', label: t.sourceDate },
]

// RECOMMENDED_CONFIG 已废弃（加载推荐按钮已隐藏），仅 handleLoadRecommended 使用
// const RECOMMENDED_CONFIG = {
//   groupByColumn: '采购单号', matchFieldTable1: '金蝶物料编码', matchFieldTable2: '*(订单明细)物料编码#编码',
//   textFormatColumns: ['*(订单明细)物料编码#编码', '*(基本信息)客户#编码', '(基本信息)收货方#编码', '(基本信息)结算方#编码', '(基本信息)付款方#编码', '*(基本信息)交货地点#编码'],
//   fieldMappings: [
//     { templateCol: '*基本信息(序号)', sourceType: 'seq-billNo' as any },
//     { templateCol: '*(基本信息)日期', sourceType: 'date' as any },
//     { templateCol: '*(基本信息)交货地点#编码', sourceType: 'table1' as any, table1Col: '*(基本信息)交货地点#编码' },
//     { templateCol: '*(基本信息)详细地址', sourceType: 'table1' as any, table1Col: '(基本信息)收货方地址' },
//     { templateCol: '(基本信息)客户单号', sourceType: 'table1' as any, table1Col: '采购单号' },
//     { templateCol: '*订单明细(序号)', sourceType: 'seq-detailSeq' as any },
//     { templateCol: '*财务信息(序号)', sourceType: 'seq-financialSeq' as any, financialSeqOffset: 1 },
//     { templateCol: '*(订单明细)物料编码#编码', sourceType: 'table1' as any, table1Col: '金蝶物料编码' },
//     { templateCol: '(订单明细)销售数量', sourceType: 'table1' as any, table1Col: '采购数量' },
//     { templateCol: '(订单明细)计价数量', sourceType: 'table1' as any, table1Col: '采购数量' },
//     { templateCol: '*(订单明细)要货日期', sourceType: 'date' as any },
//   ],
// }

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
  const [outputPrefix, setOutputPrefix] = useState(t.defaultOutputPrefix)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [groupByColumn, setGroupByColumn] = useState('')
  const [matchFieldTable1, setMatchFieldTable1] = useState('')
  const [matchFieldTable2, setMatchFieldTable2] = useState('')
  const [templateHeaderRowIndex, setTemplateHeaderRowIndex] = useState(1)
  // 数据起始行自动为表头行 + 1
  const templateDataStartRowIndex = templateHeaderRowIndex + 1
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
  const [seqConfigs, setSeqConfigs] = useState<SeqConfig[]>(() => [
    { id: 'seq-billNo', name: '单号自增', type: 'fieldBased', constantValue: '', start: 111111, step: 1, baseField: '' },
    { id: 'seq-detailSeq', name: '明细序号自增', type: 'fieldBased', constantValue: '', start: 1, step: 1, baseField: '' },
    { id: 'seq-financialSeq', name: '财务序号', type: 'sequential', constantValue: '', start: 1, step: 1, baseField: '' },
  ])
  const [kingdeeTextCols, setKingdeeTextCols] = useState<string[]>([])
  // newKingdeeTextCol 仅被隐藏的文本格式列 UI 使用，暂注释
  // const [newKingdeeTextCol, setNewKingdeeTextCol] = useState('')
  const [table1Columns, setTable1Columns] = useState<string[]>([])
  const [templateColumns, setTemplateColumns] = useState<string[]>([])

  // 动态来源选项：date + 所有 seqConfig
  const sourceTypeOptions = useMemo(() => [
    ...sourceTypeOptionsBase,
    ...seqConfigs.map(c => ({ value: c.id, label: c.name })),
  ], [seqConfigs])

  // 从 seqConfigs 中提取 billNo 相关参数（用于 step1/step2a 订单拆分）
  const billNoCfg = seqConfigs.find(c => c.id === 'seq-billNo')
  const startBillNo = billNoCfg?.start ?? 111111
  const billNoStep = billNoCfg?.step ?? 1
  const billNoBaseField = billNoCfg?.baseField ?? ''

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

  // ─── 重复字段弹框 ───
  const [duplicateDialog, setDuplicateDialog] = useState<{
    cols: { colName: string; sources: { filePath: string; fileName: string }[] }[]
  } | null>(null)

  // ─── 初始化 ───
  useEffect(() => {
    const init = async () => {
      const documents = await window.electronAPI.app.getPath('documents')
      setOutputDir(documents)
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
      setOutputPrefix(s2.outputPrefix || t.defaultOutputPrefix)
      // 优先加载 seqConfigs，若不存在则从旧参数迁移
      if (s2.seqConfigs && s2.seqConfigs.length > 0) {
        setSeqConfigs(s2.seqConfigs)
      } else {
        setSeqConfigs([
          { id: 'seq-billNo', name: s2.billNoTitle || '单号自增', type: 'fieldBased', constantValue: '', start: s2.startBillNo || 111111, step: s2.billNoStep ?? 1, baseField: s2.billNoBaseField ?? '' },
          { id: 'seq-detailSeq', name: s2.detailSeqTitle || '明细序号自增', type: 'fieldBased', constantValue: '', start: s2.detailSeqStart ?? 1, step: s2.detailSeqStep ?? 1, baseField: s2.detailSeqBaseField ?? '' },
          { id: 'seq-financialSeq', name: s2.financialSeqTitle || '财务序号', type: 'sequential', constantValue: '', start: s2.globalFinancialSeqOffset ?? 1, step: s2.financialSeqStep ?? 1, baseField: '' },
        ])
      }
      setDate(s2.date || new Date().toISOString().slice(0, 10))
      setGroupByColumn(s2.groupByColumn || '')
      setMatchFieldTable1(s2.matchFieldTable1 || '')
      setMatchFieldTable2(s2.matchFieldTable2 || '')
      setTemplateHeaderRowIndex(s2.templateHeaderRowIndex ?? 1)
      setFieldMappings((s2.fieldMappings || []).map((m: any) => {
        // 迁移旧的 sourceType 到新的 seq ID
        const oldToNew: Record<string, string> = { billNo: 'seq-billNo', detailSeq: 'seq-detailSeq', financialSeq: 'seq-financialSeq' }
        return oldToNew[m.sourceType] ? { ...m, sourceType: oldToNew[m.sourceType] } : m
      }))
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
          } else setToast({ type: 'error', msg: t.dragExcelHint })
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
            } else if (res.data.length > 0) setToast({ type: 'error', msg: t.dragFileExists })
          } else setToast({ type: 'error', msg: t.dragNoExcel })
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
        } else setToast({ type: 'error', msg: t.dragInvalid })
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
    setTable2Path(''); setOutputPrefix(t.defaultOutputPrefix)
    setSeqConfigs([
      { id: 'seq-billNo', name: '单号自增', type: 'fieldBased', constantValue: '', start: 111111, step: 1, baseField: '' },
      { id: 'seq-detailSeq', name: '明细序号自增', type: 'fieldBased', constantValue: '', start: 1, step: 1, baseField: '' },
      { id: 'seq-financialSeq', name: '财务序号', type: 'sequential', constantValue: '', start: 1, step: 1, baseField: '' },
    ]); setDate(new Date().toISOString().slice(0, 10))
    setGroupByColumn(''); setMatchFieldTable1(''); setMatchFieldTable2('')
    setTemplateHeaderRowIndex(1)
    setFieldMappings([]); setKingdeeTextCols([])
    setTable1Columns([]); setTemplateColumns([])
    setMergeResult(null); setMergeProgress(null); setMergeProgressLogs([]); setMergeError('')
    setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
  }

  /** 保存 Step1（合并Excel）预设到当前项目 */
  const handleSaveStep1Preset = async () => {
    try {
      if (!project) { setToast({ type: 'error', msg: t.noProjectSelected }); return }
      const step1Preset = {
        orderFiles, auxTables, auxFilePaths, orderColumns, auxColumnsMap
      }
      const res = await window.electronAPI.project.updateStep1(project.id, step1Preset)
      if (res.success) {
        onProjectUpdate({ ...project, step1Preset })
        onRefreshProjectList()
        setToast({ type: 'success', msg: t.presetSaved })
      } else {
        setToast({ type: 'error', msg: res.error || t.presetSaveFail })
      }
    } catch (err: any) { setToast({ type: 'error', msg: err?.message || t.presetSaveFail }) }
  }

  /** 保存 Step2（金蝶导入）预设到当前项目 */
  const handleSaveStep2Preset = async () => {
    try {
      if (!project) { setToast({ type: 'error', msg: t.noProjectSelected }); return }
      const step2Preset = {
        table2Path, outputDir, outputPrefix, seqConfigs, date,
        groupByColumn, matchFieldTable1, matchFieldTable2,
        templateHeaderRowIndex, templateDataStartRowIndex,
        fieldMappings, textFormatColumns: kingdeeTextCols
      }
      const res = await window.electronAPI.project.updateStep2(project.id, step2Preset)
      if (res.success) {
        onProjectUpdate({ ...project, step2Preset })
        onRefreshProjectList()
        setToast({ type: 'success', msg: t.presetStep2Saved })
      } else {
        setToast({ type: 'error', msg: res.error || t.presetStep2SaveFail })
      }
    } catch (err: any) { setToast({ type: 'error', msg: err?.message || t.presetStep2SaveFail }) }
  }

  // handleLoadRecommended 已废弃（UI按钮已隐藏），保留注释以供参考
  // const handleLoadRecommended = () => {
  //   setGroupByColumn(RECOMMENDED_CONFIG.groupByColumn)
  //   setMatchFieldTable1(RECOMMENDED_CONFIG.matchFieldTable1)
  //   setMatchFieldTable2(RECOMMENDED_CONFIG.matchFieldTable2)
  //   setKingdeeTextCols(RECOMMENDED_CONFIG.textFormatColumns)
  //   setFieldMappings(RECOMMENDED_CONFIG.fieldMappings.map((m, i) => ({ id: `rec-${Date.now()}-${i}`, ...m })))
  //   setToast({ type: 'success', msg: t.presetLoaded })
  // }

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
      name: t.auxTableDefaultName(prev.length + 1), fileName: '', filePath: '',
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

  const handleAddMapping = (sourceType: SourceType = 'table1') => {
    const base: Partial<FieldMapping> = {}
    if (sourceType === 'constant') base.constantValue = ''
    setFieldMappings(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateCol: '',
      sourceType,
      table1Col: sourceType === 'table1' ? '' : undefined,
      ...base
    } as FieldMapping])
  }
  const handleUpdateMapping = (id: string, field: string, value: any) =>
    setFieldMappings(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
  const handleDeleteMapping = (id: string) => setFieldMappings(prev => prev.filter(m => m.id !== id))

  // ─── 序号自增配置操作 ───
  const [draggedSeqId, setDraggedSeqId] = useState<string | null>(null)

  const handleAddSeq = () => {
    const id = `seq-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    setSeqConfigs(prev => [...prev, { id, name: '新序列', type: 'sequential', constantValue: '', start: 1, step: 1, baseField: '' }])
  }

  const handleDeleteSeq = (id: string) => {
    if (seqConfigs.length <= 1) return
    setSeqConfigs(prev => prev.filter(c => c.id !== id))
  }

  const handleReorderSeq = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setSeqConfigs(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, moved)
      return arr
    })
  }

  const handleUpdateSeq = (id: string, field: string, value: any) =>
    setSeqConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))

  // ─── 字段映射拖拽排序 ───
  const [draggedMappingId, setDraggedMappingId] = useState<string | null>(null)

  const reorderMappings = (sourceType: 'table1' | 'other', fromIndex: number, toIndex: number) => {
    setFieldMappings(prev => {
      const arr = [...prev]
      const group = arr.filter(m => sourceType === 'table1' ? m.sourceType === 'table1' : m.sourceType !== 'table1')
      if (fromIndex < 0 || fromIndex >= group.length || toIndex < 0 || toIndex >= group.length) return prev
      const [moved] = group.splice(fromIndex, 1)
      group.splice(toIndex, 0, moved)
      // 将排序后的组拼回原数组
      let groupIdx = 0
      const result = arr.map(m => {
        const isInGroup = sourceType === 'table1' ? m.sourceType === 'table1' : m.sourceType !== 'table1'
        if (isInGroup) return group[groupIdx++]
        return m
      })
      return result
    })
  }
  // ─── 文本格式列（UI已隐藏，保留函数供后续启用）───
  // const handleAddTextCol = () => {
  //   if (newKingdeeTextCol && !kingdeeTextCols.includes(newKingdeeTextCol)) {
  //     setKingdeeTextCols(prev => [...prev, newKingdeeTextCol]); setNewKingdeeTextCol('')
  //   }
  // }
  // const handleRemoveKingdeeTextCol = (col: string) => setKingdeeTextCols(prev => prev.filter(c => c !== col))

  /**
   * 合并前检测：检查所有表是否存在重复字段名（排除匹配关联字段）
   * 返回：{ colName: string; sources: { filePath: string; fileName: string }[] }[]
   */
  const checkDuplicateColumns = async () => {
    if (orderFiles.length === 0) return []
    if (auxTables.length === 0) return []

    // 构建排除字段集合（所有匹配字段）
    const excludedFields = new Set<string>()
    for (const aux of auxTables) {
      for (const pair of aux.matchPairs) {
        if (pair.orderCol) excludedFields.add(pair.orderCol)
        if (pair.auxCol) excludedFields.add(pair.auxCol)
      }
    }

    // 收集所有文件的字段信息
    const fileColMap: { filePath: string; fileName: string; columns: string[] }[] = []

    // 订单文件
    for (const ofile of orderFiles) {
      const res = await window.electronAPI.excelMerge.getColumns(ofile.path)
      if (res.success && res.data) {
        fileColMap.push({ filePath: ofile.path, fileName: ofile.name, columns: res.data })
      }
    }

    // 辅助表文件
    for (const aux of auxTables) {
      const fp = auxFilePaths[aux.id]
      if (!fp) continue
      const res = await window.electronAPI.excelMerge.getColumns(fp)
      if (res.success && res.data) {
        fileColMap.push({ filePath: fp, fileName: aux.name, columns: res.data })
      }
    }

    // 检测重复：遍历所有字段，排除关联字段
    const seen = new Map<string, { filePath: string; fileName: string }[]>()
    for (const entry of fileColMap) {
      for (const col of entry.columns) {
        if (excludedFields.has(col)) continue
        if (!seen.has(col)) seen.set(col, [])
        seen.get(col)!.push({ filePath: entry.filePath, fileName: entry.fileName })
      }
    }

    // 只保留出现超过1次的
    const result: { colName: string; sources: { filePath: string; fileName: string }[] }[] = []
    for (const [colName, sources] of seen) {
      // 去重 sources（同字段可能在同一文件重复出现）
      const unique = sources.filter((s, i, arr) => arr.findIndex(x => x.filePath === s.filePath) === i)
      if (unique.length > 1) {
        result.push({ colName, sources: unique })
      }
    }
    return result
  }

  // ═══════════════════════════════════════════════════════════
  // Step 1：合并 Excel
  // ═══════════════════════════════════════════════════════════
  const handleStep1Merge = async () => {
    if (orderFiles.length === 0) { setToast({ type: 'error', msg: t.validateNoOrderFiles }); return }
    if (auxTables.length === 0) { setToast({ type: 'error', msg: t.validateNoAuxTables }); return }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) { setToast({ type: 'error', msg: t.validateAuxNoFile(aux.name) }); return }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) { setToast({ type: 'error', msg: t.validateAuxIncomplete(aux.name) }); return }
      }
    }

    // 字段重复检测
    const duplicates = await checkDuplicateColumns()
    if (duplicates.length > 0) {
      setDuplicateDialog({ cols: duplicates })
      return
    }

    setStep1Executing(true); setMergeError(''); setMergeProgressLogs([]); setMergeResult(null)
    setStep1Done(false); setStep1MergedPath('')
    setExecutePhase(t.progressMerging)

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
          textColumns: [], auxiliaryTables: auxTables, outputFileName: t.defaultMergeOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!mergeRes.success || !mergeRes.data) { setToast({ type: 'error', msg: mergeRes.error || t.resultMergeFail }); setStep1Executing(false); return }
      const mergedPath = mergeRes.data.outputPath
      setMergeResult(mergeRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, t.resultMergeDone(mergeRes.data.totalRows)])
      setExecutePhase(t.step1DoneLabel)
      setToast({ type: 'success', msg: t.resultMergeDone(mergeRes.data.totalRows) })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultMergeError(e) })
    } finally {
      setStep1Executing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Step 2：生成导入金蝶的汇总表
  // ═══════════════════════════════════════════════════════════
  const handleStep2Import = async () => {
    if (!step1Done || !step1MergedPath) { setToast({ type: 'error', msg: t.needStep1First }); return }
    if (!table2Path) { setToast({ type: 'error', msg: t.validateNoTemplate }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: t.validateNoGroupBy }); return }
    if (!matchFieldTable1 || !matchFieldTable2) { setToast({ type: 'error', msg: t.validateNoMatchField }); return }
    if (fieldMappings.length === 0) { setToast({ type: 'error', msg: t.validateNoFieldMapping }); return }
    if (!outputDir) { setToast({ type: 'error', msg: t.validateNoOutputDir }); return }
    // 校验所有 fieldBased 类型的 seq 配置是否配置了 baseField
    for (const m of fieldMappings) {
      const cfg = seqConfigs.find(c => c.id === m.sourceType)
      if (cfg && cfg.type === 'fieldBased' && !cfg.baseField) {
        setToast({ type: 'error', msg: `序号自增"${cfg.name}"配置：请选择基于字段` }); return
      }
    }

    setStep2Executing(true); setFinalResult(null); setMergeProgressLogs([])
    setExecutePhase(t.progressGenerating)

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')

      // Phase 2: 步骤1 - 订单拆分
      setExecutePhase(t.progressStep1)
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: step1MergedPath, groupByColumn, startBillNo, billNoStep, billNoBaseField, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || t.progressStep1Fail }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep1Done()])

      // Phase 3: 步骤2a - Join
      setExecutePhase(t.progressStep2a)
      const s21 = await window.electronAPI.kingdeeImport.step2a({ table1Path: step1MergedPath, table2Path, groupByColumn, matchFieldTable1, matchFieldTable2, startBillNo, billNoStep, billNoBaseField, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s21.success) { setToast({ type: 'error', msg: s21.error || t.progressStep2aFail }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2aDone])

      // Phase 4: 步骤2b - 删除未匹配
      setExecutePhase(t.progressStep2b)
      const s21Dir = s21.data.outputPath.replace(/\\[^\\]+$/, '')
      const s22 = await window.electronAPI.kingdeeImport.step2b({ inputDir: s21Dir, outputDir: tmpDir })
      if (!s22.success) { setToast({ type: 'error', msg: s22.error || t.progressStep2bFail }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2bDone])

      // Phase 5: 步骤2c - 填充数据
      setExecutePhase(t.progressStep2c)
      const s22Dir = s22.data.outputPath.replace(/\\[^\\]+$/, '')
      const s23 = await window.electronAPI.kingdeeImport.step2c({ inputDir: s22Dir, fieldMappings, date, matchFieldTable1, matchFieldTable2, templateHeaderRowIndex, templateDataStartRowIndex, table2Path, outputDir: tmpDir, seqConfigs })
      if (!s23.success) { setToast({ type: 'error', msg: s23.error || t.progressStep2cFail }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2cDone])

      // Phase 6: 步骤2d - 恢复结构
      setExecutePhase(t.progressStep2d)
      const s23Dir = s23.data.outputPath.replace(/\\[^\\]+$/, '')
      const s24 = await window.electronAPI.kingdeeImport.step2d({ inputDir: s23Dir, table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s24.success) { setToast({ type: 'error', msg: s24.error || t.progressStep2dFail }); setStep2Executing(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2dDone])

      // Phase 7: 步骤3 - 汇总
      setExecutePhase(t.progressStep3)
      const s3 = await window.electronAPI.kingdeeImport.step3({
        table2Path,
        filledTemplateFiles: s24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })),
        templateHeaderRowIndex, templateDataStartRowIndex,
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols
      })
      if (!s3.success) { setToast({ type: 'error', msg: s3.error || t.progressStep3Fail }); setStep2Executing(false); return }

      setMergeProgressLogs(prev => [...prev, t.progressStep3Done(s3.data.outputPath)])
      setFinalResult({
        outputPath: s3.data.outputPath,
        totalOrders: s3.data.totalOrders,
        totalRows: s3.data.totalRows,
        fallbackWarning: s3.data.fallbackWarning
      })
      setExecutePhase(t.resultStep2DoneTitle)
      setToast({ type: 'success', msg: t.resultStep2DoneMsg })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultStep2Error(e) })
    } finally {
      setStep2Executing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 一键执行
  // ═══════════════════════════════════════════════════════════
  const handleRunAll = async () => {
    if (!project) { setToast({ type: 'error', msg: t.noProjectSelected }); return }
    // Step1 校验
    if (orderFiles.length === 0) { setToast({ type: 'error', msg: t.validateNoOrderFiles }); return }
    if (auxTables.length === 0) { setToast({ type: 'error', msg: t.validateNoAuxTables }); return }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) { setToast({ type: 'error', msg: t.validateAuxNoFile(aux.name) }); return }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) { setToast({ type: 'error', msg: t.validateAuxIncomplete(aux.name) }); return }
      }
    }
    // Step2 校验
    if (!table2Path) { setToast({ type: 'error', msg: t.validateNoTemplate }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: t.validateNoGroupBy }); return }
    if (!matchFieldTable1 || !matchFieldTable2) { setToast({ type: 'error', msg: t.validateNoMatchField }); return }
    if (fieldMappings.length === 0) { setToast({ type: 'error', msg: t.validateNoFieldMapping }); return }
    if (!outputDir) { setToast({ type: 'error', msg: t.validateNoOutputDir }); return }
    // 校验所有 fieldBased 类型的 seq 配置是否配置了 baseField
    for (const m of fieldMappings) {
      const cfg = seqConfigs.find(c => c.id === m.sourceType)
      if (cfg && cfg.type === 'fieldBased' && !cfg.baseField) {
        setToast({ type: 'error', msg: `序号自增"${cfg.name}"配置：请选择基于字段` }); return
      }
    }

    // 字段重复检测（与 handleStep1Merge 共享 checkDuplicateColumns）
    const duplicates = await checkDuplicateColumns()
    if (duplicates.length > 0) {
      setDuplicateDialog({ cols: duplicates })
      return
    }

    setIsRunAll(true)
    setMergeError(''); setMergeProgressLogs([]); setMergeResult(null); setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')

      // ── Step 1: 合并 Excel ──
      setStep1Executing(true)
      setExecutePhase(t.progressMerging)
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const mergeRes = await window.electronAPI.excelMerge.merge({
        orderFilePaths: orderFiles.map(f => f.path), auxFilePaths,
        config: {
          name: project.name, orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: auxTables, outputFileName: t.defaultMergeOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!mergeRes.success || !mergeRes.data) { setToast({ type: 'error', msg: mergeRes.error || t.resultMergeFail }); setStep1Executing(false); setIsRunAll(false); return }
      const mergedPath = mergeRes.data.outputPath
      setMergeResult(mergeRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, t.resultMergeDone(mergeRes.data.totalRows)])
      setStep1Executing(false)

      // ── Step 2: 生成导入金蝶汇总表 ──
      setStep2Executing(true)
      setExecutePhase(t.progressStep1)
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: mergedPath, groupByColumn, startBillNo, billNoStep, billNoBaseField, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || t.progressStep1Fail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep1Done()])

      setExecutePhase(t.progressStep2a)
      const s21 = await window.electronAPI.kingdeeImport.step2a({ table1Path: mergedPath, table2Path, groupByColumn, matchFieldTable1, matchFieldTable2, startBillNo, billNoStep, billNoBaseField, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s21.success) { setToast({ type: 'error', msg: s21.error || t.progressStep2aFail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2aDone])

      setExecutePhase(t.progressStep2b)
      const s21Dir = s21.data.outputPath.replace(/\\[^\\]+$/, '')
      const s22 = await window.electronAPI.kingdeeImport.step2b({ inputDir: s21Dir, outputDir: tmpDir })
      if (!s22.success) { setToast({ type: 'error', msg: s22.error || t.progressStep2bFail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2bDone])

      setExecutePhase(t.progressStep2c)
      const s22Dir = s22.data.outputPath.replace(/\\[^\\]+$/, '')
      const s23 = await window.electronAPI.kingdeeImport.step2c({ inputDir: s22Dir, fieldMappings, date, matchFieldTable1, matchFieldTable2, templateHeaderRowIndex, templateDataStartRowIndex, table2Path, outputDir: tmpDir, seqConfigs })
      if (!s23.success) { setToast({ type: 'error', msg: s23.error || t.progressStep2cFail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2cDone])

      setExecutePhase(t.progressStep2d)
      const s23Dir = s23.data.outputPath.replace(/\\[^\\]+$/, '')
      const s24 = await window.electronAPI.kingdeeImport.step2d({ inputDir: s23Dir, table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s24.success) { setToast({ type: 'error', msg: s24.error || t.progressStep2dFail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2dDone])

      setExecutePhase(t.progressStep3)
      const s3 = await window.electronAPI.kingdeeImport.step3({
        table2Path,
        filledTemplateFiles: s24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })),
        templateHeaderRowIndex, templateDataStartRowIndex,
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols
      })
      if (!s3.success) { setToast({ type: 'error', msg: s3.error || t.progressStep3Fail }); setStep2Executing(false); setIsRunAll(false); return }

      setMergeProgressLogs(prev => [...prev, t.progressStep3Done(s3.data.outputPath)])
      setFinalResult({
        outputPath: s3.data.outputPath,
        totalOrders: s3.data.totalOrders,
        totalRows: s3.data.totalRows,
        fallbackWarning: s3.data.fallbackWarning
      })
      setExecutePhase(t.resultAllDone)
      setToast({ type: 'success', msg: t.resultAllDoneMsg })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultExecutionError(e) })
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
        <div className={`fixed top-14 right-6 z-[100] px-5 py-3 rounded-xl shadow-lg ${
          toast.type === 'success' ? 'bg-primary-800' : 'bg-red-500'
        }`}>
          <span className="text-white text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* 重复字段弹框 */}
      {duplicateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDuplicateDialog(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 标题 */}
            <div className="flex items-center px-5 py-4 border-b border-red-100 bg-red-50">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="ml-2 text-sm font-semibold text-red-800">检测到重复字段名称</span>
            </div>
            {/* 内容 */}
            <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-4">
              <p className="text-xs text-black">以下字段（已排除关联字段）在多个表中存在，请修改后重新执行：</p>
              {duplicateDialog.cols.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center">
                    <span className="text-sm font-mono font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">{item.colName}</span>
                    <span className="ml-2 text-xs text-black">在以下文件中重复：</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {item.sources.map((src, si) => (
                      <div key={si}
                        className="flex items-center text-xs text-black hover:text-black cursor-pointer group"
                        onClick={() => window.electronAPI.shell.showItemInFolder(src.filePath)}>
                        <svg className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-black group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="truncate" title={src.filePath}>{src.fileName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* 底部按钮 */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setDuplicateDialog(null)}
                className="px-4 py-2 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          项目信息
          ══════════════════════════════════════════════════════ */}
      {project && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <div>
                <span className="text-sm font-semibold text-black">{project.name}</span>
                <span className="text-xs text-black ml-3">
                  {t.labelLastModified}{new Date(project.updatedAt).toLocaleString(appText.locale)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={handleClearAllConfig} disabled={isExecuting}
                className="px-3 py-1.5 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 disabled:cursor-not-allowed">
                {t.btnClearConfig}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          快捷操作工具栏
          ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm rounded-lg border-2 border-gray-200 p-4 shadow-md">
        <div className="flex items-center justify-end space-x-4">
          <button onClick={handleStep1Merge} disabled={step1Executing}
            className="px-5 py-2 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center">
            {step1Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {step1Executing ? t.btnStep1Merging : t.btnStep1Merge}
          </button>
          <button onClick={handleStep2Import}
            disabled={step2Executing || !step1Done}
            className="px-5 py-2 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center"
            title={!step1Done ? t.needStep1First : ''}>
            {step2Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {step2Executing ? t.btnStep2Generating : t.btnStep2Generate}
          </button>
          <button onClick={handleRunAll} disabled={isExecuting}
            className="px-5 py-2 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center">
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
            {isRunAll ? t.btnRunAllExecuting : t.btnRunAll}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          第一步：合并Excel
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
        <h2 className="text-base font-semibold text-black mb-4 flex items-center">
          <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">1</span>
          {t.step1Title}
        </h2>

        {/* 文件配置 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-black mb-4">{t.sectionFileConfig}</h3>

          {/* 订单文件 */}
          <div className="mb-4">
            <div ref={orderFileDropRef}
              className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
                orderFileDragOver ? 'border-primary-400 bg-primary-800 border-dashed' : 'border-gray-200'
              }`}>
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelOrderFiles}</label>
              <button onClick={handleSelectOrderFiles} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnSelectFile}</button>
              <span className="text-sm text-black truncate flex-1">
                {orderFiles.length > 0 ? `已选 ${orderFiles.length} 个文件` : t.placeholderDragFile}
              </span>
              {orderFiles.length > 0 && (
                <button onClick={() => { setOrderFiles([]); setOrderColumns([]) }} disabled={isExecuting}
                  className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">{t.btnClear}</button>
              )}
            </div>
            {orderFiles.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto space-y-0.5 pl-2">
                {orderFiles.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between px-1 py-0.5 hover:bg-gray-50 rounded">
                    <span className="text-xs text-black truncate flex-1">
                      <span className="text-black mr-1">{i + 1}.</span>
                      {f.name}
                    </span>
                    <button onClick={() => handleRemoveOrderFile(f.id)} disabled={isExecuting}
                      className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 辅助表 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-black">{t.sectionAuxTable}</h3>
              <button onClick={handleAddAuxTable} disabled={isExecuting} className="btn-primary text-sm">{t.btnAddAuxTable}</button>
            </div>
            {auxTables.length === 0 && <p className="text-xs text-black text-center py-3">{t.noAuxTable}</p>}
            <div className="space-y-3">
              {auxTables.map((aux, auxIndex) => {
                const auxCols = auxColumnsMap[aux.id] || []
                return (
                  <div key={aux.id} className="border-2 border-gray-200 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold">{auxIndex + 1}</span>
                        <input type="text" value={aux.name} onChange={e => updateAuxTable(aux.id, { name: e.target.value })}
                          disabled={isExecuting}
                          className="text-sm font-medium text-black bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1" />
                      </div>
                      <button onClick={() => handleRemoveAuxTable(aux.id)} disabled={isExecuting}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">{t.btnDelete}</button>
                    </div>
                    <div ref={el => { auxDropRefs.current[aux.id] = el }}
                      onMouseEnter={() => setupAuxDrop(aux.id)}
                      className={`flex items-center space-x-3 mb-2 p-2 rounded-lg border-2 transition-colors ${
                        auxDragOver[aux.id] ? 'border-primary-400 bg-primary-800 border-dashed' : 'border-gray-200'
                      }`}>
                      <label className="text-xs text-black w-12 flex-shrink-0">{t.labelFile}</label>
                      <span className="flex-1 text-sm text-black truncate">{aux.fileName || t.placeholderDragOrClick}</span>
                      <button onClick={() => handleSelectAuxFile(aux.id)} disabled={isExecuting}
                        className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnSelect}</button>
                    </div>
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-xs text-black">{t.labelJoinType}</span>
                      <select value={aux.how} onChange={e => updateAuxTable(aux.id, { how: e.target.value as 'left' | 'inner' | 'right' })}
                        disabled={isExecuting} className="px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 w-36">
                        <option value="left">{t.joinLeft}</option>
                        <option value="inner">{t.joinInner}</option>
                        <option value="right">{t.joinRight}</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-black mb-1">{t.labelMatchField}</p>
                      {aux.matchPairs.map((pair, pi) => (
                        <div key={pi} className="flex items-center space-x-2 mb-1">
                          <span className="text-xs text-black w-10">{t.labelOrder}</span>
                          <SearchableSelect value={pair.orderCol} options={orderColumns}
                            onChange={v => updateMatchPair(aux.id, pi, 'orderCol', v)}
                            placeholder={t.placeholderSelectCol} disabled={isExecuting} />
                          <span className="text-black text-xs">↔</span>
                          <span className="text-xs text-black w-10">{t.labelAux}</span>
                          <SearchableSelect value={pair.auxCol} options={auxCols}
                            onChange={v => updateMatchPair(aux.id, pi, 'auxCol', v)}
                            placeholder={t.placeholderSelectCol} disabled={isExecuting} />
                          {aux.matchPairs.length > 1 && (
                            <button onClick={() => handleRemoveMatchPair(aux.id, pi)} disabled={isExecuting}
                              className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">✕</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => handleAddMatchPair(aux.id)} disabled={isExecuting}
                        className="text-xs text-black hover:text-black mt-1">{t.btnAddMatchField}</button>
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
            <span className="text-sm text-black flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.step1DoneLabel}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={handleSaveStep1Preset} disabled={isExecuting || !project}
            className="px-3 py-2 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {t.btnSavePreset}
          </button>
        </div>

        {/* Step 1 — 输出/进度 */}
        {(step1Executing || mergeProgressLogs.length > 0 || mergeResult || mergeError) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            {/* 当前阶段 */}
            {executePhase && (
              <div className="text-sm text-black font-medium mb-2">
                {step1Executing && (
                  <svg className="animate-spin h-4 w-4 inline mr-2 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                <div className="flex justify-between text-xs text-black mb-1">
                  <span>{mergeProgress.step || ''}</span>
                  <span className="font-medium text-black">{mergeProgress.overallProgress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                  <div className="bg-primary-800 h-2 rounded-full transition-all duration-300" style={{ width: `${mergeProgress?.overallProgress || 0}%` }} />
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
              <div className="bg-primary-800 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t.step1DoneLabel}
                  </span>
                  <button onClick={() => window.electronAPI.shell.openPath(mergeResult.outputPath)}
                    className="px-3 py-1 text-xs bg-primary-700 text-white rounded hover:bg-primary-600">{t.btnOpenOutput}</button>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{mergeResult.totalRows}</p>
                    <p className="text-xs text-black">{t.statTotalRows}</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{mergeResult.totalColumns}</p>
                    <p className="text-xs text-black">{t.statTotalCols}</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{mergeResult.matchedCount}</p>
                    <p className="text-xs text-black">{t.statMatchedRows}</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{mergeResult.unmatchedCount}</p>
                    <p className="text-xs text-black">{t.statUnmatchedRows}</p>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white mb-1">{t.statOutputFile}</div>
                  <button onClick={() => window.electronAPI.shell.openPath(mergeResult.outputPath)}
                    className="text-xs text-white hover:text-white truncate block max-w-xs">
                    {mergeResult.outputPath}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          第二步：生成导入金蝶的汇总表
          ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
        <h2 className="text-base font-semibold text-black mb-4 flex items-center">
          <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
          {t.step2Title}
        </h2>

        {/* 模板表 & 输出配置 */}
        <div className="bg-white rounded-lg border-2 border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-black mb-4">{t.sectionOutputConfig}</h3>
          <div className="space-y-3">
            <div ref={table2DropRef}
              className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
                table2DragOver ? 'border-primary-400 bg-primary-800 border-dashed' : 'border-gray-200'
              }`}>
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelTemplateTable}</label>
              <button onClick={handleSelectTable2} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnSelectFile}</button>
              <span className="text-sm text-black truncate flex-1">{table2Path || t.placeholderDragOrClick}</span>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelOutputDir}</label>
              <input type="text" value={outputDir} onClick={handleSelectOutputDir} readOnly
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50 cursor-pointer"
                placeholder={t.placeholderSelectDir} />
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelOutputPrefix}</label>
              <input type="text" value={outputPrefix} onChange={e => setOutputPrefix(e.target.value)}
                disabled={isExecuting}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
            </div>
          </div>
        </div>

        {/* 客户订单拆分字段配置 */}
        <div className="bg-white rounded-lg border-2 border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-black mb-3">{t.sectionSplitConfig}</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <label className="text-sm text-black w-28 flex-shrink-0">{t.labelGroupByColumn}</label>
              <div className="flex-1">
                <SearchableSelect value={groupByColumn} options={orderColumns} onChange={setGroupByColumn}
                  placeholder={t.placeholderSelectCol} disabled={isExecuting} />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-black w-28 flex-shrink-0">{t.labelMatchFieldTable}</label>
              <div className="flex-1">
                <SearchableSelect value={matchFieldTable1} options={table1Columns} onChange={setMatchFieldTable1}
                  placeholder={t.selectPlaceholder} disabled={isExecuting} />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-black w-28 flex-shrink-0">{t.labelMatchFieldTemplate}</label>
              <div className="flex-1">
                <SearchableSelect value={matchFieldTable2} options={templateColumns} onChange={setMatchFieldTable2}
                  placeholder={t.selectPlaceholder} disabled={isExecuting} />
              </div>
            </div>
          </div>
        </div>

        {/* 表格字段配置 */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-black mb-4">{t.sectionFieldConfig}</h3>

          <div className="space-y-3 mb-4">
            <div className="flex items-center space-x-3">
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelTemplateHeaderRow}</label>
              <input type="number" value={templateHeaderRowIndex}
                onChange={e => handleHeaderRowChange(parseInt(e.target.value) || 0)}
                disabled={isExecuting}
                className="max-w-64 flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm text-black w-32 flex-shrink-0">{t.labelDate}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                disabled={isExecuting}
                className="max-w-64 flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
            </div>
          </div>

          {/* 序号自增配置 */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-black uppercase tracking-wider">{t.sectionAutoInc}</p>
              <button onClick={handleAddSeq} disabled={isExecuting}
                className="px-2 py-1 text-xs bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnAdd}</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
              {seqConfigs.map((cfg, idx) => (
                <div key={cfg.id}
                  draggable={!isExecuting}
                  onDragStart={() => setDraggedSeqId(cfg.id)}
                  onDragOver={e => { e.preventDefault(); if (draggedSeqId && draggedSeqId !== cfg.id) { const from = seqConfigs.findIndex(c => c.id === draggedSeqId); if (from >= 0) handleReorderSeq(from, idx); setDraggedSeqId(cfg.id) } }}
                  onDragEnd={() => setDraggedSeqId(null)}
                  className={`flex-shrink-0 bg-white rounded-lg border p-3 transition-all duration-150 ${draggedSeqId === cfg.id ? 'border-primary-600 shadow-lg ring-2 ring-primary-300 opacity-80 scale-[1.02]' : 'border-gray-200 hover:border-primary-200'}`}
                  style={{ minWidth: 260, maxWidth: 280, scrollSnapAlign: 'start' }}>
                  <div className="flex items-center justify-between mb-2">
                    <input type="text" value={cfg.name} onChange={e => handleUpdateSeq(cfg.id, 'name', e.target.value)}
                      disabled={isExecuting}
                      className="flex-1 text-xs font-semibold text-primary-700 bg-transparent border-b border-dashed border-blue-200 focus:outline-none focus:border-primary-500 disabled:cursor-not-allowed mr-2" />
                    <button onClick={() => handleDeleteSeq(cfg.id)} disabled={isExecuting || seqConfigs.length <= 1}
                      className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed flex-shrink-0">✕</button>
                  </div>
                  <select value={cfg.type} onChange={e => handleUpdateSeq(cfg.id, 'type', e.target.value)}
                    disabled={isExecuting}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50 mb-2">
                    <option value="constant">{t.sourceConstant}</option>
                    <option value="sequential">{t.autoIncRuleStep}</option>
                    <option value="fieldBased">{t.labelBaseField}</option>
                  </select>
                  {cfg.type === 'constant' && (
                    <input type="text" value={cfg.constantValue} onChange={e => handleUpdateSeq(cfg.id, 'constantValue', e.target.value)}
                      disabled={isExecuting} placeholder={t.placeholderConstant}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
                  )}
                  {cfg.type === 'sequential' && (
                    <>
                      <label className="text-xs text-black block mb-1">{t.labelBillNoStart}</label>
                      <input type="number" value={cfg.start} onChange={e => handleUpdateSeq(cfg.id, 'start', parseInt(e.target.value) || 0)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50 mb-2" />
                      <label className="text-xs text-black block mb-1">{t.labelBillNoStep}</label>
                      <input type="number" min="1" value={cfg.step} onChange={e => handleUpdateSeq(cfg.id, 'step', Math.max(1, parseInt(e.target.value) || 1))}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
                    </>
                  )}
                  {cfg.type === 'fieldBased' && (
                    <>
                      <label className="text-xs text-black block mb-1">{t.labelBaseField}</label>
                      <select value={cfg.baseField} onChange={e => handleUpdateSeq(cfg.id, 'baseField', e.target.value)}
                        disabled={isExecuting || orderColumns.length === 0}
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50 mb-2">
                        <option value="">{t.placeholderSelectCol}</option>
                        {orderColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                      <label className="text-xs text-black block mb-1">{t.labelBillNoStart}</label>
                      <input type="number" value={cfg.start} onChange={e => handleUpdateSeq(cfg.id, 'start', parseInt(e.target.value) || 0)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50 mb-2" />
                      <label className="text-xs text-black block mb-1">{t.labelBillNoStep}</label>
                      <input type="number" min="1" value={cfg.step} onChange={e => handleUpdateSeq(cfg.id, 'step', Math.max(1, parseInt(e.target.value) || 1))}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 字段映射 — 数据表取值 */}
          <div className="mb-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-primary-700">{t.sectionFieldMappingData}</span>
              <button onClick={() => handleAddMapping('table1')} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnAddMappingData}</button>
            </div>
            <div className="space-y-2">
              {fieldMappings.filter(m => m.sourceType === 'table1').map((mapping, idx, arr) => (
                <div key={mapping.id}
                  draggable={!isExecuting}
                  onDragStart={() => setDraggedMappingId(mapping.id)}
                  onDragOver={e => { e.preventDefault(); setDraggedMappingId(prev => prev || mapping.id) }}
                  onDrop={e => { e.preventDefault(); if (draggedMappingId && draggedMappingId !== mapping.id) { const fromIdx = arr.findIndex(m => m.id === draggedMappingId); if (fromIdx >= 0) reorderMappings('table1', fromIdx, idx) }; setDraggedMappingId(null) }}
                  onDragEnd={() => setDraggedMappingId(null)}
                  className={`border-2 rounded p-3 bg-white cursor-default transition-all duration-150 ${draggedMappingId === mapping.id ? 'border-primary-600 shadow-lg ring-2 ring-primary-300 opacity-80 scale-[1.02]' : 'border border-gray-200 hover:border-primary-200'}`}>
                  <div className="flex items-start space-x-3">
                    <div className="flex items-center self-start pt-2 text-black cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM8 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM8 22a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-black block mb-1">{t.labelTemplateCol}</label>
                      <SearchableSelect value={mapping.templateCol} options={templateColumns}
                        onChange={val => handleUpdateMapping(mapping.id, 'templateCol', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-black block mb-1">{t.labelDataTableCol}</label>
                      <SearchableSelect value={mapping.table1Col || ''} options={table1Columns}
                        onChange={val => handleUpdateMapping(mapping.id, 'table1Col', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} />
                    </div>
                    <div className="w-24 flex-shrink-0 pt-5">
                      <button onClick={() => handleDeleteMapping(mapping.id)} disabled={isExecuting}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed">{t.btnDelete}</button>
                    </div>
                  </div>
                </div>
              ))}
              {fieldMappings.filter(m => m.sourceType === 'table1').length === 0 && (
                <p className="text-xs text-black text-center py-3">{t.noMappingsData}</p>
              )}
            </div>
          </div>

          {/* 字段映射 — 非数据表取值 */}
          <div className="mb-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-primary-700">{t.sectionFieldMappingOther}</span>
              <button onClick={() => handleAddMapping('constant')} disabled={isExecuting}
                className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed">{t.btnAddMappingOther}</button>
            </div>
            <div className="space-y-2">
              {fieldMappings.filter(m => m.sourceType !== 'table1').map((mapping, idx, arr) => (
                <div key={mapping.id}
                  draggable={!isExecuting}
                  onDragStart={() => setDraggedMappingId(mapping.id)}
                  onDragOver={e => { e.preventDefault(); setDraggedMappingId(prev => prev || mapping.id) }}
                  onDrop={e => { e.preventDefault(); if (draggedMappingId && draggedMappingId !== mapping.id) { const fromIdx = arr.findIndex(m => m.id === draggedMappingId); if (fromIdx >= 0) reorderMappings('other', fromIdx, idx) }; setDraggedMappingId(null) }}
                  onDragEnd={() => setDraggedMappingId(null)}
                  className={`border-2 rounded p-3 bg-white cursor-default transition-all duration-150 ${draggedMappingId === mapping.id ? 'border-primary-600 shadow-lg ring-2 ring-primary-300 opacity-80 scale-[1.02]' : 'border border-gray-200 hover:border-primary-200'}`}>
                  <div className="flex items-start space-x-3">
                    <div className="flex items-center self-start pt-2 text-black cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM8 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM8 22a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-black block mb-1">{t.labelTemplateCol}</label>
                      <SearchableSelect value={mapping.templateCol} options={templateColumns}
                        onChange={val => handleUpdateMapping(mapping.id, 'templateCol', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-black block mb-1">{t.labelSourceType}</label>
                      <select value={mapping.sourceType} onChange={e => handleUpdateMapping(mapping.id, 'sourceType', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50">
                        {sourceTypeOptions.filter(o => o.value !== 'table1').map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                      </select>
                    </div>
                    <div className="w-24 flex-shrink-0 pt-5">
                      <button onClick={() => handleDeleteMapping(mapping.id)} disabled={isExecuting}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed">{t.btnDelete}</button>
                    </div>
                  </div>
                  {mapping.sourceType === 'constant' && (
                    <div className="mt-3">
                      <label className="text-xs text-black block mb-1">{t.labelConstantValue}</label>
                      <input type="text" value={mapping.constantValue || ''}
                        onChange={e => handleUpdateMapping(mapping.id, 'constantValue', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary-400 disabled:bg-gray-50" />
                    </div>
                  )}
                </div>
              ))}
              {fieldMappings.filter(m => m.sourceType !== 'table1').length === 0 && (
                <p className="text-xs text-black text-center py-3">{t.noMappingsOther}</p>
              )}
            </div>
          </div>

          {/* 文本格式列（暂隐藏） */}
          {/* <div className="mb-4">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-black">{t.sectionTextFormat}</span>
            </div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-56">
                <SearchableSelect value={newKingdeeTextCol} options={templateColumns}
                  onChange={setNewKingdeeTextCol}
                  placeholder={t.selectPlaceholder} disabled={isExecuting} />
              </div>
              <button onClick={handleAddTextCol} disabled={isExecuting || !newKingdeeTextCol}
                className="px-3 py-1.5 text-sm bg-primary-50 text-black rounded hover:bg-primary-100 disabled:cursor-not-allowed">{t.btnAdd}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {kingdeeTextCols.map(col => (
                <span key={col} className="inline-flex items-center px-2.5 py-1 text-xs bg-gray-100 text-black rounded">
                  {col}
                  <button onClick={() => handleRemoveKingdeeTextCol(col)} disabled={isExecuting}
                    className="ml-2 text-black hover:text-black">×</button>
                </span>
              ))}
            </div>
          </div> */}
        </div>

        {/* Step 2 — 操作按钮 */}
        <div className="flex items-center space-x-3 mb-4">
          {!step1Done && <span className="text-sm text-black">{t.needStep1First}</span>}
          {finalResult && !step2Executing && (
            <span className="text-sm text-black flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.step2DoneLabel}
            </span>
          )}
          <div className="flex-1" />
          {/* 隐藏：加载推荐预设
          <button onClick={handleLoadRecommended} disabled={isExecuting}
            className="px-3 py-2 text-sm bg-primary-50 text-black rounded-lg hover:bg-primary-100 shadow-sm disabled:cursor-not-allowed">
            {t.btnLoadPreset}
          </button>
          */}
          <button onClick={handleSaveStep2Preset} disabled={isExecuting || !project}
            className="px-3 py-2 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {t.btnSavePreset}
          </button>
        </div>

        {/* Step 2 — 输出/进度 */}
        {(step2Executing || finalResult) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            {/* 当前阶段 */}
            {executePhase && step2Executing && (
              <div className="text-sm text-black font-medium mb-2">
                <svg className="animate-spin h-4 w-4 inline mr-2 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
              <div className="bg-primary-800 border border-blue-200 rounded-lg p-4">
                {finalResult.fallbackWarning && (
                  <div className="mb-2 text-xs text-black bg-amber-50 px-2 py-1 rounded">{finalResult.fallbackWarning}</div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t.resultStep2DoneOutput}
                  </span>
                  <button onClick={handleOpenFinalOutput}
                    className="px-3 py-1 text-xs bg-primary-700 text-white rounded hover:bg-primary-600">{t.btnOpenOutput}</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{finalResult.totalOrders}</p>
                    <p className="text-xs text-black">{t.statSplitOrders}</p>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <p className="text-lg font-bold text-black">{finalResult.totalRows}</p>
                    <p className="text-xs text-black">{t.statOutputRows}</p>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white mb-1">{t.statOutputFile}</div>
                  <button onClick={() => window.electronAPI.shell.openPath(finalResult.outputPath)}
                    className="text-xs text-white hover:text-white truncate block max-w-xs">
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
