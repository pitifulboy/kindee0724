import React, { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import CombinedPage from './pages/CombinedPage'
import { app as appText, message as msg, sidebar } from './config/appText'

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
        id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        alert(`新建项目失败: ${res.error || '未知错误'}`)
      }
    } catch (e: any) {
      alert(`新建项目出错: ${e.message}`)
    }
  }, [projects.length, refreshProjectList, handleSelectProject])

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
      const newId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const copy: ProjectItem = {
        ...original,
        id: newId,
        name: `${original.name}${sidebar.copySuffix}`,
        createdAt: now,
        updatedAt: now
      }
      const saveRes = await window.electronAPI.project.save(copy)
      if (saveRes.success) {
        // 本地更新列表，完全避免读盘
        const copyItem: ProjectListItem = {
          id: newId,
          name: copy.name,
          updatedAt: copy.updatedAt
        }
        setProjects(prev => [...prev, copyItem].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        setActiveProjectId(newId)
        setActiveProject(copy as ProjectItem)
      } else {
        alert(msg.copyFail(saveRes.error || '未知错误'))
      }
    } catch (e: any) {
      alert(msg.copyError(e.message))
    }
  }, [refreshProjectList])

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
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* 自定义标题栏 */}
      <header className="flex items-center h-10 bg-black border-b border-gray-900 px-4 select-none flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-white/30 shadow-sm">
            <img src="icon.ico" className="w-full h-full block" alt="logo" style={{ objectFit: 'cover' }} />
          </div>
          <span className="text-sm font-semibold text-white tracking-wide">新味智枢</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <header className="bg-white border-b border-gray-200 px-6 py-5 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-black">
                {activeProject ? activeProject.name : appText.placeholderSelectProject}
              </h2>
              {activeProject && (
                <p className="text-xs text-black mt-1">
                  {appText.lastModified}{new Date(activeProject.updatedAt).toLocaleString(appText.locale)}
                </p>
              )}
            </div>
            {/* 本地离线状态指示器已隐藏 */}
          </div>
        </header>

        {/* 页面内容（可滚动） */}
        <main className="flex-1 overflow-y-auto p-6">
          <CombinedPage
            project={activeProject}
            onProjectUpdate={setActiveProject}
            onRefreshProjectList={refreshProjectList}
          />
        </main>

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
