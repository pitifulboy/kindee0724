import React, { useState, useEffect, useRef } from 'react'
import { sidebar as t, app as appText } from '../config/appText'

interface ProjectListItem {
  id: string
  name: string
  updatedAt: string
}

interface SidebarProps {
  projects: ProjectListItem[]
  activeProjectId: string | null
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onRenameProject: (id: string, newName: string) => void
  onDeleteProject: (id: string) => void
  onCopyProject?: (id: string) => void
  onImportProjects?: () => void
  onExportProjects?: () => void
  onImportFromFile?: (filePath: string) => void
  isImporting?: boolean
}

const Sidebar: React.FC<SidebarProps> = ({
  projects, activeProjectId,
  onSelectProject, onAddProject, onRenameProject, onDeleteProject, onCopyProject,
  onImportProjects, onExportProjects, onImportFromFile, isImporting
}) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [draggingOver, setDraggingOver] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [isResizing, setIsResizing] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 右键菜单：点击外部关闭
  useEffect(() => {
    if (!contextMenu) return
    const onAnyClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', onAnyClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onAnyClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  const handleCopyFromMenu = () => {
    if (contextMenu && onCopyProject) {
      onCopyProject(contextMenu.projectId)
    }
    setContextMenu(null)
  }

  // 左侧拖拽调整宽度
  useEffect(() => {
    if (!isResizing) return
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(520, window.innerWidth - e.clientX))
      setSidebarWidth(newWidth)
    }
    const onMouseUp = () => setIsResizing(false)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // 拖拽导入
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDraggingOver(true) }
    const onDragLeave = () => setDraggingOver(false)
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setDraggingOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0 && onImportFromFile) {
        const fp = (files[0] as any).path
        if (fp && fp.endsWith('.json')) {
          await onImportFromFile(fp)
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
  }, [onImportFromFile])

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditName(currentName)
  }

  const handleFinishRename = () => {
    if (editingId && editName.trim()) {
      onRenameProject(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishRename()
    if (e.key === 'Escape') { setEditingId(null); setEditName('') }
  }

  return (
    <aside ref={sidebarRef} className="relative bg-white border-l border-gray-100 flex flex-col h-full flex-shrink-0" style={{ width: sidebarWidth }}>

      {/* 左侧拖拽手柄 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 z-20 cursor-col-resize transition-colors ${
          isResizing ? 'bg-blue-500' : 'hover:bg-blue-400'
        }`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* 项目列表 */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3 px-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t.projectListTitle}</p>
          <button onClick={onAddProject}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={t.newProjectTitle}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {projects.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6 px-2">
            {t.emptyProjectHint}<br />
            <span className="text-gray-300">{t.emptyProjectAction}</span>
          </p>
        )}

        <div className="space-y-0.5">
          {projects.map(project => {
            const isActive = activeProjectId === project.id
            const isEditing = editingId === project.id
            const lastModified = project.updatedAt
              ? new Date(project.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
              : ''

            return (
              <div
                key={project.id}
                className={`group relative flex items-center rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                }`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={handleKeyDown}
                    className="flex-1 mx-2 my-1.5 px-3 py-2 text-sm bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <button
                    onClick={() => onSelectProject(project.id)}
                    onContextMenu={(e) => handleContextMenu(e, project.id)}
                    className="flex-1 flex items-center px-3 py-2.5 text-left min-w-0"
                  >
                    {/* 项目图标 */}
                    <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <div className="ml-2.5 flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-medium text-blue-700' : 'text-gray-700'}`} title={project.name}>
                        {project.name}
                      </p>
                      {lastModified && (
                        <p className="text-[10px] text-gray-400">{lastModified}</p>
                      )}
                    </div>
                  </button>
                )}

                {/* 操作按钮（hover显示）- 固定在右侧并预留给宽 */}
                {!isEditing && (
                  <div className="flex items-center pr-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(project.id, project.name) }}
                      className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-md"
                      title={t.renameTitle}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id) }}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md"
                      title={t.deleteTitle}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* 底部 — 导入 / 导出 */}
      <div ref={dropRef} className={`px-3 py-3 border-t border-gray-50 space-y-1.5 transition-colors ${draggingOver ? 'bg-blue-50 border-blue-300' : ''}`}>
        {draggingOver && (
          <div className="text-[11px] text-blue-600 font-medium text-center mb-1">
            {t.importFromFileHint}
          </div>
        )}
        <div className="flex items-center space-x-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-[11px] text-gray-400">{appText.statusRunning}</span>
          <div className="flex-1" />
          <span className="text-[11px] text-gray-300">{appText.version}</span>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={onImportProjects}
            disabled={isImporting}
            className="flex-1 flex items-center justify-center px-2 py-1.5 text-[11px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 transition-colors"
            title={t.importPresetTitle}>
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t.importBtn}
          </button>
          <button
            onClick={onExportProjects}
            disabled={isImporting}
            className="flex-1 flex items-center justify-center px-2 py-1.5 text-[11px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 transition-colors"
            title={t.exportPresetTitle}>
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t.exportBtn}
          </button>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleCopyFromMenu}
            className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
          >
            <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {t.copyProject}
          </button>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
