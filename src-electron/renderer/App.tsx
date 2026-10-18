import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import CombinedPage from './pages/CombinedPage'
import HelpTip from './components/combined/HelpTip'
import SettingsDialog from './components/combined/SettingsDialog'
import { BUILTIN_SCHEMES, DEFAULT_SCHEME, applySchemeVars } from './components/combined/SettingsDialog'
import type { ColorScheme, SchemeColors } from './components/combined/SettingsDialog'
import { app as appText, message as msg, sidebar, combinedPage } from './config/appText'
import { newId } from './utils/id'

/** 视图模式记忆键：分步操作 / 建模视图（下次打开保持上次选择） */
const VIEW_MODE_KEY = 'xwzs:combined:viewMode'
/** 个人设置记忆键：用户配色方案列表 / 当前活动方案 id */
const SCHEMES_KEY = 'xwzs:settings:colorSchemes'
const ACTIVE_SCHEME_KEY = 'xwzs:settings:activeSchemeId'

interface ProjectItem {
  id: string
  name: string
  step1Preset: any
  step2Preset: any
  createdAt: string
  updatedAt: string
}

interface ProjectListItem {
  id: string
  name: string
  updatedAt: string
}

const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [viewMode, setViewMode] = useState<'step' | 'model'>(() => {
    try { return localStorage.getItem(VIEW_MODE_KEY) === 'model' ? 'model' : 'step' } catch { return 'step' }
  })
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode) } catch { /* 忽略不可用场景 */ }
  }, [viewMode])

  // 个人设置：配色方案（默认方案锁定 + 用户另存方案；localStorage 持久化，改动立即生效）
  const [userSchemes, setUserSchemes] = useState<ColorScheme[]>(() => {
    try {
      const raw = localStorage.getItem(SCHEMES_KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr.filter((s: ColorScheme) => s && s.id && !s.locked) : []
    } catch { return [] }
  })
  const [activeSchemeId, setActiveSchemeId] = useState<string>(() => {
    try { return localStorage.getItem(ACTIVE_SCHEME_KEY) || 'default' } catch { return 'default' }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  const allSchemes = useMemo(() => [...BUILTIN_SCHEMES, ...userSchemes], [userSchemes])
  const activeScheme = useMemo(
    () => allSchemes.find(s => s.id === activeSchemeId) ?? DEFAULT_SCHEME,
    [allSchemes, activeSchemeId],
  )

  // 方案颜色写入 CSS 变量（tailwind primary 各阶引用这些变量，按钮/边框/浅底随方案换色）
  useEffect(() => { applySchemeVars(activeScheme.colors) }, [activeScheme.colors])

  useEffect(() => {
    try { localStorage.setItem(SCHEMES_KEY, JSON.stringify(userSchemes)) } catch { /* 忽略不可用场景 */ }
  }, [userSchemes])

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_SCHEME_KEY, activeSchemeId) } catch { /* 忽略不可用场景 */ }
  }, [activeSchemeId])

  // 编辑当前用户方案颜色（默认方案锁定，不会触发）
  const handleUpdateColors = useCallback((colors: SchemeColors) => {
    setUserSchemes(prev => prev.map(s => (s.id === activeSchemeId ? { ...s, colors } : s)))
  }, [activeSchemeId])

  // 复制当前方案（含默认）为新方案并激活
  const handleDuplicateScheme = useCallback(() => {
    const copy: ColorScheme = {
      id: newId(),
      name: `${activeScheme.name}副本`,
      locked: false,
      colors: { ...activeScheme.colors },
    }
    setUserSchemes(prev => [...prev, copy])
    setActiveSchemeId(copy.id)
  }, [activeScheme])

  // 另存当前方案为新名称方案并激活
  const handleSaveAsScheme = useCallback((name: string) => {
    const copy: ColorScheme = { id: newId(), name, locked: false, colors: { ...activeScheme.colors } }
    setUserSchemes(prev => [...prev, copy])
    setActiveSchemeId(copy.id)
  }, [activeScheme])

  // 删除用户方案（删除当前方案时回到默认）
  const handleDeleteScheme = useCallback((id: string) => {
    setUserSchemes(prev => prev.filter(s => s.id !== id))
    setActiveSchemeId(prev => (prev === id ? 'default' : prev))
  }, [])

  // 刷新项目列表
  const refreshProjectList = useCallback(async () => {
    try {
      const res = await window.electronAPI.project.list()
      if (res.success && res.data) {
        setProjects(res.data)
      } else {
        console.warn('刷新项目列表失败:', res.error)
      }
    } catch (e: any) {
      console.error('刷新项目列表异常:', e.message)
    }
  }, [])

  // 初始化加载
  useEffect(() => {
    refreshProjectList()
  }, [refreshProjectList])

  // 选择项目
  const handleSelectProject = useCallback(async (id: string) => {
    try {
      const res = await window.electronAPI.project.get(id)
      if (res.success && res.data) {
        setActiveProjectId(id)
        setActiveProject(res.data)
      } else {
        console.warn('选择项目失败:', res.error)
      }
    } catch (e: any) {
      console.error('选择项目异常:', e.message)
    }
  }, [])

  // 新建项目
  const handleAddProject = useCallback(async () => {
    try {
      const now = new Date().toISOString()
      const newProject: ProjectItem = {
        id: newId('proj'),
        name: `${appText.defaultNewProject} ${projects.length + 1}`,
        step1Preset: null,
        step2Preset: null,
        createdAt: now,
        updatedAt: now
      }
      const res = await window.electronAPI.project.save(newProject)
      if (res.success) {
        // 本地更新列表，完全避免读盘（文件可能被安全软件临时锁住）
        const newItem: ProjectListItem = {
          id: newProject.id,
          name: newProject.name,
          updatedAt: newProject.updatedAt
        }
        setProjects(prev => [...prev, newItem].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        setActiveProjectId(newProject.id)
        setActiveProject(newProject as ProjectItem)
      } else {
        alert(msg.createFail(res.error || '未知错误'))
      }
    } catch (e: any) {
      alert(msg.createError(e.message))
    }
  }, [projects.length])

  // 重命名项目
  const handleRenameProject = useCallback(async (id: string, newName: string) => {
    const res = await window.electronAPI.project.rename(id, newName)
    if (res.success) {
      // 本地更新，不读盘
      setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p))
      if (activeProjectId === id) {
        setActiveProject(prev => prev ? { ...prev, name: newName } : null)
      }
    }
  }, [activeProjectId])

  // 删除项目
  const handleDeleteProject = useCallback(async (id: string) => {
    const res = await window.electronAPI.project.delete(id)
    if (res.success) {
      // 本地更新，不读盘
      setProjects(prev => prev.filter(p => p.id !== id))
      if (activeProjectId === id) {
        setActiveProjectId(null)
        setActiveProject(null)
      }
    }
  }, [activeProjectId])

  // 导入项目预设
  const handleImportProjects = useCallback(async () => {
    setIsImporting(true)
    try {
      const res = await window.electronAPI.project.import()
      if (res.success && res.data) {
        await refreshProjectList()
        alert(msg.importSuccess(res.data.count))
      } else if (res.error && res.error !== msg.userCancel) {
        alert(msg.importFail(res.error))
      }
    } catch (e: any) {
      alert(msg.importError(e.message))
    } finally {
      setIsImporting(false)
    }
  }, [refreshProjectList])

  // 拖拽导入项目预设
  const handleImportFromFile = useCallback(async (filePath: string) => {
    setIsImporting(true)
    try {
      const res = await window.electronAPI.project.importFromFile(filePath)
      if (res.success && res.data) {
        await refreshProjectList()
        alert(msg.dragImportSuccess(res.data.count))
      } else if (res.error) {
        alert(msg.dragImportFail(res.error))
      }
    } catch (e: any) {
      alert(msg.dragImportError(e.message))
    } finally {
      setIsImporting(false)
    }
  }, [refreshProjectList])

  // 复制项目
  const handleCopyProject = useCallback(async (id: string) => {
    try {
      const res = await window.electronAPI.project.get(id)
      if (!res.success || !res.data) {
        alert(msg.copyNotFound)
        return
      }
      const original = res.data
      const now = new Date().toISOString()
      const copyId = newId('proj')
      const copy: ProjectItem = {
        ...original,
        id: copyId,
        name: `${original.name}${sidebar.copySuffix}`,
        createdAt: now,
        updatedAt: now
      }
      const saveRes = await window.electronAPI.project.save(copy)
      if (saveRes.success) {
        // 本地更新列表，完全避免读盘
        const copyItem: ProjectListItem = {
          id: copyId,
          name: copy.name,
          updatedAt: copy.updatedAt
        }
        setProjects(prev => [...prev, copyItem].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        setActiveProjectId(copyId)
        setActiveProject(copy as ProjectItem)
      } else {
        alert(msg.copyFail(saveRes.error || '未知错误'))
      }
    } catch (e: any) {
      alert(msg.copyError(e.message))
    }
  }, [])

  // 导出项目预设
  const handleExportProjects = useCallback(async () => {
    try {
      const res = await window.electronAPI.project.export()
      if (res.success && res.data) {
        alert(msg.exportSuccess(res.data.count, res.data.filePath))
        // 在资源管理器中打开文件所在位置
        window.electronAPI.shell.showItemInFolder(res.data.filePath)
      } else if (res.error && res.error !== msg.userCancel) {
        alert(msg.exportFail(res.error))
      }
    } catch (e: any) {
      alert(msg.exportError(e.message))
    }
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: activeScheme.colors.pageBg }}>
      {/* 自定义标题栏 */}
      <header className="flex items-center h-10 bg-black border-b border-gray-900 px-4 select-none flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-white/30 shadow-sm">
            <img src="icon.ico" className="w-full h-full block" alt="logo" style={{ objectFit: 'cover' }} />
          </div>
          <span className="text-sm font-semibold text-white tracking-wide">{appText.name}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-base font-bold text-black truncate">
                {activeProject ? activeProject.name : appText.placeholderSelectProject}
              </h2>
              {activeProject && (
                <p className="text-xs text-black/70 truncate">
                  {appText.lastModified}{new Date(activeProject.updatedAt).toLocaleString(appText.locale)}
                </p>
              )}
            </div>
            {/* 右侧：个人设置 + 建模视图 / 分步操作视图 切换（建模视图时按钮底色加深以区分当前状态） */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeProject && (
                <>
                  <button onClick={() => setViewMode(m => (m === 'model' ? 'step' : 'model'))}
                    aria-pressed={viewMode === 'model'}
                    className={viewMode === 'model'
                      ? 'px-3 py-1 text-sm text-white bg-primary-800 border border-primary-800 rounded hover:bg-primary-700 focus-ring'
                      : 'px-3 py-1 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 focus-ring'}>
                    {viewMode === 'model' ? combinedPage.viewStep : combinedPage.viewModel}
                  </button>
                  <HelpTip text={combinedPage.viewModelHint} label={combinedPage.helpViewModel} align="right" />
                </>
              )}
              <button onClick={() => setSettingsOpen(true)} aria-label={combinedPage.settingsTitle} title={combinedPage.settingsTitle}
                className="w-8 h-8 flex items-center justify-center rounded-full text-black/70 hover:text-black hover:bg-gray-100 focus-ring">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.08a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* 页面内容（可滚动；建模视图用方案中的「建模视图背景」，分步视图用「页面背景」） */}
        <main
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{ backgroundColor: viewMode === 'model' ? activeScheme.colors.modelBg : activeScheme.colors.pageBg }}
        >
          <CombinedPage
            project={activeProject}
            onProjectUpdate={setActiveProject}
            onRefreshProjectList={refreshProjectList}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </main>

        {/* 个人设置弹框（配色方案） */}
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          schemes={allSchemes}
          activeId={activeScheme.id}
          onSelect={setActiveSchemeId}
          onUpdateColors={handleUpdateColors}
          onDuplicate={handleDuplicateScheme}
          onSaveAs={handleSaveAsScheme}
          onDelete={handleDeleteScheme}
        />

        {/* 底部状态栏 */}
        {/* 底部状态栏已隐藏 */}
      </div>

      {/* 项目管理 — 右侧 */}
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onAddProject={handleAddProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onCopyProject={handleCopyProject}
        onImportProjects={handleImportProjects}
        onExportProjects={handleExportProjects}
        onImportFromFile={handleImportFromFile}
        isImporting={isImporting}
      />
    </div>
    </div>
  )
}

export default App
