import React, { useState, useEffect, useRef, useMemo } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import FolderMergeView from '../components/visualization/FolderMergeView'
import LeftJoinModelView from '../components/visualization/LeftJoinModelView'
import SplitSketchView from '../components/visualization/SplitSketchView'
import MergeSketchView from '../components/visualization/MergeSketchView'
import Toast from '../components/Toast'
import NativeDropZone from '../components/NativeDropZone'
import MergeCheckDialog, { type MergeCheckIssue } from '../components/combined/MergeCheckDialog'
import HelpTip from '../components/combined/HelpTip'
import SeqRuleDialog from '../components/combined/SeqRuleDialog'
import StepIndicator, { type FlowStep } from '../components/combined/StepIndicator'
import { newId } from '../utils/id'
import { combinedPage as t } from '../config/appText'

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
/** 第 6 步可选的数据转换规则（与主进程 kingdeeImport/transform.ts 保持一致） */
type TransformOp = 'textToNumber' | 'numberToText' | 'replace' | 'formula'
interface TransformRule {
  id: string
  targetColumn: string
  op: TransformOp
  find?: string
  replaceWith?: string
  useRegex?: boolean
  expr?: string
}
// KingdeeImportPreset 接口已废弃，改用 project 模式
const sourceTypeOptionsBase = [
  { value: 'table1', label: t.sourceDataTable },
  { value: 'constant', label: t.sourceConstant },
  { value: 'date', label: t.sourceDate },
]

// RECOMMENDED_CONFIG 与 handleLoadRecommended 已废弃（加载推荐按钮已隐藏），已删除。

/** 可读取的表格文件扩展名（与主进程 file:listExcelFiles 保持一致） */
const TABLE_FILE_EXTS = ['xlsx', 'xls', 'csv']

/** 六个环节的标题（顶部步骤条与建模视图共用同一份文案） */
const STEP_TITLES = [t.stepS1Title, t.stepS2Title, t.stepS3Title, t.stepS4Title, t.stepS5Title, t.stepS6Title]

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
  /** 分步操作 / 建模视图（状态在 App 层，切换按钮在顶部标题栏右侧） */
  viewMode: 'step' | 'model'
  onViewModeChange: (mode: 'step' | 'model') => void
}

