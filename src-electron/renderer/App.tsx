import React, { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import CombinedPage from './pages/CombinedPage'

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

  // 刷新项目列表
  const refreshProjectList = useCallback(async () => {
    const res = await window.electronAPI.project.list()
    if (res.success && res.data) {
      setProjects(res.data)
    }
  }, [])

  // 初始化加载
  useEffect(() => {
    refreshProjectList()
  }, [refreshProjectList])

  // 选择项目
  const handleSelectProject = useCallback(async (id: string) => {
    const res = await window.electronAPI.project.get(id)
    if (res.success && res.data) {
      setActiveProjectId(id)
      setActiveProject(res.data)
    }
  }, [])

  // 新建项目
  const handleAddProject = useCallback(async () => {
    const now = new Date().toISOString()
    const newProject: ProjectItem = {
      id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `新项目 ${projects.length + 1}`,
      step1Preset: null,
      step2Preset: null,
      createdAt: now,
      updatedAt: now
    }
    const res = await window.electronAPI.project.save(newProject)
    if (res.success) {
      await refreshProjectList()
      await handleSelectProject(newProject.id)
    }
  }, [projects.length, refreshProjectList, handleSelectProject])

  // 重命名项目
  const handleRenameProject = useCallback(async (id: string, newName: string) => {
    const res = await window.electronAPI.project.rename(id, newName)
    if (res.success) {
      await refreshProjectList()
      if (activeProjectId === id) {
        setActiveProject(prev => prev ? { ...prev, name: newName } : null)
      }
    }
  }, [activeProjectId])

  // 删除项目
  const handleDeleteProject = useCallback(async (id: string) => {
    const res = await window.electronAPI.project.delete(id)
    if (res.success) {
      await refreshProjectList()
      if (activeProjectId === id) {
        setActiveProjectId(null)
        setActiveProject(null)
      }
    }
  }, [activeProjectId])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <header className="bg-white border-b border-gray-200 px-6 py-5 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {activeProject ? activeProject.name : '选择项目开始使用'}
              </h2>
              {activeProject && (
                <p className="text-xs text-gray-400 mt-1">
                  上次修改：{new Date(activeProject.updatedAt).toLocaleString('zh-CN')}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-300" />
              <span className="text-xs text-green-700 font-semibold">本地离线</span>
            </div>
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
        <footer className="bg-white border-t border-gray-100 px-6 py-2.5 flex-shrink-0">
          <p className="text-center text-xs text-gray-400">
            所有数据均在本地处理 · 无网络传输 · 安全可靠
          </p>
        </footer>
      </div>

      {/* 项目管理 — 右侧 */}
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onAddProject={handleAddProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />
    </div>
  )
}

export default App
