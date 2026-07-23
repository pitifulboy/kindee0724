import React, { useState, useEffect, useRef } from 'react'
import SearchableSelect from '../components/SearchableSelect'

type SourceType = 'table1' | 'constant' | 'billNo' | 'detailSeq' | 'financialSeq' | 'date' | 'materialCode' | 'materialName'

interface FieldMapping {
  id: string
  templateCol: string
  sourceType: SourceType
  table1Col?: string
  constantValue?: string
  financialSeqOffset?: number
}

interface MaterialMatchConfig {
  enabled: boolean
  codeTable1Col: string
  codeTemplateCol: string
  nameTemplateCol: string
  nameFallbackTable1Col: string
}

interface KingdeeImportPreset {
  name: string
  table1Path: string
  table2Path: string
  outputDir: string
  outputPrefix: string
  startBillNo: number
  date: string
  matchMode: 'fill' | 'strict'
  groupByColumn: string
  matchFieldTable1: string
  matchFieldTable2: string
  templateHeaderRowIndex: number
  templateDataStartRowIndex: number
  materialMatch: MaterialMatchConfig
  fieldMappings: FieldMapping[]
  textFormatColumns: string[]
}

interface StepResult {
  step: number
  outputPath: string
  data: any
}

const sourceTypeOptions = [
  { value: 'table1', label: '数据表取值' },
  { value: 'constant', label: '常量值' },
  { value: 'billNo', label: '单号自增' },
  { value: 'detailSeq', label: '明细序号自增' },
  { value: 'financialSeq', label: '财务序号(单号+偏移)' },
  { value: 'date', label: '日期' },
  { value: 'materialCode', label: '物料编码' },
  { value: 'materialName', label: '物料名称(查模板)' },
]