const CombinedPage: React.FC<CombinedPageProps> = ({ project, onProjectUpdate, onRefreshProjectList, viewMode, onViewModeChange }) => {

  // ─── Excel合并 ───
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([])
  const [auxTables, setAuxTables] = useState<AuxTableConfig[]>([])
  const [auxFilePaths, setAuxFilePaths] = useState<Record<string, string>>({})
  const [orderColumns, setOrderColumns] = useState<string[]>([])
  const [auxColumnsMap, setAuxColumnsMap] = useState<Record<string, string[]>>({})
  const [mergeProgress, setMergeProgress] = useState<ExcelMergeProgress | null>(null)
  const [mergeProgressLogs, setMergeProgressLogs] = useState<string[]>([])
  const [mergeResult, setMergeResult] = useState<ExcelMergeResult | null>(null)
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
  // 第 6 步可选的数据转换规则（对汇总表数据行生效，表头不动）
  const [transformRules, setTransformRules] = useState<TransformRule[]>([])
  const [showTransforms, setShowTransforms] = useState(false)
  const [table1Columns, setTable1Columns] = useState<string[]>([])
  const [templateColumns, setTemplateColumns] = useState<string[]>([])
  // 字段映射可视化（第 5 步）各卡片表头的「连接方式」，与第 2 步同款下拉，仅作展示口径
  const [mappingJoinTypes, setMappingJoinTypes] = useState<Record<string, 'left' | 'inner' | 'right'>>({})

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
  // 第 1 步「合并原表」产物（中间产物，供第 2 步合并辅助表使用）
  const [step1RawDone, setStep1RawDone] = useState(false)
  const [rawMergedPath, setRawMergedPath] = useState('')
  // 第 2 步「合并辅助表」执行状态与最终产物（下游第 3~6 步的输入）
  const [auxJoinExecuting, setAuxJoinExecuting] = useState(false)
  const [step1Done, setStep1Done] = useState(false)
  const [step1MergedPath, setStep1MergedPath] = useState('')
  const [executePhase, setExecutePhase] = useState('')
  const [finalResult, setFinalResult] = useState<{
    outputPath: string
    totalOrders: number
    totalRows: number
    fallbackWarning?: string
    transformWarning?: string
  } | null>(null)
  const [isRunAll, setIsRunAll] = useState(false)

  // ─── 分步执行（S3~S6）：仅新增渲染层中间产物状态，后端调用与参数完全不变 ───
  const [s3Executing, setS3Executing] = useState(false)
  const [s4Executing, setS4Executing] = useState(false)
  const [s5Executing, setS5Executing] = useState(false)
  const [s6Executing, setS6Executing] = useState(false)
  const [s3Result, setS3Result] = useState<{ outputPath: string } | null>(null)
  const [s4Dir, setS4Dir] = useState('')            // S4 产物目录（step2b 输出），作为 S5 的输入
  const [s5FilledFiles, setS5FilledFiles] = useState<{ filePath: string }[]>([]) // S5 产物（step2d 填充文件）
  const isExecuting = step1Executing || step2Executing || auxJoinExecuting || s3Executing || s4Executing || s5Executing || s6Executing

  // ─── 顶部步骤条状态（让用户看清「共几步 / 在第几步」）───
  const stepDoneFlags = useMemo<Record<number, boolean>>(() => ({
    1: step1RawDone,
    2: step1Done,
    3: !!s3Result,
    4: !!s4Dir || s5FilledFiles.length > 0 || !!finalResult,
    5: s5FilledFiles.length > 0 || !!finalResult,
    6: !!finalResult,
  }), [step1RawDone, step1Done, s3Result, s4Dir, s5FilledFiles.length, finalResult])

  const flowSteps = useMemo<FlowStep[]>(() => {
    const titles = STEP_TITLES
    const firstTodo = titles.findIndex((_, i) => !stepDoneFlags[i + 1]) + 1
    return titles.map((title, i) => {
      const n = i + 1
      const status = stepDoneFlags[n] ? 'done' : n === firstTodo ? 'active' : 'todo'
      return { title, status }
    })
  }, [stepDoneFlags])

  // 拖拽落区由 NativeDropZone / useNativeDropZone 统一接管（见下方 handlers）

  // ─── Toast ───
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // ─── 合并前检测弹框（工作表名不一致 / 各文件字段不一致；只提示，可选继续）───
  const [mergeCheck, setMergeCheck] = useState<{
    issues: MergeCheckIssue[]
    onContinue: () => void
  } | null>(null)
  /** 用户在检测弹框里点了「仍然继续合并」→ 放行一次，不再重复弹框 */
  const mergeCheckPassedRef = useRef(false)
  /** 辅助表重名列检测的放行标记（与订单文件检测互相独立） */
  const auxCheckPassedRef = useRef(false)

  // ─── 视图模式：分步操作 / 建模视图（一页展示全部步骤图形；记忆到本地）───
  const [activeStep, setActiveStep] = useState(1)

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
      setTransformRules(Array.isArray(s2.transforms) ? s2.transforms : [])
      // 读取模板表列名
      if (s2.table2Path) {
        window.electronAPI.kingdeeImport.getTemplateColumns(s2.table2Path, s2.templateHeaderRowIndex ?? 1)
          .then(r => { if (r.success && r.data) setTemplateColumns(r.data) })
          .catch(() => {})
      }
    }

    // 仅在切换到不同项目（或首次加载）时重置执行状态
    if (isFirstLoad || isSwitched) {
      setMergeResult(null); setMergeProgressLogs([])
      setFinalResult(null); setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
      setStep1RawDone(false); setRawMergedPath('')
    }

    prevProjectIdRef.current = currentId
  }, [project])

  useEffect(() => {
    if (mergeLogsEndRef.current) mergeLogsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [mergeProgressLogs])

  // ─── 拖拽落区 handlers ───
  // 由 NativeDropZone 统一绑定；回调经 ref 保持最新，不存在闭包过期 / 监听器叠加问题。
  /** 订单文件 / 文件夹拖入 */
  const handleOrderFilesDrop = async (files: File[]) => {
    const fp = (files[0] as any)?.path
    if (!fp) return
    const res = await window.electronAPI.file.listExcelFiles(fp)
    if (res.success && res.data && res.data.length > 0) {
      const existingPaths = new Set(orderFiles.map(f => f.path))
      const newFiles = res.data
        .filter(f => !existingPaths.has(f.path))
        .map(f => ({ id: newId(), path: f.path, name: f.name }))
      if (newFiles.length > 0) {
        setOrderFiles(prev => [...prev, ...newFiles])
        if (orderColumns.length === 0) {
          const colRes = await window.electronAPI.excelMerge.getColumns(newFiles[0].path)
          if (colRes.success && colRes.data) setOrderColumns(colRes.data)
        }
      } else if (res.data.length > 0) setToast({ type: 'error', msg: t.dragFileExists })
    } else setToast({ type: 'error', msg: t.dragNoExcel })
  }

  /** 模板表拖入（支持 .xlsx / .xls / .csv） */
  const handleTable2Drop = async (files: File[]) => {
    const fp = (files[0] as any)?.path
    if (fp && /\.(xlsx|xls|csv)$/i.test(fp)) {
      setTable2Path(fp)
      const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
      if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
    } else setToast({ type: 'error', msg: t.dragInvalid })
  }

  /** 辅助表文件拖入 */
  const handleAuxFileDrop = async (auxId: string, files: File[]) => {
    const fp = (files[0] as any)?.path
    if (!fp) return
    const res = await window.electronAPI.file.listExcelFiles(fp)
    if (res.success && res.data && res.data.length > 0) {
      const f = res.data[0]
      setAuxTables(prev => prev.map(aux =>
        aux.id === auxId ? { ...aux, fileName: f.name, filePath: f.path, name: f.name.replace(/\.(xlsx?|csv)$/i, '') } : aux
      ))
      setAuxFilePaths(prev => ({ ...prev, [auxId]: f.path }))
      const colRes = await window.electronAPI.excelMerge.getColumns(f.path)
      if (colRes.success && colRes.data) setAuxColumnsMap(prev => ({ ...prev, [auxId]: colRes.data! }))
    } else setToast({ type: 'error', msg: t.dragExcelHint })
  }

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
    setMergeResult(null); setMergeProgress(null); setMergeProgressLogs([])
    setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
    setStep1RawDone(false); setRawMergedPath('')
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
        fieldMappings, textFormatColumns: kingdeeTextCols, transforms: transformRules
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

  /** 保存到项目：一次保存第 1·2 步预设 + 金蝶导入预设（顶栏统一入口） */
  const handleSavePreset = async () => {
    if (!project) { setToast({ type: 'error', msg: t.noProjectSelected }); return }
    await handleSaveStep1Preset()
    await handleSaveStep2Preset()
  }

  // handleLoadRecommended 与文本格式列相关函数已随废弃 UI 一并删除（原注释块）。

  // ═══════════════════════════════════════════════════════════
  // 订单文件 & 辅助表操作
  // ═══════════════════════════════════════════════════════════
  const handleSelectOrderFiles = async () => {
    const result = await window.electronAPI.dialog.openFiles({
      filters: [{ name: '表格文件', extensions: TABLE_FILE_EXTS }], multiSelections: true
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const newFiles = result.filePaths.map(fp => ({
        id: newId(),
        path: fp, name: fp.split(/[/\\]/).pop() || fp
      }))
      setOrderFiles(prev => [...prev, ...newFiles])
      if (orderColumns.length === 0) {
        const res = await window.electronAPI.excelMerge.getColumns(result.filePaths[0])
        if (res.success && res.data) setOrderColumns(res.data)
      }
    }
  }

  const handleAddAuxTable = () => {
    setAuxTables(prev => [...prev, {
      id: newId('aux'),
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
      filters: [{ name: '表格文件', extensions: TABLE_FILE_EXTS }], multiSelections: false
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const fp = result.filePaths[0]; const fileName = fp.split(/[/\\]/).pop() || fp
      setAuxTables(prev => prev.map(t =>
        t.id === auxId ? { ...t, fileName, filePath: fp, name: fileName.replace(/\.(xlsx?|csv)$/i, '') } : t
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
  // 拖拽连线新建关联（可视化界面2）
  const handleConnect = (auxId: string, orderCol: string, auxCol: string) =>
    setAuxTables(prev => prev.map(t => {
      if (t.id !== auxId) return t
      if (t.matchPairs.some(p => p.orderCol === orderCol && p.auxCol === auxCol)) return t
      const kept = t.matchPairs.filter(p => p.orderCol || p.auxCol)
      return { ...t, matchPairs: [...kept, { orderCol, auxCol }] }
    }))
  // 删除一条关联（可视化界面2 双击面板）
  const removeMatchPair = (auxId: string, pi: number) =>
    setAuxTables(prev => prev.map(t => t.id === auxId ? { ...t, matchPairs: t.matchPairs.filter((_, i) => i !== pi) } : t))
  // 修改连接方式（可视化界面2 表头下拉）
  const changeJoinType = (auxId: string, how: 'left' | 'inner' | 'right') =>
    updateAuxTable(auxId, { how })

  // ─── 界面4：第二步「模板匹配」——复用 LeftJoinModelView（模板表作左表，拆分明细表作右表）───
  const templateMatchAuxTables = useMemo(() => [{
    id: 'tmpl-detail',
    name: '拆分明细表',
    fileName: '',
    matchPairs: (matchFieldTable1 || matchFieldTable2)
      ? [{ orderCol: matchFieldTable2, auxCol: matchFieldTable1 }]
      : [],
    how: 'left' as const,
  }], [matchFieldTable1, matchFieldTable2])
  const templateMatchAuxColumnsMap = useMemo(() => ({
    'tmpl-detail': table1Columns.length > 0 ? table1Columns : orderColumns,
  }), [table1Columns, orderColumns])
  // 改/建关联 → 写回 matchFieldTable2（模板侧键）与 matchFieldTable1（明细侧键）
  const updateTemplateMatchPair = (_auxId: string, _pi: number, field: 'orderCol' | 'auxCol', value: string) => {
    if (field === 'orderCol') setMatchFieldTable2(value)
    else setMatchFieldTable1(value)
  }
  const connectTemplateMatch = (_auxId: string, orderCol: string, auxCol: string) => {
    setMatchFieldTable2(orderCol)
    setMatchFieldTable1(auxCol)
  }

  // ─── 字段映射（数据表取值）→ 复用 LeftJoinModelView（模板表 ←→ 数据表，字段级匹配）───
  const mappingPairs = useMemo(
    () => fieldMappings.filter(m => m.sourceType === 'table1' && (m.templateCol || m.table1Col)),
    [fieldMappings],
  )
  // 字段映射可视化 —— 按「运行口径」展示：
  // 辅助表在 S1/S2 合并阶段已被 LEFT JOIN 平铺进合并表，运行时模板表只从这张合并表取值，
  // 因此右侧只区分「合并表列」与「自定义字段」两类，不再按来源辅助表拆分。
  const mappingModel = useMemo(() => {
    const dataCols = table1Columns.length > 0 ? table1Columns : orderColumns
    const cards: {
      id: string; name: string; fileName: string; cols: string[]
      matchPairs: { orderCol: string; auxCol: string }[]; pairIds: string[]
    }[] = []
    // 合并表列：运行时唯一数据源（辅助表列已并入其中）。
    // 兜底：合并表字段尚未读取（未执行 S1·S2）时，把已配置的 table1Col 也并入列，
    //       保证已配映射不会因字段列表为空而丢线。
    const mappedTable1Cols = mappingPairs.map(m => m.table1Col || '').filter(Boolean)
    const mergedCols = Array.from(new Set([...dataCols, ...mappedTable1Cols]))
    if (mergedCols.length > 0 || mappingPairs.length > 0) {
      cards.push({
        id: 'map-table1', name: t.mappingTable1CardName, fileName: '',
        cols: mergedCols,
        matchPairs: mappingPairs.map(m => ({ orderCol: m.templateCol, auxCol: m.table1Col || '' })),
        pairIds: mappingPairs.map(m => m.id),
      })
    }
    // 自定义字段：常量 / 日期 / 自定义填充规则（即「非数据表取值」的来源）。
    // 身份用 sourceType(value) 唯一，展示用 label；label 重名时追加序号避免撞键。
    const customOptions = sourceTypeOptions.filter(o => o.value !== 'table1')
    const customMappings = fieldMappings.filter(m => m.sourceType !== 'table1' && m.templateCol)
    const customDisplayToValue: Record<string, string> = {}
    if (customOptions.length > 0 || customMappings.length > 0) {
      const valueToDisplay: Record<string, string> = {}
      const seen: Record<string, number> = {}
      const cols = customOptions.map(o => {
        seen[o.label] = (seen[o.label] || 0) + 1
        const disp = seen[o.label] > 1 ? `${o.label}（${seen[o.label]}）` : o.label
        customDisplayToValue[disp] = o.value
        valueToDisplay[o.value] = disp
        return disp
      })
      // 旧预设中已废弃的来源类型（如 materialCode / materialName）也纳入，避免丢线
      const known = new Set(customOptions.map(o => o.value))
      Array.from(new Set(customMappings.map(m => m.sourceType).filter(s => !known.has(s))))
        .forEach(s => { customDisplayToValue[s] = s; cols.push(s) })
      cards.push({
        id: 'map-custom', name: t.mappingCustomCardName, fileName: '',
        cols,
        matchPairs: customMappings.map(m => ({
          orderCol: m.templateCol,
          auxCol: valueToDisplay[m.sourceType] ?? m.sourceType,
        })),
        pairIds: customMappings.map(m => m.id),
      })
    }
    return { cards, customDisplayToValue }
  }, [table1Columns, orderColumns, mappingPairs, sourceTypeOptions, fieldMappings])
  // 未配置完整的映射数（数据表取值缺模板列/数据表列；自定义取值缺模板列），用于可视化上方提示
  const incompleteMappingCount = useMemo(
    () => fieldMappings.filter(m =>
      m.sourceType === 'table1' ? (!m.templateCol || !m.table1Col) : !m.templateCol
    ).length,
    [fieldMappings],
  )
  const mappingAuxTables = useMemo(() => mappingModel.cards.map(c => ({
    id: c.id, name: c.name, fileName: c.fileName, matchPairs: c.matchPairs, pairIds: c.pairIds,
    how: mappingJoinTypes[c.id] ?? 'left',
  })), [mappingModel, mappingJoinTypes])
  const mappingAuxColumnsMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    mappingModel.cards.forEach(c => { m[c.id] = c.cols })
    return m
  }, [mappingModel])
  // 改键 → 写回对应字段映射（模板列 / 数据表列 / 自定义来源类型）
  const updateMappingPair = (auxId: string, pi: number, field: 'orderCol' | 'auxCol', value: string) => {
    const target = mappingModel.cards.find(c => c.id === auxId)?.pairIds[pi]
    if (!target) return
    if (field === 'orderCol') { handleUpdateMapping(target, 'templateCol', value); return }
    if (auxId === 'map-custom') {
      const v = mappingModel.customDisplayToValue[value]
      if (v) handleUpdateMapping(target, 'sourceType', v)
      return
    }
    handleUpdateMapping(target, 'table1Col', value)
  }
  // 拖拽连线 → 新增一条字段映射（数据表取值 / 自定义字段取值）
  const connectMapping = (auxId: string, orderCol: string, auxCol: string) => {
    if (auxId === 'map-custom') {
      const v = mappingModel.customDisplayToValue[auxCol]
      if (!v) return
      if (fieldMappings.some(m => m.templateCol === orderCol && m.sourceType === v)) return
      setFieldMappings(prev => [...prev, {
        id: newId(),
        templateCol: orderCol,
        sourceType: v as SourceType,
      } as FieldMapping])
      return
    }
    if (mappingPairs.some(m => m.templateCol === orderCol && m.table1Col === auxCol)) return
    setFieldMappings(prev => [...prev, {
      id: newId(),
      templateCol: orderCol,
      sourceType: 'table1',
      table1Col: auxCol,
    } as FieldMapping])
  }
  // 删除关联 → 删除该字段映射
  const removeMappingPair = (auxId: string, pi: number) => {
    const target = mappingModel.cards.find(c => c.id === auxId)?.pairIds[pi]
    if (target) handleDeleteMapping(target)
  }
  // 修改连接方式（第 5 步建模图表头下拉，与第 2 步同款交互）
  const changeMappingJoinType = (auxId: string, how: 'left' | 'inner' | 'right') =>
    setMappingJoinTypes(prev => ({ ...prev, [auxId]: how }))

  // ═══════════════════════════════════════════════════════════
  // 金蝶导入操作
  // ═══════════════════════════════════════════════════════════
  const handleSelectTable2 = async () => {
    const res = await window.electronAPI.dialog.openFiles({ filters: [{ name: '表格文件', extensions: TABLE_FILE_EXTS }] })
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
      id: newId(),
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
  /** 正在弹框中配置的编号规则 id（null = 不显示弹框） */
  const [editingSeqId, setEditingSeqId] = useState<string | null>(null)
  const editingSeq = useMemo(() => seqConfigs.find(c => c.id === editingSeqId) ?? null, [seqConfigs, editingSeqId])
  /** 规则摘要（列表里替代完整配置展示） */
  const seqSummary = (cfg: SeqConfig) => {
    if (cfg.type === 'constant') return cfg.constantValue ? t.ruleSummaryConstant(cfg.constantValue) : t.ruleSummaryConstantEmpty
    const range = t.ruleSummaryRange(cfg.start, cfg.step)
    if (cfg.type === 'sequential') return range
    return `${cfg.baseField ? t.ruleSummaryFieldBased(cfg.baseField) : t.ruleSummaryNeedField}，${range}`
  }

  const handleAddSeq = () => {
    const id = newId('seq')
    setSeqConfigs(prev => [...prev, { id, name: t.seqDefaultName, type: 'sequential', constantValue: '', start: 1, step: 1, baseField: '' }])
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

  /**
   * 第 1 步合并前检测：找出会真正影响合并的问题
   *   ① 各订单文件的第一张工作表名称不一致（软件只读第一张表，名字不同往往是表选错了）
   *   ② 各订单文件的字段不一致（缺的列在合并结果里会变成空值）
   * 只比订单文件——辅助表本就结构不同，不参与比对。
   * 少于 2 个文件时无从比对，直接返回空。
   */
  const checkMergeFiles = async (): Promise<MergeCheckIssue[]> => {
    const issues: MergeCheckIssue[] = []
    if (orderFiles.length < 2) return issues

    const infos: {
      fileName: string; filePath: string; isCsv: boolean
      sheetName: string; columns: string[]
    }[] = []
    for (const ofile of orderFiles) {
      const res = await window.electronAPI.excelMerge.getFileInfo(ofile.path)
      if (!res.success || !res.data) continue
      infos.push({
        fileName: ofile.name,
        filePath: ofile.path,
        isCsv: ofile.name.toLowerCase().endsWith('.csv'),
        sheetName: res.data.sheetNames[0] ?? '',
        columns: res.data.headerColumns
      })
    }
    if (infos.length < 2) return issues

    // ① 工作表名称不一致（CSV 没有工作表，不参与比对）
    const withSheet = infos.filter(i => !i.isCsv)
    const sheetNames = Array.from(new Set(withSheet.map(i => i.sheetName)))
    if (sheetNames.length > 1) {
      issues.push({
        title: t.checkSheetTitle,
        desc: t.checkSheetDesc,
        details: infos.map(i => ({
          fileName: i.fileName,
          filePath: i.filePath,
          value: i.isCsv ? t.checkInFileNoSheet : i.sheetName || t.checkInFileNoSheet
        }))
      })
    }

    // ② 字段不一致（以第一个文件为基准，列出各自缺/多哪些列）
    const base = infos[0]
    const baseSet = new Set(base.columns)
    const columnDetails: MergeCheckIssue['details'] = []
    for (const info of infos) {
      const missing = base.columns.filter(c => !info.columns.includes(c))
      const extra = info.columns.filter(c => !baseSet.has(c))
      if (missing.length === 0 && extra.length === 0) continue
      const parts: string[] = []
      if (missing.length > 0) parts.push(`缺：${missing.join('、')}`)
      if (extra.length > 0) parts.push(`多：${extra.join('、')}`)
      columnDetails.push({ fileName: info.fileName, filePath: info.filePath, value: parts.join('；') })
    }
    if (columnDetails.length > 0) {
      issues.push({
        title: t.checkColumnsTitle,
        desc: t.checkColumnsDesc(base.fileName),
        details: columnDetails
      })
    }

    return issues
  }

  /**
   * 辅助表结构检测（原方式）：跨文件重名列。
   *   辅助表会与「订单文件合并成的合并表」及其他辅助表拼在一起，若某列名在多份文件里重复，
   *   后续步骤就分不清该取哪一列。
   * 口径：
   *   - 只报「至少有一方是辅助表」的重复；订单文件之间互相同的列名属同类文件合并，正常，不报。
   *   - 关联字段（匹配键）本身就会两边出现，一律排除。
   * 无问题返回空数组。
   */
  const checkAuxDuplicateColumns = async (): Promise<MergeCheckIssue[]> => {
    if (auxTables.length === 0) return []

    // 关联字段（匹配键）：订单侧键 + 辅助表侧键
    const excluded = new Set<string>()
    for (const aux of auxTables) {
      for (const pair of aux.matchPairs) {
        if (pair.orderCol) excluded.add(pair.orderCol)
        if (pair.auxCol) excluded.add(pair.auxCol)
      }
    }

    // 收集每份文件的列（kind 区分订单文件 / 辅助表）
    interface ColEntry { name: string; path: string; kind: 'order' | 'aux'; columns: string[] }
    const entries: ColEntry[] = []
    for (const ofile of orderFiles) {
      const res = await window.electronAPI.excelMerge.getColumns(ofile.path)
      if (res.success && res.data) entries.push({ name: ofile.name, path: ofile.path, kind: 'order', columns: res.data })
    }
    for (const aux of auxTables) {
      const fp = auxFilePaths[aux.id]
      if (!fp) continue
      const res = await window.electronAPI.excelMerge.getColumns(fp)
      if (res.success && res.data) entries.push({ name: aux.name, path: fp, kind: 'aux', columns: res.data })
    }

    // 列名 → 出现它的文件（同一文件内重复只记一次）
    const seen = new Map<string, ColEntry[]>()
    for (const entry of entries) {
      for (const col of new Set(entry.columns)) {
        if (excluded.has(col)) continue
        if (!seen.has(col)) seen.set(col, [])
        seen.get(col)!.push(entry)
      }
    }

    // 逐个辅助表汇总「它与其它文件重名的列」
    const auxIssues = new Map<string, { entry: ColEntry; parts: string[] }>()
    for (const [col, holders] of seen) {
      if (holders.length < 2) continue
      if (!holders.some(h => h.kind === 'aux')) continue // 订单文件之间重名 → 跳过
      for (const h of holders) {
        if (h.kind !== 'aux') continue
        const others = Array.from(new Set(holders.filter(x => x !== h).map(x => x.name)))
        const item = auxIssues.get(h.path) ?? { entry: h, parts: [] }
        item.parts.push(t.checkDupValue(col, others.join('、')))
        auxIssues.set(h.path, item)
      }
    }

    if (auxIssues.size === 0) return []
    return [{
      title: t.checkDupTitle,
      desc: t.checkDupDesc,
      details: Array.from(auxIssues.values()).map(v => ({
        fileName: v.entry.name,
        filePath: v.entry.path,
        value: v.parts.join('；')
      }))
    }]
  }

  /**
   * 合并前检测闸门：有问题则弹「只提示」弹框，用户可选继续。
   * 两类检测分别作用于不同步骤：
   *   第 1 步「合并原表」——工作表名 / 各文件字段是否一致（checkMergeFiles）
   *   第 2 步「合并辅助表」——跨文件重名列（checkAuxDuplicateColumns）
   * passedRef：用户在弹框里点了「仍然继续合并」后放行一次。
   * 返回 true 表示应当中止本次执行（等用户决定）。
   */
  const blockOnMergeCheck = async (
    passedRef: { current: boolean },
    collect: () => Promise<MergeCheckIssue[]>,
    continueRun: () => void
  ): Promise<boolean> => {
    if (passedRef.current) {
      passedRef.current = false
      return false
    }
    const issues = await collect()
    if (issues.length === 0) return false
    setMergeCheck({ issues, onContinue: continueRun })
    return true
  }

  // ═══════════════════════════════════════════════════════════
  // 第 1 步：合并原表（只合并订单文件，不含辅助表）
  // ═══════════════════════════════════════════════════════════
  const handleStep1Merge = async () => {
    if (orderFiles.length === 0) { setToast({ type: 'error', msg: t.validateNoOrderFiles }); return }

    // 合并前检测（工作表名 / 各文件字段一致性）：只提示，用户可点「仍然继续合并」
    if (await blockOnMergeCheck(mergeCheckPassedRef, checkMergeFiles, () => { mergeCheckPassedRef.current = true; setMergeCheck(null); void handleStep1Merge() })) return

    setStep1Executing(true); setMergeProgressLogs([]); setMergeResult(null)
    setStep1RawDone(false); setRawMergedPath('')
    // 第 1 步重跑 → 第 2 步产物与下游分步产物全部失效
    setStep1Done(false); setStep1MergedPath('')
    setS3Result(null); setS4Dir(''); setS5FilledFiles([]); setFinalResult(null)
    setExecutePhase(t.progressMerging)

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const mergeRes = await window.electronAPI.excelMerge.merge({
        orderFilePaths: orderFiles.map(f => f.path), auxFilePaths: {},
        config: {
          name: project?.name || '临时配置', orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: [], outputFileName: t.defaultMergedRawOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!mergeRes.success || !mergeRes.data) { setToast({ type: 'error', msg: mergeRes.error || t.resultMergeFail }); setStep1Executing(false); return }
      setRawMergedPath(mergeRes.data.outputPath)
      setStep1RawDone(true)
      setMergeProgressLogs(prev => [...prev, t.resultRawMergeDone(mergeRes.data.totalRows)])
      setExecutePhase(t.step1RawDoneLabel)
      setToast({ type: 'success', msg: t.resultRawMergeDone(mergeRes.data.totalRows) })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultMergeError(e) })
    } finally {
      setStep1Executing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 第 2 步：合并辅助表（在第 1 步「合并原表」产物上 LEFT JOIN）
  // ═══════════════════════════════════════════════════════════
  const handleStep2JoinAux = async () => {
    if (!step1RawDone || !rawMergedPath) { setToast({ type: 'error', msg: t.needStep1RawFirst }); return }
    if (auxTables.length === 0) { setToast({ type: 'error', msg: t.validateNoAuxTables }); return }
    for (const aux of auxTables) {
      if (!auxFilePaths[aux.id]) { setToast({ type: 'error', msg: t.validateAuxNoFile(aux.name) }); return }
      for (const pair of aux.matchPairs) {
        if (!pair.orderCol || !pair.auxCol) { setToast({ type: 'error', msg: t.validateAuxIncomplete(aux.name) }); return }
      }
    }

    // 辅助表结构检测（跨文件重名列）：只提示，用户可点「仍然继续合并」
    if (await blockOnMergeCheck(auxCheckPassedRef, checkAuxDuplicateColumns, () => { auxCheckPassedRef.current = true; setMergeCheck(null); void handleStep2JoinAux() })) return

    setAuxJoinExecuting(true)
    setStep1Done(false); setStep1MergedPath(''); setMergeResult(null)
    // 第 2 步重跑 → 下游分步产物失效
    setS3Result(null); setS4Dir(''); setS5FilledFiles([]); setFinalResult(null)
    setExecutePhase(t.progressJoinAux)

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const joinRes = await window.electronAPI.excelMerge.joinAux({
        inputPath: rawMergedPath,
        auxFilePaths,
        config: {
          name: project?.name || '临时配置', orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: auxTables, outputFileName: t.defaultMergeOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!joinRes.success || !joinRes.data) { setToast({ type: 'error', msg: joinRes.error || t.resultMergeFail }); setAuxJoinExecuting(false); return }
      const mergedPath = joinRes.data.outputPath
      setMergeResult(joinRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, t.resultMergeDone(joinRes.data.totalRows)])
      setExecutePhase(t.step1DoneLabel)
      setToast({ type: 'success', msg: t.resultMergeDone(joinRes.data.totalRows) })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultMergeError(e) })
    } finally {
      setAuxJoinExecuting(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // S3~S6：分步执行（后端调用与参数与一键执行完全一致）
  // ═══════════════════════════════════════════════════════════
  const handleS3Split = async () => {
    if (!step1Done || !step1MergedPath) { setToast({ type: 'error', msg: t.needStep1First }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: t.validateNoGroupBy }); return }
    setActiveStep(3)
    setS3Executing(true); setS3Result(null); setMergeProgressLogs([])
    setExecutePhase(t.progressStep1)
    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: step1MergedPath, groupByColumn, startBillNo, billNoStep, billNoBaseField, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || t.progressStep1Fail }); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep1Done()])
      setS3Result({ outputPath: s1.data.outputPath })
      setExecutePhase(t.stepDoneS3)
      setToast({ type: 'success', msg: t.stepDoneS3 })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultStep2Error(e) })
    } finally { setS3Executing(false) }
  }

  const handleS4Match = async () => {
    if (!step1Done || !step1MergedPath) { setToast({ type: 'error', msg: t.needStep1First }); return }
    if (!table2Path) { setToast({ type: 'error', msg: t.validateNoTemplate }); return }
    if (!groupByColumn) { setToast({ type: 'error', msg: t.validateNoGroupBy }); return }
    if (!matchFieldTable1 || !matchFieldTable2) { setToast({ type: 'error', msg: t.validateNoMatchField }); return }
    setActiveStep(4)
    setS4Executing(true); setS4Dir(''); setS5FilledFiles([]); setFinalResult(null); setMergeProgressLogs([])
    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      setExecutePhase(t.progressStep2a)
      const s21 = await window.electronAPI.kingdeeImport.step2a({ table1Path: step1MergedPath, table2Path, groupByColumn, matchFieldTable1, matchFieldTable2, startBillNo, billNoStep, billNoBaseField, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s21.success) { setToast({ type: 'error', msg: s21.error || t.progressStep2aFail }); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2aDone])
      setExecutePhase(t.progressStep2b)
      const s21Dir = s21.data.outputPath.replace(/\\[^\\]+$/, '')
      const s22 = await window.electronAPI.kingdeeImport.step2b({ inputDir: s21Dir, outputDir: tmpDir })
      if (!s22.success) { setToast({ type: 'error', msg: s22.error || t.progressStep2bFail }); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2bDone])
      setS4Dir(s22.data.outputPath.replace(/\\[^\\]+$/, ''))
      setExecutePhase(t.stepDoneS4)
      setToast({ type: 'success', msg: t.stepDoneS4 })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultStep2Error(e) })
    } finally { setS4Executing(false) }
  }

  const handleS5Fill = async () => {
    if (!s4Dir) { setToast({ type: 'error', msg: t.needS4First }); return }
    if (!table2Path) { setToast({ type: 'error', msg: t.validateNoTemplate }); return }
    if (fieldMappings.length === 0) { setToast({ type: 'error', msg: t.validateNoFieldMapping }); return }
    for (const m of fieldMappings) {
      const cfg = seqConfigs.find(c => c.id === m.sourceType)
      if (cfg && cfg.type === 'fieldBased' && !cfg.baseField) {
        setToast({ type: 'error', msg: t.validateFillRuleBaseField(cfg.name) }); return
      }
    }
    setActiveStep(5)
    setS5Executing(true); setS5FilledFiles([]); setFinalResult(null); setMergeProgressLogs([])
    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')
      setExecutePhase(t.progressStep2c)
      const s23 = await window.electronAPI.kingdeeImport.step2c({ inputDir: s4Dir, fieldMappings, date, matchFieldTable1, matchFieldTable2, templateHeaderRowIndex, templateDataStartRowIndex, table2Path, outputDir: tmpDir, seqConfigs })
      if (!s23.success) { setToast({ type: 'error', msg: s23.error || t.progressStep2cFail }); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2cDone])
      setExecutePhase(t.progressStep2d)
      const s23Dir = s23.data.outputPath.replace(/\\[^\\]+$/, '')
      const s24 = await window.electronAPI.kingdeeImport.step2d({ inputDir: s23Dir, table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: tmpDir })
      if (!s24.success) { setToast({ type: 'error', msg: s24.error || t.progressStep2dFail }); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep2dDone])
      setS5FilledFiles(s24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })))
      setExecutePhase(t.stepDoneS5)
      setToast({ type: 'success', msg: t.stepDoneS5 })
    } catch (e: any) {
      setToast({ type: 'error', msg: t.resultStep2Error(e) })
    } finally { setS5Executing(false) }
  }

  const handleS6Export = async () => {
    if (s5FilledFiles.length === 0) { setToast({ type: 'error', msg: t.needS5First }); return }
    if (!table2Path) { setToast({ type: 'error', msg: t.validateNoTemplate }); return }
    if (!outputDir) { setToast({ type: 'error', msg: t.validateNoOutputDir }); return }
    setActiveStep(6)
    setS6Executing(true); setFinalResult(null); setMergeProgressLogs([])
    setExecutePhase(t.progressStep3)
    try {
      const s3 = await window.electronAPI.kingdeeImport.step3({
        table2Path,
        filledTemplateFiles: s5FilledFiles,
        templateHeaderRowIndex, templateDataStartRowIndex,
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols, transforms: transformRules
      })
      if (!s3.success) { setToast({ type: 'error', msg: s3.error || t.progressStep3Fail }); return }
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
    } finally { setS6Executing(false) }
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
        setToast({ type: 'error', msg: t.validateSeqBaseField(cfg.name) }); return
      }
    }

    // 合并前检测（第 1 步：工作表名/字段一致性；第 2 步：辅助表重名列）：只提示，可点「仍然继续合并」
    if (await blockOnMergeCheck(mergeCheckPassedRef, checkMergeFiles, () => { mergeCheckPassedRef.current = true; setMergeCheck(null); void handleRunAll() })) return
    if (await blockOnMergeCheck(auxCheckPassedRef, checkAuxDuplicateColumns, () => { auxCheckPassedRef.current = true; setMergeCheck(null); void handleRunAll() })) return

    setIsRunAll(true)
    setActiveStep(1)
    onViewModeChange('step')
    setMergeProgressLogs([]); setMergeResult(null); setFinalResult(null)
    setStep1Done(false); setStep1MergedPath(''); setExecutePhase('')
    setStep1RawDone(false); setRawMergedPath('')

    try {
      const tmpDir = await window.electronAPI.app.getPath('temp')

      // ── 第 1 步: 合并原表 ──
      setStep1Executing(true)
      setExecutePhase(t.progressMerging)
      mergeProgressUnsubRef.current = window.electronAPI.excelMerge.onProgress(prog => {
        setMergeProgress(prog)
        if (prog.message) setMergeProgressLogs(prev => [...prev, prog.message!])
      })
      const mergeRes = await window.electronAPI.excelMerge.merge({
        orderFilePaths: orderFiles.map(f => f.path), auxFilePaths: {},
        config: {
          name: project.name, orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: [], outputFileName: t.defaultMergedRawOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (!mergeRes.success || !mergeRes.data) {
        if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
        setToast({ type: 'error', msg: mergeRes.error || t.resultMergeFail }); setStep1Executing(false); setIsRunAll(false); return
      }
      const rawPath = mergeRes.data.outputPath
      setRawMergedPath(rawPath)
      setStep1RawDone(true)
      setMergeProgressLogs(prev => [...prev, t.resultRawMergeDone(mergeRes.data.totalRows)])
      setStep1Executing(false)

      // ── 第 2 步: 合并辅助表（进度复用同一订阅，结束后统一退订）──
      setAuxJoinExecuting(true)
      setExecutePhase(t.progressJoinAux)
      const joinRes = await window.electronAPI.excelMerge.joinAux({
        inputPath: rawPath,
        auxFilePaths,
        config: {
          name: project.name, orderSubFolder: '', auxSubFolder: '',
          textColumns: [], auxiliaryTables: auxTables, outputFileName: t.defaultMergeOutput,
          orderFilePaths: orderFiles.map(f => ({ path: f.path, name: f.name })),
          outputDir: tmpDir
        },
        outputDir: tmpDir
      })
      if (mergeProgressUnsubRef.current) { mergeProgressUnsubRef.current(); mergeProgressUnsubRef.current = null }
      if (!joinRes.success || !joinRes.data) { setToast({ type: 'error', msg: joinRes.error || t.resultMergeFail }); setAuxJoinExecuting(false); setIsRunAll(false); return }
      const mergedPath = joinRes.data.outputPath
      setMergeResult(joinRes.data)
      setStep1MergedPath(mergedPath)
      setStep1Done(true)
      try { const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(mergedPath); if (colRes.success && colRes.data) setTable1Columns(colRes.data) } catch {}
      setMergeProgressLogs(prev => [...prev, t.resultMergeDone(joinRes.data.totalRows)])
      setAuxJoinExecuting(false)

      // ── Step 2: 生成导入金蝶汇总表 ──
      setStep2Executing(true)
      setExecutePhase(t.progressStep1)
      const s1 = await window.electronAPI.kingdeeImport.step1({ table1Path: mergedPath, groupByColumn, startBillNo, billNoStep, billNoBaseField, outputDir: tmpDir })
      if (!s1.success) { setToast({ type: 'error', msg: s1.error || t.progressStep1Fail }); setStep2Executing(false); setIsRunAll(false); return }
      setMergeProgressLogs(prev => [...prev, t.progressStep1Done()])
      // 与分步执行一致：写入第 3 步结果，顶部步骤条的「已完成」勾依赖它
      setS3Result({ outputPath: s1.data.outputPath })

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
        outputDir, outputPrefix, textFormatColumns: kingdeeTextCols, transforms: transformRules
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
      setAuxJoinExecuting(false)
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

  /** 顶部「操作流程」：点某一步 → 若在建模视图则先切回分步操作，再滚动到对应步骤卡 */
  const jumpToStep = (n: number) => {
    setActiveStep(n)
    onViewModeChange('step')
    // 建模视图下先切回分步操作，等步骤卡渲染出来再滚动定位
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = document.getElementById(`step-card-${n}`)
      if (!card) return
      // 顶部粘性区会随窗口宽度换行变高，若用固定偏移会盖住卡片标题行，
      // 故按它的实时高度计算偏移（+16px 留白）。
      const bar = document.getElementById('combined-sticky-top')
      const offset = (bar?.offsetHeight ?? 0) + 16
      const scroller = card.closest('main') as HTMLElement | null
      if (scroller) {
        const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
      } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }))
  }

  /** 建模视图 / 分步操作共用：渲染某个环节的图形（1~6） */
  const renderStepVisual = (step: number) => {
    switch (step) {
      case 1:
        return <MergeSketchView orderFiles={orderFiles} />
      case 2:
        return (
          <LeftJoinModelView
            mergedColumns={table1Columns.length > 0 ? table1Columns : orderColumns}
            auxTables={auxTables}
            auxColumnsMap={auxColumnsMap}
            onChangeMatchPair={updateMatchPair}
            onConnect={handleConnect}
            onRemoveMatchPair={removeMatchPair}
            onChangeJoinType={changeJoinType}
          />
        )
      case 3:
        return (
          <SplitSketchView
            groupByColumn={groupByColumn}
            startBillNo={startBillNo}
            billNoStep={billNoStep}
          />
        )
      case 4:
        return (
          <LeftJoinModelView
            mergedColumns={templateColumns}
            auxTables={templateMatchAuxTables}
            auxColumnsMap={templateMatchAuxColumnsMap}
            onChangeMatchPair={updateTemplateMatchPair}
            onConnect={connectTemplateMatch}
            leftTitle={t.templateMatchLeftTitle}
            toolbarTitle={t.templateMatchToolbar}
            leftFieldLabel={t.templateMatchLeftTitle}
          />
        )
      case 5:
        return (
          <LeftJoinModelView
            mergedColumns={templateColumns}
            auxTables={mappingAuxTables}
            auxColumnsMap={mappingAuxColumnsMap}
            onChangeMatchPair={updateMappingPair}
            onConnect={connectMapping}
            onRemoveMatchPair={removeMappingPair}
            onChangeJoinType={changeMappingJoinType}
            leftTitle={t.templateMatchLeftTitle}
            toolbarTitle={t.mappingToolbar}
            leftFieldLabel={t.templateMatchLeftTitle}
            emptyText={t.mappingEmpty}
          />
        )
      default:
        // 第 6 步无连线图形，用一张「输出汇总」小结代替
        return (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-black">{t.summaryTitle}</p>
            <div className="text-xs text-black bg-gray-50 border border-gray-100 rounded p-2 space-y-1.5">
              <p>{t.summaryOrders(orderFiles.length)}</p>
              <p>{t.summaryFilled(s5FilledFiles.length)}</p>
              <p className="break-all">
                {outputDir ? `${t.labelOutputDir}：${outputDir}` : t.summaryNoDir}
              </p>
              <p className="break-all">{t.labelOutputPrefix}：{outputPrefix}</p>
              {finalResult && (
                <p className="break-all">{t.statOutputFile} {finalResult.outputPath}</p>
              )}
            </div>
          </div>
        )
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════
  return (
    <div className={viewMode === 'model' ? 'max-w-7xl mx-auto relative' : 'max-w-6xl mx-auto relative'}>

      {/* Toast（自动关闭由组件内部处理） */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 合并前检测弹框（工作表名 / 字段不一致；只提示，可选继续） */}
      <MergeCheckDialog
        issues={mergeCheck?.issues ?? null}
        onClose={() => setMergeCheck(null)}
        onContinue={() => mergeCheck?.onContinue()}
      />

      {/* 编号规则配置弹框（替代原内联大卡片） */}
      <SeqRuleDialog
        rule={editingSeq}
        columnOptions={orderColumns}
        disabled={isExecuting}
        note={editingSeq?.id === 'seq-billNo' ? t.billNoRuleNote : undefined}
        onChange={handleUpdateSeq}
        onClose={() => setEditingSeqId(null)}
      />

      {/* ══════════════════════════════════════════════════════
          粘性顶栏：操作流程 + 视图切换 + 一键完成（单行紧凑，滚动时常驻）
          ══════════════════════════════════════════════════════ */}
      <div id="combined-sticky-top"
        className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-black flex-shrink-0">{t.flowTitle}</span>
          <div className="flex-1 min-w-0">
            <StepIndicator steps={flowSteps} variant="chips" activeStep={activeStep} onSelectStep={jumpToStep} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleSavePreset} disabled={isExecuting || !project}
              className="btn-press px-3 py-1 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 disabled:cursor-not-allowed flex items-center focus-ring">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {t.btnSavePreset}
            </button>
            <button onClick={handleRunAll} disabled={isExecuting}
              className="btn-press px-3 py-1 text-sm font-semibold text-white bg-primary-800 rounded hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center focus-ring">
              {isRunAll ? (
                <svg className="animate-spin h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              )}
              {isRunAll ? t.btnRunAllExecuting : t.btnRunAll}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'model' ? (
        /* ── 建模视图：像 Power BI 建模页一样，把 1~6 步的图形一次全展示 ── */
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{n}</span>
                  <p className="text-sm font-semibold text-black truncate">{t.stepLabel(n, STEP_TITLES[n - 1])}</p>
                </div>
                {renderStepVisual(n)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── 分步操作：六张可编辑的步骤卡 + 底部统一日志区 ── */
        <div className="mt-3 space-y-3">

      {/* ══════════════════════════════════════════════════════
          S1：合并原表
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-1" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">1</span>
            {t.stepS1Title}
            <HelpTip text={t.stepS1Desc} label={t.helpStepDesc(t.stepS1Title)} />
          </h2>
          <div className="flex-1" />
          {step1RawDone && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.step1RawDoneLabel}
            </span>
          )}
          <button onClick={() => { setActiveStep(1); handleStep1Merge() }} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {step1Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS1}
          </button>
        </div>

        {/* 订单文件 */}
        <div className="mb-3">
          <NativeDropZone
            onFiles={handleOrderFilesDrop}
            className="flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors border-gray-200"
            activeClassName="flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors border-dashed border-primary-400 bg-primary-50 ring-2 ring-primary-200"
          >
            <label className="text-sm text-black w-32 flex-shrink-0 flex items-center gap-1">
              {t.labelOrderFiles}
              <HelpTip text={t.hintOrderFiles} label={t.helpOrderFiles} />
            </label>
            <button onClick={handleSelectOrderFiles} disabled={isExecuting}
              className="btn-press px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnSelectFile}</button>
            <span className="text-sm text-black truncate flex-1">
              {orderFiles.length > 0 ? t.selectedFilesCount(orderFiles.length) : t.placeholderDragFile}
            </span>
            {orderFiles.length > 0 && (
              <button onClick={() => { setOrderFiles([]); setOrderColumns([]) }} disabled={isExecuting}
                className="px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 focus-ring">{t.btnClear}</button>
            )}
          </NativeDropZone>
        </div>

        {/* 待合并文件清单（从左侧可视化栏移回功能设置区） */}
        {orderFiles.length > 0 && (
          <div className="mb-3">
            <FolderMergeView orderFiles={orderFiles} />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          S2：合并辅助表
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-2" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">2</span>
            {t.stepS2Title}
            <HelpTip text={t.stepS2Desc} label={t.helpStepDesc(t.stepS2Title)} />
            <span className="ml-2 text-xs font-normal text-black">{t.stepS2DependsS1}</span>
          </h2>
          <div className="flex-1" />
          {step1Done && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.step1DoneLabel}
            </span>
          )}
          <button onClick={() => { setActiveStep(2); handleStep2JoinAux() }} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {auxJoinExecuting && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS2}
          </button>
        </div>

          {/* 辅助表 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-black flex items-center gap-1">{t.sectionAuxTable}<HelpTip text={t.hintAuxTable} label={t.helpAuxTable} /></h3>
              <button onClick={handleAddAuxTable} disabled={isExecuting} className="btn-primary btn-press text-sm focus-ring">{t.btnAddAuxTable}</button>
            </div>
            {auxTables.length === 0 && (
              <p className="text-sm text-black text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">{t.noAuxTable}</p>
            )}
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
                          className="text-sm font-medium text-black bg-transparent border-b border-transparent hover:border-gray-300 focus-ring px-1" />
                      </div>
                      <button onClick={() => handleRemoveAuxTable(aux.id)} disabled={isExecuting}
                        className="px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100">{t.btnDelete}</button>
                    </div>
                    <NativeDropZone
                      onFiles={(files) => handleAuxFileDrop(aux.id, files)}
                      className="flex items-center space-x-3 mb-2 p-2 rounded-lg border-2 transition-colors border-gray-200"
                      activeClassName="flex items-center space-x-3 mb-2 p-2 rounded-lg border-2 transition-colors border-dashed border-primary-400 bg-primary-50 ring-2 ring-primary-200"
                    >
                      <label className="text-sm text-black w-12 flex-shrink-0">{t.labelFile}</label>
                      <span className="flex-1 text-sm text-black truncate">{aux.fileName || t.placeholderDragOrClick}</span>
                      <button onClick={() => handleSelectAuxFile(aux.id)} disabled={isExecuting}
                        className="btn-press px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnSelect}</button>
                    </NativeDropZone>
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="text-sm text-black flex items-center gap-1">{t.labelJoinType}<HelpTip text={t.hintJoinType} label={t.helpJoinType} /></span>
                      <select value={aux.how} onChange={e => updateAuxTable(aux.id, { how: e.target.value as 'left' | 'inner' | 'right' })}
                        disabled={isExecuting} aria-label={t.labelJoinType}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring w-56">
                        <option value="left">{t.joinLeft}</option>
                        <option value="inner">{t.joinInner}</option>
                        <option value="right">{t.joinRight}</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-sm text-black mb-1 flex items-center gap-1">{t.labelMatchField}<HelpTip text={t.hintMatchField} label={t.helpMatchField} /></p>
                      {aux.matchPairs.map((pair, pi) => (
                        <div key={pi} className="flex items-center space-x-2 mb-1.5">
                          <span className="text-sm text-black w-10 flex-shrink-0">{t.labelOrder}</span>
                          <div className="flex-1 min-w-0">
                            <SearchableSelect value={pair.orderCol} options={orderColumns}
                              onChange={v => updateMatchPair(aux.id, pi, 'orderCol', v)}
                              placeholder={t.placeholderSelectCol} disabled={isExecuting}
                              ariaLabel={`订单侧匹配列 ${pi + 1}`} />
                          </div>
                          <span className="text-black text-sm flex-shrink-0" aria-hidden="true">↔</span>
                          <span className="text-sm text-black w-10 flex-shrink-0">{t.labelAux}</span>
                          <div className="flex-1 min-w-0">
                            <SearchableSelect value={pair.auxCol} options={auxCols}
                              onChange={v => updateMatchPair(aux.id, pi, 'auxCol', v)}
                              placeholder={t.placeholderSelectCol} disabled={isExecuting}
                              ariaLabel={`辅助侧匹配列 ${pi + 1}`} />
                          </div>
                          {aux.matchPairs.length > 1 && (
                            <button onClick={() => handleRemoveMatchPair(aux.id, pi)} disabled={isExecuting}
                              aria-label={`删除第 ${pi + 1} 条匹配列`}
                              className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 focus-ring">✕</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => handleAddMatchPair(aux.id)} disabled={isExecuting}
                        className="text-sm text-black hover:text-primary-700 mt-1 focus-ring rounded">{t.btnAddMatchField}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 关联建模已移到可视化视图（第 2 步），此处仅保留配置项；执行按钮在标题行 */}

          {/* S2 — 合并结果（成功态用绿色语义色） */}
          {mergeResult && !step1Executing && !auxJoinExecuting && (
            <div className="bg-success-50 border border-success-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-sm font-semibold text-success-800 flex items-center">
                  <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  {t.step1DoneLabel}
                </span>
                <button onClick={() => window.electronAPI.shell.openPath(mergeResult.outputPath)}
                  className="btn-press px-3 py-1.5 text-sm text-white bg-primary-800 rounded hover:bg-primary-700 focus-ring">{t.btnOpenOutput}</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="bg-white rounded p-2 text-center border border-success-100">
                  <p className="text-base font-bold text-black">{mergeResult.totalRows}</p>
                  <p className="text-xs text-black">{t.statTotalRows}</p>
                </div>
                <div className="bg-white rounded p-2 text-center border border-success-100">
                  <p className="text-base font-bold text-black">{mergeResult.totalColumns}</p>
                  <p className="text-xs text-black">{t.statTotalCols}</p>
                </div>
                <div className="bg-white rounded p-2 text-center border border-success-100">
                  <p className="text-base font-bold text-black">{mergeResult.matchedCount}</p>
                  <p className="text-xs text-black">{t.statMatchedRows}</p>
                </div>
                <div className="bg-white rounded p-2 text-center border border-success-100">
                  <p className="text-base font-bold text-black">{mergeResult.unmatchedCount}</p>
                  <p className="text-xs text-black">{t.statUnmatchedRows}</p>
                </div>
              </div>
              <div>
                <div className="text-xs text-black mb-1">{t.statOutputFile}</div>
                <button onClick={() => window.electronAPI.shell.openPath(mergeResult.outputPath)}
                  className="text-xs text-primary-700 hover:underline truncate block max-w-xs focus-ring rounded" title={mergeResult.outputPath}>
                  {mergeResult.outputPath}
                </button>
              </div>
            </div>
          )}
      </div>

      {/* ══════════════════════════════════════════════════════
          S3：订单拆分
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-3" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">3</span>
            {t.stepS3Title}
            <HelpTip text={t.stepS3Desc} label={t.helpStepDesc(t.stepS3Title)} />
            <span className="ml-2 text-xs font-normal text-black">{t.stepS3DependsS2}</span>
          </h2>
          <div className="flex-1" />
          {s3Result && !s3Executing && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.stepDoneS3}
            </span>
          )}
          <button onClick={handleS3Split} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {s3Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS3}
          </button>
        </div>

        <div className="flex items-center space-x-3 mb-1">
          <label className="text-sm text-black w-56 flex-shrink-0 flex items-center gap-1" htmlFor="group-by-column">{t.labelGroupByColumn}<HelpTip text={t.hintGroupBy} label={t.helpGroupBy} /></label>
          <div className="flex-1">
            <SearchableSelect value={groupByColumn} options={orderColumns} onChange={setGroupByColumn}
              placeholder={t.placeholderSelectCol} disabled={isExecuting} ariaLabel={t.labelGroupByColumn} />
          </div>
        </div>

        {/* 订单拆分图在可视化视图（第 3 步）；执行按钮在标题行 */}

        {/* S3 — 拆分结果 */}
        {s3Result && !s3Executing && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-black mb-1">{t.resultSplitFile}</div>
            <button onClick={() => window.electronAPI.shell.openPath(s3Result.outputPath)}
              className="text-xs text-primary-700 hover:underline truncate block max-w-md focus-ring rounded">
              {s3Result.outputPath}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          S4：模板匹配
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-4" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">4</span>
            {t.stepS4Title}
            <HelpTip text={t.stepS4Desc} label={t.helpStepDesc(t.stepS4Title)} />
            <span className="ml-2 text-xs font-normal text-black">{t.stepS4DependsS2}</span>
          </h2>
          <div className="flex-1" />
          {s4Dir && !s4Executing && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.stepDoneS4}
            </span>
          )}
          <button onClick={handleS4Match} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {s4Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS4}
          </button>
        </div>

        {/* 模板表地址 */}
        <NativeDropZone
          onFiles={handleTable2Drop}
          className="flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors mb-3 border-gray-200"
          activeClassName="flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors mb-3 border-dashed border-primary-400 bg-primary-50 ring-2 ring-primary-200"
        >
          <label className="text-sm text-black w-32 flex-shrink-0 flex items-center gap-1">{t.labelTemplateTable}<HelpTip text={t.hintTemplate} label={t.helpTemplate} /></label>
          <button onClick={handleSelectTable2} disabled={isExecuting}
            className="btn-press px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnSelectFile}</button>
          <span className="text-sm text-black truncate flex-1">{table2Path || t.placeholderDragOrClick}</span>
        </NativeDropZone>

        {/* 模板表头行（紧邻模板表地址下方） */}
        <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200 mb-1">
          <label className="text-sm text-black w-32 flex-shrink-0 flex items-center gap-1">{t.labelTemplateHeaderRow}<HelpTip text={t.hintTemplateHeader} label={t.helpTemplateHeader} /></label>
          <input type="number" value={templateHeaderRowIndex}
            onChange={e => handleHeaderRowChange(parseInt(e.target.value) || 0)}
            disabled={isExecuting}
            className="max-w-64 flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
        </div>

        {/* 匹配列 */}
        <div className="space-y-3 mb-1">
          <div className="flex items-center space-x-3">
            <label className="text-sm text-black w-32 flex-shrink-0 flex items-center gap-1">{t.labelMatchFieldTable}<HelpTip text={t.hintMatchField} label={t.helpMatchField} /></label>
            <div className="flex-1">
              <SearchableSelect value={matchFieldTable1} options={table1Columns} onChange={setMatchFieldTable1}
                placeholder={t.selectPlaceholder} disabled={isExecuting} ariaLabel={t.labelMatchFieldTable} />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-black w-32 flex-shrink-0">{t.labelMatchFieldTemplate}</label>
            <div className="flex-1">
              <SearchableSelect value={matchFieldTable2} options={templateColumns} onChange={setMatchFieldTable2}
                placeholder={t.selectPlaceholder} disabled={isExecuting} ariaLabel={t.labelMatchFieldTemplate} />
            </div>
          </div>
        </div>

        {/* 模板匹配图在可视化视图（第 4 步）；执行按钮在标题行 */}

        {/* S4 — 匹配结果 */}
        {s4Dir && !s4Executing && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-black mb-1">{t.resultMatchOutput}</div>
            <button onClick={() => window.electronAPI.shell.openPath(s4Dir)}
              className="text-xs text-primary-700 hover:underline truncate block max-w-md focus-ring rounded">
              {s4Dir}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          S5：字段填充
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-5" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">5</span>
            {t.stepS5Title}
            <HelpTip text={t.stepS5Desc} label={t.helpStepDesc(t.stepS5Title)} />
            <span className="ml-2 text-xs font-normal text-black">{t.stepS5DependsS4}</span>
          </h2>
          <div className="flex-1" />
          {s5FilledFiles.length > 0 && !s5Executing && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.stepDoneS5}
            </span>
          )}
          <button onClick={handleS5Fill} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {s5Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS5}
          </button>
        </div>

        <div className="flex items-center space-x-3 mb-3">
          <label className="text-sm text-black w-32 flex-shrink-0">{t.labelDate}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            disabled={isExecuting}
            className="max-w-64 flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
        </div>

        {/* 自定义填充规则（紧凑摘要行，完整配置收进弹框） */}
          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-black uppercase tracking-wider flex items-center gap-1">{t.sectionAutoInc}<HelpTip text={t.sectionFillRulesHint} label={t.helpAutoInc} /></p>
              <button onClick={handleAddSeq} disabled={isExecuting}
                className="btn-press px-2 py-1 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnAddRule}</button>
            </div>
            <div className="space-y-1.5">
              {seqConfigs.map((cfg, idx) => (
                <div key={cfg.id}
                  draggable={!isExecuting}
                  onDragStart={() => setDraggedSeqId(cfg.id)}
                  onDragOver={e => { e.preventDefault(); if (draggedSeqId && draggedSeqId !== cfg.id) { const from = seqConfigs.findIndex(c => c.id === draggedSeqId); if (from >= 0) handleReorderSeq(from, idx); setDraggedSeqId(cfg.id) } }}
                  onDragEnd={() => setDraggedSeqId(null)}
                  className={`flex items-center gap-2 bg-white rounded-lg border px-2 py-1.5 transition-all duration-150 ${draggedSeqId === cfg.id ? 'border-primary-600 shadow-lg ring-2 ring-primary-300 opacity-80' : 'border-gray-200 hover:border-primary-200'}`}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-black/40 cursor-grab" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5h2v2H9V5zm0 6h2v2H9v-2zm0 6h2v2H9v-2zm4-12h2v2h-2V5zm0 6h2v2h-2v-2zm0 6h2v2h-2v-2z" />
                  </svg>
                  <span className="text-sm font-medium text-black truncate max-w-[10rem]" title={cfg.name}>{cfg.name}</span>
                  <span className="text-xs text-black/70 truncate flex-1 min-w-0">{seqSummary(cfg)}</span>
                  {cfg.id === 'seq-billNo' && (
                    <span className="flex-shrink-0 text-xs text-black/60" title={t.billNoRuleNote}>第 3 步单号依据</span>
                  )}
                  <button onClick={() => setEditingSeqId(cfg.id)} disabled={isExecuting}
                    className="flex-shrink-0 px-2 py-1 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnConfigure}</button>
                  <button onClick={() => handleDeleteSeq(cfg.id)} disabled={isExecuting || seqConfigs.length <= 1}
                    aria-label={`删除编号规则「${cfg.name}」`}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed focus-ring">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* 字段映射 — 数据表取值 */}
          <div className="mb-3">
            <div className="flex items-center space-x-3 mb-1">
              <span className="text-sm font-medium text-black flex items-center gap-1">{t.sectionFieldMappingData}<HelpTip text={t.hintStep5} label={t.helpStep5} /></span>
              <button onClick={() => handleAddMapping('table1')} disabled={isExecuting}
                className="btn-press px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnAddMappingData}</button>
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
                      <label className="text-sm text-black block mb-1">{t.labelTemplateCol}</label>
                      <SearchableSelect value={mapping.templateCol} options={templateColumns}
                        onChange={val => handleUpdateMapping(mapping.id, 'templateCol', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} ariaLabel={t.labelTemplateCol} />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm text-black block mb-1">{t.labelDataTableCol}</label>
                      <SearchableSelect value={mapping.table1Col || ''} options={table1Columns}
                        onChange={val => handleUpdateMapping(mapping.id, 'table1Col', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} ariaLabel={t.labelDataTableCol} />
                    </div>
                    <div className="w-24 flex-shrink-0 pt-5">
                      <button onClick={() => handleDeleteMapping(mapping.id)} disabled={isExecuting}
                        aria-label="删除这条字段映射"
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed focus-ring">{t.btnDelete}</button>
                    </div>
                  </div>
                </div>
              ))}
              {fieldMappings.filter(m => m.sourceType === 'table1').length === 0 && (
                <p className="text-sm text-black text-center py-3">{t.noMappingsData}</p>
              )}
            </div>
          </div>

          {/* 字段映射 — 非数据表取值 */}
          <div className="mb-3">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-sm font-medium text-black">{t.sectionFieldMappingOther}</span>
              <button onClick={() => handleAddMapping('constant')} disabled={isExecuting}
                className="btn-press px-3 py-1.5 text-sm bg-primary-800 text-white rounded hover:bg-primary-700 disabled:cursor-not-allowed focus-ring">{t.btnAddMappingOther}</button>
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
                      <label className="text-sm text-black block mb-1">{t.labelTemplateCol}</label>
                      <SearchableSelect value={mapping.templateCol} options={templateColumns}
                        onChange={val => handleUpdateMapping(mapping.id, 'templateCol', val)}
                        placeholder={t.selectPlaceholder} disabled={isExecuting} ariaLabel={t.labelTemplateCol} />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm text-black block mb-1">{t.labelSourceType}</label>
                      <select value={mapping.sourceType} onChange={e => handleUpdateMapping(mapping.id, 'sourceType', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50">
                        {sourceTypeOptions.filter(o => o.value !== 'table1').map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                      </select>
                    </div>
                    <div className="w-24 flex-shrink-0 pt-5">
                      <button onClick={() => handleDeleteMapping(mapping.id)} disabled={isExecuting}
                        aria-label="删除这条字段映射"
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:cursor-not-allowed focus-ring">{t.btnDelete}</button>
                    </div>
                  </div>
                  {mapping.sourceType === 'constant' && (
                    <div className="mt-3">
                      <label className="text-sm text-black block mb-1">{t.labelConstantValue}</label>
                      <input type="text" value={mapping.constantValue || ''}
                        onChange={e => handleUpdateMapping(mapping.id, 'constantValue', e.target.value)}
                        disabled={isExecuting}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
                    </div>
                  )}
                </div>
              ))}
              {fieldMappings.filter(m => m.sourceType !== 'table1').length === 0 && (
                <p className="text-sm text-black text-center py-3">{t.noMappingsOther}</p>
              )}
            </div>
          </div>

          {/* 字段映射连线图在可视化视图（第 5 步）；这里只保留配置校验提示 */}
          {table1Columns.length === 0 && fieldMappings.some(m => m.sourceType === 'table1') && (
            <p className="text-sm text-red-600 mb-2">{t.needMergedColumns}</p>
          )}
          {incompleteMappingCount > 0 && (
            <p className="text-sm text-red-600 mb-2">{t.incompleteMappings(incompleteMappingCount)}</p>
          )}

        {/* S5 — 填充结果 */}
        {s5FilledFiles.length > 0 && !s5Executing && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-black">{t.resultFilledCount(s5FilledFiles.length)}</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          S6：汇总输出
          ══════════════════════════════════════════════════════ */}
      <div id="step-card-6" className="bg-white rounded-lg border-2 border-blue-200 p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-black flex items-center min-w-0">
            <span className="w-6 h-6 bg-primary-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">6</span>
            {t.stepS6Title}
            <HelpTip text={t.stepS6Desc} label={t.helpStepDesc(t.stepS6Title)} />
            <span className="ml-2 text-xs font-normal text-black">{t.stepS6DependsS5}</span>
          </h2>
          <div className="flex-1" />
          {finalResult && !s6Executing && (
            <span className="text-sm text-success-700 flex items-center flex-shrink-0">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              {t.step2DoneLabel}
            </span>
          )}
          <button onClick={handleS6Export} disabled={isExecuting}
            className="btn-press px-3.5 py-1.5 text-sm font-semibold text-white bg-primary-800 rounded-lg hover:bg-primary-700 shadow-sm disabled:cursor-not-allowed flex items-center flex-shrink-0 focus-ring">
            {s6Executing && (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t.btnExecS6}
          </button>
        </div>

        {/* 输出配置 */}
        <div className="space-y-3 mb-3">
          <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
            <label className="text-sm text-black w-32 flex-shrink-0 flex items-center gap-1">{t.labelOutputDir}<HelpTip text={t.hintOutputDir} label={t.helpOutputDir} /></label>
            <input type="text" value={outputDir} onClick={handleSelectOutputDir} readOnly
              disabled={isExecuting}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50 cursor-pointer"
              placeholder={t.placeholderSelectDir} />
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
            <label className="text-sm text-black w-32 flex-shrink-0">{t.labelOutputPrefix}</label>
            <input type="text" value={outputPrefix} onChange={e => setOutputPrefix(e.target.value)}
              disabled={isExecuting}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
          </div>
        </div>

        {/* 数据转换（可选）：对汇总表数据行做转换，表头不动；不配置则完全不影响导出 */}
        <div className="mb-3 rounded-lg border-2 border-gray-200">
          <button type="button" onClick={() => setShowTransforms(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left focus-ring rounded-lg"
            aria-expanded={showTransforms}>
            <svg className={`w-4 h-4 text-black/60 transition-transform flex-shrink-0 ${showTransforms ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-black">{t.sectionTransforms}</span>
            {transformRules.length > 0 && (
              <span className="text-xs text-black/60">{t.transformCount(transformRules.length)}</span>
            )}
            <HelpTip text={t.hintTransforms} label={t.helpTransforms} />
          </button>
          {showTransforms && (
            <div className="px-3 pb-3 space-y-2">
              {transformRules.length === 0 && (
                <p className="text-sm text-black">{t.transformEmpty}</p>
              )}
              {transformRules.map((rule, idx) => (
                <div key={rule.id} className="flex items-center gap-2 flex-wrap p-2 rounded border border-gray-100 bg-gray-50">
                  <span className="text-xs text-black/60 flex-shrink-0">{t.transformOrder(idx)}</span>
                  <div className="w-48 flex-shrink-0">
                    <SearchableSelect value={rule.targetColumn} options={templateColumns} disabled={isExecuting}
                      onChange={v => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, targetColumn: v } : r))}
                      placeholder={t.transformPickColumn} ariaLabel={t.sectionTransforms} />
                  </div>
                  <select value={rule.op} disabled={isExecuting}
                    onChange={e => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, op: e.target.value as TransformOp } : r))}
                    className="px-2 py-1 text-sm border border-gray-200 rounded bg-white focus-ring">
                    <option value="textToNumber">{t.opTextToNumber}</option>
                    <option value="numberToText">{t.opNumberToText}</option>
                    <option value="replace">{t.opReplace}</option>
                    <option value="formula">{t.opFormula}</option>
                  </select>
                  {rule.op === 'replace' && (
                    <>
                      <input type="text" value={rule.find || ''} disabled={isExecuting}
                        onChange={e => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, find: e.target.value } : r))}
                        placeholder={t.transformFind}
                        className="px-2 py-1 text-sm border border-gray-200 rounded focus-ring w-32" />
                      <span className="text-xs text-black/60">→</span>
                      <input type="text" value={rule.replaceWith || ''} disabled={isExecuting}
                        onChange={e => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, replaceWith: e.target.value } : r))}
                        placeholder={t.transformReplaceWith}
                        className="px-2 py-1 text-sm border border-gray-200 rounded focus-ring w-32" />
                      <label className="flex items-center gap-1 text-xs text-black cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4" checked={!!rule.useRegex} disabled={isExecuting}
                          onChange={e => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, useRegex: e.target.checked } : r))} />
                        {t.transformUseRegex}
                      </label>
                    </>
                  )}
                  {rule.op === 'formula' && (
                    <input type="text" value={rule.expr || ''} disabled={isExecuting}
                      onChange={e => setTransformRules(prev => prev.map(r => r.id === rule.id ? { ...r, expr: e.target.value } : r))}
                      placeholder={t.transformExprPlaceholder} title={t.transformExprHint}
                      className="flex-1 min-w-[16rem] px-2 py-1 text-sm border border-gray-200 rounded focus-ring" />
                  )}
                  <div className="flex-1" />
                  <button onClick={() => setTransformRules(prev => prev.filter(r => r.id !== rule.id))} disabled={isExecuting}
                    className="btn-press px-2 py-1 text-sm text-red-700 hover:bg-red-50 rounded focus-ring flex-shrink-0">{t.btnDelete}</button>
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setTransformRules(prev => [...prev, { id: newId(), targetColumn: '', op: 'textToNumber' }])}
                  disabled={isExecuting}
                  className="btn-press px-3 py-1.5 text-sm text-primary-700 border border-primary-200 rounded hover:bg-primary-50 focus-ring disabled:opacity-50">
                  {t.transformAdd}
                </button>
                {transformRules.some(r => r.op === 'formula') && (
                  <span className="text-xs text-black/60">{t.transformExprHint}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* S6 — 最终结果 */}
        {finalResult && (
          <div className="bg-success-50 border border-success-200 rounded-lg p-4">
            {finalResult.fallbackWarning && (
              <div className="mb-2 text-sm text-black bg-amber-50 px-2 py-1 rounded">{finalResult.fallbackWarning}</div>
            )}
            {finalResult.transformWarning && (
              <div className="mb-2 text-sm text-black bg-amber-50 px-2 py-1 rounded">{finalResult.transformWarning}</div>
            )}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-sm font-semibold text-success-800 flex items-center">
                <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                {t.resultStep2DoneOutput}
              </span>
              <button onClick={handleOpenFinalOutput}
                className="btn-press px-3 py-1.5 text-sm text-white bg-primary-800 rounded hover:bg-primary-700 focus-ring">{t.btnOpenOutput}</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white rounded p-2 text-center border border-success-100">
                <p className="text-base font-bold text-black">{finalResult.totalOrders}</p>
                <p className="text-xs text-black">{t.statSplitOrders}</p>
              </div>
              <div className="bg-white rounded p-2 text-center border border-success-100">
                <p className="text-base font-bold text-black">{finalResult.totalRows}</p>
                <p className="text-xs text-black">{t.statOutputRows}</p>
              </div>
            </div>
            <div>
              <div className="text-xs text-black mb-1">{t.statOutputFile}</div>
              <button onClick={() => window.electronAPI.shell.openPath(finalResult.outputPath)}
                className="text-xs text-primary-700 hover:underline truncate block max-w-xs focus-ring rounded" title={finalResult.outputPath}>
                {finalResult.outputPath}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          执行进度（任一步骤运行时显示，统一日志区）——置于页面底部
          ══════════════════════════════════════════════════════ */}
      {(isExecuting || mergeProgressLogs.length > 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3" aria-live="polite">
          {executePhase && (
            <div className="text-sm text-black font-medium mb-3 flex items-center">
              {isExecuting && (
                <svg className="animate-spin h-4 w-4 mr-2 text-primary-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {executePhase}
            </div>
          )}

          {/* 合并进度条（第 1、2 步共用） */}
          {(step1Executing || auxJoinExecuting) && mergeProgress && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-black mb-1">
                <span>{mergeProgress.step || ''}</span>
                <span className="font-medium text-black">{mergeProgress.overallProgress || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={mergeProgress.overallProgress || 0} aria-valuemin={0} aria-valuemax={100}>
                <div className="bg-primary-700 h-2 rounded-full transition-all duration-300" style={{ width: `${mergeProgress?.overallProgress || 0}%` }} />
              </div>
            </div>
          )}

          {/* 执行记录（用句子而不是终端日志，逐条带状态图标） */}
          {mergeProgressLogs.length > 0 && (
            <ol className="bg-gray-50 border border-gray-100 rounded p-3 max-h-40 overflow-y-auto space-y-1.5">
              {mergeProgressLogs.map((log, i) => {
                const running = /…$/.test(log)
                return (
                  <li key={i} className="flex items-start gap-2 text-xs text-black">
                    {running ? (
                      <svg className="animate-spin h-4 w-4 mt-0.5 text-primary-700 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 mt-0.5 text-success-700 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                    <span className="leading-snug break-all">{log}</span>
                  </li>
                )
              })}
              <div ref={mergeLogsEndRef} />
            </ol>
          )}

        </div>
      )}
        </div>
      )}

    </div>
  )
}

export default CombinedPage