const RECOMMENDED_CONFIG = {
  groupByColumn: '采购单号',
  matchFieldTable1: '金蝶物料编码',
  matchFieldTable2: '*(订单明细)物料编码#编码',
  textFormatColumns: [
    '*(订单明细)物料编码#编码',
    '*(基本信息)客户#编码',
    '(基本信息)收货方#编码',
    '(基本信息)结算方#编码',
    '(基本信息)付款方#编码',
    '*(基本信息)交货地点#编码',
  ],
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

const KingdeeImportPage: React.FC = () => {
  const [presetName, setPresetName] = useState('')
  const [presetList, setPresetList] = useState<{ name: string; lastModified: string }[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  const [table1Path, setTable1Path] = useState('')
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
  const [textFormatColumns, setTextFormatColumns] = useState<string[]>([])
  const [newTextCol, setNewTextCol] = useState('')

  const [table1Columns, setTable1Columns] = useState<string[]>([])
  const [templateColumns, setTemplateColumns] = useState<string[]>([])

  const [stepResults, setStepResults] = useState<StepResult[]>([])
  const stepResultsRef = useRef<StepResult[]>([])
  const [currentRunningStep, setCurrentRunningStep] = useState<number | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // 可拖拽浮动按钮
  const [btnPos, setBtnPos] = useState(() => {
    try {
      const saved = localStorage.getItem('kingdee-import-btn-pos')
      return saved ? JSON.parse(saved) : { x: window.innerWidth - 100, y: 80 }
    } catch {
      return { x: window.innerWidth - 100, y: 80 }
    }
  })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const dragDist = useRef(0)

  const handleBtnMouseDown = (e: React.MouseEvent) => {
    isDragging.current = false
    dragDist.current = 0
    dragStart.current = { x: e.clientX, y: e.clientY, posX: btnPos.x, posY: btnPos.y }
    document.addEventListener('mousemove', handleBtnMouseMove)
    document.addEventListener('mouseup', handleBtnMouseUp)
  }

  const handleBtnMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    dragDist.current = Math.abs(dx) + Math.abs(dy)
    if (dragDist.current > 5) isDragging.current = true
    const newX = Math.max(0, Math.min(window.innerWidth - 80, dragStart.current.posX + dx))
    const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStart.current.posY + dy))
    setBtnPos({ x: newX, y: newY })
  }

  const handleBtnMouseUp = () => {
    document.removeEventListener('mousemove', handleBtnMouseMove)
    document.removeEventListener('mouseup', handleBtnMouseUp)
    if (isDragging.current) {
      try {
        localStorage.setItem('kingdee-import-btn-pos', JSON.stringify(btnPos))
      } catch {}
    }
  }

  useEffect(() => {
    const init = async () => {
      await refreshPresetList()
    }
    init()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const refreshPresetList = async () => {
    const res = await window.electronAPI.kingdeeImport.listPresets()
    if (res.success && res.data) {
      setPresetList(res.data)
    }
  }

  const handleSelectTable1 = async () => {
    const res = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
    })
    if (!res.canceled && res.filePaths.length > 0) {
      const fp = res.filePaths[0]
      setTable1Path(fp)
      const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(fp)
      if (colRes.success && colRes.data) {
        setTable1Columns(colRes.data)
      } else if (colRes.error) {
        setToast({ type: 'error', msg: colRes.error })
      }
      setOutputDir(fp.substring(0, fp.lastIndexOf('\\')))
    }
  }

  const table1DropRef = useRef<HTMLDivElement>(null)
  const [table1DragOver, setTable1DragOver] = useState(false)

  useEffect(() => {
    const el = table1DropRef.current
    if (!el) return

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setTable1DragOver(true)
    }
    const onDragLeave = () => setTable1DragOver(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      setTable1DragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        const fp = (files[0] as any).path
        if (fp && (fp.endsWith('.xlsx') || fp.endsWith('.xls'))) {
          setTable1Path(fp)
          const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(fp)
          if (colRes.success && colRes.data) {
            setTable1Columns(colRes.data)
          } else if (colRes.error) {
            setToast({ type: 'error', msg: colRes.error })
          }
          setOutputDir(fp.substring(0, fp.lastIndexOf('\\')))
        } else {
          setToast({ type: 'error', msg: '请拖入Excel文件（.xlsx或.xls）' })
        }
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [outputDir])

  const table2DropRef = useRef<HTMLDivElement>(null)
  const [table2DragOver, setTable2DragOver] = useState(false)

  useEffect(() => {
    const el = table2DropRef.current
    if (!el) return

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setTable2DragOver(true)
    }
    const onDragLeave = () => setTable2DragOver(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      setTable2DragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        const fp = (files[0] as any).path
        if (fp && (fp.endsWith('.xlsx') || fp.endsWith('.xls'))) {
          setTable2Path(fp)
          const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
          if (colRes.success && colRes.data) {
            setTemplateColumns(colRes.data)
          }
        } else {
          setToast({ type: 'error', msg: '请拖入Excel文件（.xlsx或.xls）' })
        }
      }
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [templateHeaderRowIndex])

  const handleSelectTable2 = async () => {
    const res = await window.electronAPI.dialog.openFiles({
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
    })
    if (!res.canceled && res.filePaths.length > 0) {
      const fp = res.filePaths[0]
      setTable2Path(fp)
      const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(fp, templateHeaderRowIndex)
      if (colRes.success && colRes.data) {
        setTemplateColumns(colRes.data)
      }
    }
  }

  const handleSelectOutputDir = async () => {
    const res = await window.electronAPI.dialog.openFolder()
    if (!res.canceled && res.filePaths.length > 0) {
      setOutputDir(res.filePaths[0])
    }
  }

  const handleHeaderRowChange = async (val: number) => {
    setTemplateHeaderRowIndex(val)
    if (table2Path) {
      const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(table2Path, val)
      if (colRes.success && colRes.data) {
        setTemplateColumns(colRes.data)
      }
    }
  }

  const handleAddMapping = () => {
    setFieldMappings(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateCol: '',
      sourceType: 'table1',
      table1Col: ''
    }])
  }

  const handleUpdateMapping = (id: string, field: string, value: any) => {
    setFieldMappings(prev => prev.map(m =>
      m.id === id ? { ...m, [field]: value } : m
    ))
  }

  const handleDeleteMapping = (id: string) => {
    setFieldMappings(prev => prev.filter(m => m.id !== id))
  }

  const handleAddTextColumn = () => {
    if (newTextCol && !textFormatColumns.includes(newTextCol)) {
      setTextFormatColumns(prev => [...prev, newTextCol])
      setNewTextCol('')
    }
  }

  const handleRemoveTextColumn = (col: string) => {
    setTextFormatColumns(prev => prev.filter(c => c !== col))
  }

  const handleSavePreset = async () => {
    const name = newPresetName.trim()
    if (!name) { setToast({ type: 'error', msg: '请输入预设名称' }); return }

    try {
      const config: KingdeeImportPreset = {
        name,
        table1Path, table2Path, outputDir, outputPrefix,
        startBillNo, date, matchMode: 'fill', groupByColumn,
        matchFieldTable1, matchFieldTable2,
        templateHeaderRowIndex, templateDataStartRowIndex,
        materialMatch: {
          enabled: false,
          codeTable1Col: '',
          codeTemplateCol: '',
          nameTemplateCol: '',
          nameFallbackTable1Col: ''
        },
        fieldMappings,
        textFormatColumns
      }

      const res = await window.electronAPI.kingdeeImport.savePreset(config)
      if (res.success) {
        setToast({ type: 'success', msg: `预设"${name}"已保存` })
        setPresetName(name)
        setShowSaveDialog(false)
        setNewPresetName('')
        await refreshPresetList()
      } else {
        setToast({ type: 'error', msg: res.error || '保存预设失败' })
      }
    } catch (e: any) {
      setToast({ type: 'error', msg: `保存预设时发生错误: ${e.message}` })
    }
  }

  const handleLoadRecommendedConfig = () => {
    setGroupByColumn(RECOMMENDED_CONFIG.groupByColumn)
    setMatchFieldTable1(RECOMMENDED_CONFIG.matchFieldTable1)
    setMatchFieldTable2(RECOMMENDED_CONFIG.matchFieldTable2)
    setTextFormatColumns(RECOMMENDED_CONFIG.textFormatColumns)
    const mappings: FieldMapping[] = RECOMMENDED_CONFIG.fieldMappings.map((m, i) => ({
      id: `rec-${Date.now()}-${i}`,
      ...m,
    }))
    setFieldMappings(mappings)
    setToast({ type: 'success', msg: '已加载推荐配置' })
  }

  const handleLoadPreset = async (name: string) => {
    if (!name) return
    const res = await window.electronAPI.kingdeeImport.getPreset(name)
    if (res.success && res.data) {
      const c = res.data as KingdeeImportPreset
      setPresetName(name)
      setTable1Path(c.table1Path || '')
      setTable2Path(c.table2Path || '')
      setOutputDir(c.outputDir || '')
      setOutputPrefix(c.outputPrefix || '完成_批量金蝶导入')
      setStartBillNo(c.startBillNo || 111111)
      setDate(c.date || new Date().toISOString().slice(0, 10))
      setGroupByColumn(c.groupByColumn || '')
      setMatchFieldTable1(c.matchFieldTable1 || '')
      setMatchFieldTable2(c.matchFieldTable2 || '')
      setTemplateHeaderRowIndex(c.templateHeaderRowIndex ?? 1)
      setTemplateDataStartRowIndex(c.templateDataStartRowIndex ?? 2)
      setFieldMappings(c.fieldMappings || [])
      setTextFormatColumns(c.textFormatColumns || [])

      if (c.table1Path) {
        try {
          const colRes = await window.electronAPI.kingdeeImport.getTable1Columns(c.table1Path)
          if (colRes.success && colRes.data) setTable1Columns(colRes.data)
        } catch {}
      }
      if (c.table2Path) {
        try {
          const colRes = await window.electronAPI.kingdeeImport.getTemplateColumns(
            c.table2Path, c.templateHeaderRowIndex ?? 1
          )
          if (colRes.success && colRes.data) setTemplateColumns(colRes.data)
        } catch {}
      }

      setToast({ type: 'success', msg: `已加载预设"${name}"` })
    }
  }

  const handleDeletePreset = async () => {
    if (!presetName) { setToast({ type: 'error', msg: '请先选择预设' }); return }
    const res = await window.electronAPI.kingdeeImport.deletePreset(presetName)
    if (res.success) {
      setToast({ type: 'success', msg: `预设"${presetName}"已删除` })
      setPresetName('')
      await refreshPresetList()
    }
  }

  const handleExecuteStep = async (step: number): Promise<boolean> => {
    if (currentRunningStep) {
      setToast({ type: 'error', msg: '当前有步骤正在执行' })
      return false
    }

    stepResultsRef.current = stepResultsRef.current.filter(r => r.step !== step)
    setStepResults(prev => prev.filter(r => r.step !== step))
    setCurrentRunningStep(step)

    try {
      // 中间步骤使用临时目录，仅步骤3输出到用户指定目录
      const stepOutputDir = step === 3 ? outputDir : await window.electronAPI.app.getPath('temp')

      let result: any
      switch (step) {
        case 1:
          if (!table1Path || !groupByColumn || !outputDir) {
            setToast({ type: 'error', msg: '请先选择数据表、分组列和输出目录' })
            return false
          }
          result = await window.electronAPI.kingdeeImport.step1({
            table1Path, groupByColumn, startBillNo, outputDir: stepOutputDir
          })
          break
        case 21:
          if (!table1Path || !table2Path || !groupByColumn || !matchFieldTable1 || !matchFieldTable2 || !outputDir) {
            setToast({ type: 'error', msg: '请先选择数据表、模板表、分组列、匹配字段和输出目录' })
            return false
          }
          result = await window.electronAPI.kingdeeImport.step2a({
            table1Path, table2Path, groupByColumn,
            matchFieldTable1, matchFieldTable2,
            startBillNo, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: stepOutputDir
          })
          break
        case 22: {
          const r21 = stepResultsRef.current.find(r => r.step === 21)
          if (!r21) { setToast({ type: 'error', msg: '请先执行步骤2a (Join)' }); return false }
          result = await window.electronAPI.kingdeeImport.step2b({ inputDir: r21.data.outputPath.replace(/\\[^\\]+$/, ''), outputDir: stepOutputDir })
          break
        }
        case 23: {
          const r22 = stepResultsRef.current.find(r => r.step === 22)
          if (!r22) { setToast({ type: 'error', msg: '请先执行步骤2b (删除未匹配)' }); return false }
          if (fieldMappings.length === 0) { setToast({ type: 'error', msg: '请至少配置一个字段映射' }); return false }
          result = await window.electronAPI.kingdeeImport.step2c({
            inputDir: r22.data.outputPath.replace(/\\[^\\]+$/, ''),
            fieldMappings, date,
            matchFieldTable1, matchFieldTable2,
            templateHeaderRowIndex, templateDataStartRowIndex,
            table2Path, outputDir: stepOutputDir
          })
          break
        }
        case 24: {
          const r23 = stepResultsRef.current.find(r => r.step === 23)
          if (!r23) { setToast({ type: 'error', msg: '请先执行步骤2c (填充数据)' }); return false }
          result = await window.electronAPI.kingdeeImport.step2d({
            inputDir: r23.data.outputPath.replace(/\\[^\\]+$/, ''),
            table2Path, templateHeaderRowIndex, templateDataStartRowIndex, outputDir: stepOutputDir
          })
          break
        }
        case 3: {
          const r24 = stepResultsRef.current.find(r => r.step === 24)
          if (!r24 || !r24.data?.filledTemplateFiles) {
            setToast({ type: 'error', msg: '请先执行步骤2d (恢复结构)' })
            return false
          }
          if (!outputDir) { setToast({ type: 'error', msg: '请先选择输出目录' }); return false }
          result = await window.electronAPI.kingdeeImport.step3({
            table2Path,
            filledTemplateFiles: r24.data.filledTemplateFiles.map((ft: any) => ({ filePath: ft.filePath })),
            templateHeaderRowIndex, templateDataStartRowIndex,
            outputDir, outputPrefix, textFormatColumns
          })
          break
        }
      }

      if (result?.success && result.data) {
        const newResult = { step, outputPath: result.data.outputPath, data: result.data }
        stepResultsRef.current = [...stepResultsRef.current, newResult]
        setStepResults(prev => [...prev, newResult])
        const label = step === 21 ? '2a' : step === 22 ? '2b' : step === 23 ? '2c' : step === 24 ? '2d' : String(step)
        setToast({ type: 'success', msg: `步骤${label}执行完成！` })
        return true
      } else if (result?.error) {
        setToast({ type: 'error', msg: result.error })
        return false
      }
      return false
    } catch (e: any) {
      setToast({ type: 'error', msg: e.message })
      return false
    } finally {
      setCurrentRunningStep(null)
    }
  }

  const handleOpenOutputFile = async (outputPath: string) => {
    await window.electronAPI.shell.openPath(outputPath)
  }

  const handleOpenOutputDir = async () => {
    const step3Result = stepResults.find(r => r.step === 3)
    if (step3Result?.outputPath) {
      const dir = step3Result.outputPath.substring(0, step3Result.outputPath.lastIndexOf('\\'))
      await window.electronAPI.shell.openPath(dir)
    }
  }

  const handleBatchExecuteAll = async () => {
    if (!table1Path || !table2Path || !groupByColumn || !matchFieldTable1 || !matchFieldTable2 || !outputDir) {
      setToast({ type: 'error', msg: '请先配置数据表、模板表、分组列、匹配字段和输出目录' })
      return
    }
    if (fieldMappings.length === 0) {
      setToast({ type: 'error', msg: '请至少配置一个字段映射' })
      return
    }

    // 步骤1: 拆分订单
    const ok1 = await handleExecuteStep(1)
    if (!ok1) {
      setToast({ type: 'error', msg: '步骤1（订单拆分）执行失败，已终止' })
      return
    }

    // 步骤2a-2d
    const steps = [21, 22, 23, 24]
    for (const step of steps) {
      const ok = await handleExecuteStep(step)
      if (!ok) {
        const label = step === 21 ? '2a' : step === 22 ? '2b' : step === 23 ? '2c' : '2d'
        setToast({ type: 'error', msg: `步骤${label}执行失败，已终止批量执行` })
        return
      }
    }
    setToast({ type: 'success', msg: '步骤2a-2d 执行完成，开始执行步骤3...' })
    // 自动执行步骤3
    const ok3 = await handleExecuteStep(3)
    if (!ok3) {
      setToast({ type: 'error', msg: '步骤2a-2d 执行成功，但步骤3（汇总）执行失败' })
    }
  }

  const getStepResult = (step: number) => stepResults.find(r => r.step === step)

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 预设行 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-700">预设:</span>
          <div className="w-56">
            <SearchableSelect
              value={presetName}
              options={presetList.map(p => p.name)}
              onChange={handleLoadPreset}
              placeholder="— 选择预设 —"
              disabled={currentRunningStep !== null}
            />
          </div>
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={currentRunningStep !== null}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            保存
          </button>
          <button
            onClick={handleDeletePreset}
            disabled={currentRunningStep !== null || !presetName}
            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            删除
          </button>
          <button
            onClick={() => setPresetName('')}
            disabled={currentRunningStep !== null}
            className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
          >
            新建
          </button>
          <button
            onClick={handleLoadRecommendedConfig}
            disabled={currentRunningStep !== null}
            className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
          >
            加载推荐配置
          </button>
        </div>
      </div>

      {/* 一键执行按钮（可拖拽浮动） */}
      <button
        onMouseDown={handleBtnMouseDown}
        onClick={() => { if (!isDragging.current) handleBatchExecuteAll() }}
        disabled={currentRunningStep !== null || !table1Path || !table2Path || !groupByColumn || !matchFieldTable1 || !matchFieldTable2 || fieldMappings.length === 0 || !outputDir}
        className="fixed flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 shadow-lg z-50 select-none cursor-grab active:cursor-grabbing"
        style={{ width: '2cm', height: '2cm', left: btnPos.x, top: btnPos.y }}
        title="拖拽移动位置 | 点击一键执行"
      >
        {currentRunningStep !== null ? (
          <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </button>

      {/* 执行结果通知 */}
      {getStepResult(3) && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          {getStepResult(3)!.data?.fallbackWarning && (
            <div className="mb-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              {getStepResult(3)!.data.fallbackWarning}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-green-800 mb-1">汇总输出文件:</div>
              <button
                onClick={() => handleOpenOutputFile(getStepResult(3)!.outputPath)}
                className="text-xs text-green-600 hover:text-green-800 truncate block"
              >
                {getStepResult(3)!.outputPath}
              </button>
              {getStepResult(3)!.data && (
                <div className="mt-2 text-xs text-green-600">
                  合并订单数: {getStepResult(3)!.data.totalOrders} · 输出行数: {getStepResult(3)!.data.totalRows}
                </div>
              )}
            </div>
            <button
              onClick={handleOpenOutputDir}
              className="text-xs text-green-700 hover:text-green-900 underline"
            >
              打开输出目录
            </button>
          </div>
        </div>
      )}

      {/* 各步骤状态简示 */}
      {[21, 22, 23, 24, 3].some(s => getStepResult(s)) && (
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          {[21, 22, 23, 24, 3].map(s => {
            const r = getStepResult(s)
            const label = s === 21 ? '2a' : s === 22 ? '2b' : s === 23 ? '2c' : s === 24 ? '2d' : '3'
            return r ? (
              <span key={s} className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded">
                ✓ 步骤{label}
              </span>
            ) : null
          })}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">文件路径&名称配置</h3>
        <div className="space-y-3">
          <div
            ref={table1DropRef}
            className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
              table1DragOver ? 'border-blue-400 bg-blue-50 border-dashed' : 'border-gray-200'
            }`}
          >
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">数据表(Table1):</label>
            <button
              onClick={handleSelectTable1}
              disabled={currentRunningStep !== null}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              选择文件
            </button>
            <span className="text-sm text-gray-500 truncate flex-1">{table1Path || '拖入文件或点击选择'}</span>
          </div>
          <div
            ref={table2DropRef}
            className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-colors ${
              table2DragOver ? 'border-blue-400 bg-blue-50 border-dashed' : 'border-gray-200'
            }`}
          >
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板表(Table2):</label>
            <button
              onClick={handleSelectTable2}
              disabled={currentRunningStep !== null}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              选择文件
            </button>
            <span className="text-sm text-gray-500 truncate flex-1">{table2Path || '拖入文件或点击选择'}</span>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">输出目录:</label>
            <input
              type="text"
              value={outputDir}
              onClick={handleSelectOutputDir}
              readOnly
              disabled={currentRunningStep !== null}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50 cursor-pointer"
              placeholder="点击选择目录"
            />
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">输出文件前缀:</label>
            <input
              type="text"
              value={outputPrefix}
              onChange={e => setOutputPrefix(e.target.value)}
              disabled={currentRunningStep !== null}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
            />
          </div>
        </div>
      </div>

      {/* 客户订单拆分字段配置 */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">客户订单拆分字段配置</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-28 flex-shrink-0">起始单号:</label>
            <input
              type="number"
              value={startBillNo}
              onChange={e => setStartBillNo(parseInt(e.target.value) || 0)}
              disabled={currentRunningStep !== null}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-28 flex-shrink-0">分组列:</label>
            <div className="flex-1">
              <SearchableSelect
                value={groupByColumn}
                options={table1Columns}
                onChange={setGroupByColumn}
                placeholder="— 选择列 —"
                disabled={currentRunningStep !== null}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 表格字段配置 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">表格字段配置</h3>

        {/* 匹配配置 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">数据表匹配字段:</label>
            <div className="flex-1">
              <SearchableSelect
                value={matchFieldTable1}
                options={table1Columns}
                onChange={setMatchFieldTable1}
                placeholder="— 选择数据表列 —"
                disabled={currentRunningStep !== null}
              />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板匹配字段:</label>
            <div className="flex-1">
              <SearchableSelect
                value={matchFieldTable2}
                options={templateColumns}
                onChange={setMatchFieldTable2}
                placeholder="— 选择模板列 —"
                disabled={currentRunningStep !== null}
              />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">模板表头行:</label>
            <input
              type="number"
              value={templateHeaderRowIndex}
              onChange={e => handleHeaderRowChange(parseInt(e.target.value) || 0)}
              disabled={currentRunningStep !== null}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="text-sm text-gray-600 w-32 flex-shrink-0">数据起始行:</label>
            <input
              type="number"
              value={templateDataStartRowIndex}
              onChange={e => setTemplateDataStartRowIndex(parseInt(e.target.value) || 0)}
              disabled={currentRunningStep !== null}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* 日期 */}
        <div className="flex items-center space-x-3 mb-4">
          <label className="text-sm text-gray-600 w-32 flex-shrink-0">日期:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            disabled={currentRunningStep !== null}
            className="w-52 px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
          />
        </div>

        {/* 字段映射 */}
        <div className="mb-4">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-sm font-medium text-gray-700">字段映射:</span>
            <button
              onClick={handleAddMapping}
              disabled={currentRunningStep !== null}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              + 添加映射
            </button>
          </div>
          <div className="space-y-2">
            {fieldMappings.map((mapping) => (
              <div key={mapping.id} className="border border-gray-200 rounded p-3 bg-white">
                <div className="flex items-start space-x-3 gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">模板列</label>
                    <SearchableSelect
                      value={mapping.templateCol}
                      options={templateColumns}
                      onChange={(val) => handleUpdateMapping(mapping.id, 'templateCol', val)}
                      placeholder="— 选择模板列 —"
                      disabled={currentRunningStep !== null}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">来源类型</label>
                    <select
                      value={mapping.sourceType}
                      onChange={e => handleUpdateMapping(mapping.id, 'sourceType', e.target.value)}
                      disabled={currentRunningStep !== null}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
                    >
                      {sourceTypeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24 flex-shrink-0 pt-5">
                    <button
                      onClick={() => handleDeleteMapping(mapping.id)}
                      disabled={currentRunningStep !== null}
                      className="px-3 py-1.5 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200 disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
                {(mapping.sourceType === 'table1' || mapping.sourceType === 'materialCode' || mapping.sourceType === 'materialName') && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 block mb-1">数据表列</label>
                    <SearchableSelect
                      value={mapping.table1Col || ''}
                      options={table1Columns}
                      onChange={(val) => handleUpdateMapping(mapping.id, 'table1Col', val)}
                      placeholder="— 选择数据表列 —"
                      disabled={currentRunningStep !== null}
                    />
                  </div>
                )}
                {mapping.sourceType === 'constant' && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 block mb-1">常量值</label>
                    <input
                      type="text"
                      value={mapping.constantValue || ''}
                      onChange={e => handleUpdateMapping(mapping.id, 'constantValue', e.target.value)}
                      disabled={currentRunningStep !== null}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
                    />
                  </div>
                )}
                {mapping.sourceType === 'financialSeq' && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 block mb-1">偏移量(默认1)</label>
                    <input
                      type="number"
                      value={mapping.financialSeqOffset ?? 1}
                      onChange={e => handleUpdateMapping(mapping.id, 'financialSeqOffset', parseInt(e.target.value) || 1)}
                      disabled={currentRunningStep !== null}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
                    />
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
              <SearchableSelect
                value={newTextCol}
                options={templateColumns}
                onChange={setNewTextCol}
                placeholder="— 选择列 —"
                disabled={currentRunningStep !== null}
              />
            </div>
            <button
              onClick={handleAddTextColumn}
              disabled={currentRunningStep !== null || !newTextCol}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              添加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {textFormatColumns.map(col => (
              <span
                key={col}
                className="inline-flex items-center px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded"
              >
                {col}
                <button
                  onClick={() => handleRemoveTextColumn(col)}
                  disabled={currentRunningStep !== null}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">保存预设</h3>
            <input
              type="text"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              placeholder="请输入预设名称"
              className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-blue-400 mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowSaveDialog(false); setNewPresetName('') }}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleSavePreset}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default KingdeeImportPage
