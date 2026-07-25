import React, { useState } from 'react'

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
}

const Sidebar: React.FC<SidebarProps> = ({
  projects, activeProjectId,
  onSelectProject, onAddProject, onRenameProject, onDeleteProject
}) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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
    <aside className="w-60 bg-white border-l border-gray-100 flex flex-col h-full">

      {/* 项目列表 */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-2 px-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">项目列表</p>
          <button onClick={onAddProject}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="新建项目">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {projects.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6 px-2">
            暂无项目<br />
            <span className="text-gray-300">点击 + 新建项目</span>
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
                className={`group flex items-center rounded-lg transition-colors ${
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
                    className="flex-1 px-3 py-2 text-sm bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <button
                    onClick={() => onSelectProject(project.id)}
                    className="flex-1 flex items-center px-3 py-2 text-left"
                  >
                    {/* 项目图标 */}
                    <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <div className="ml-2.5 flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
                        {project.name}
                      </p>
                      {lastModified && (
                        <p className="text-[10px] text-gray-400">{lastModified}</p>
                      )}
                    </div>
                  </button>
                )}

                {/* 操作按钮（hover显示） */}
                {!isEditing && (
                  <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(project.id, project.name) }}
                      className="p-1 text-gray-300 hover:text-blue-500 rounded"
                      title="重命名"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id) }}
                      className="p-1 text-gray-300 hover:text-red-500 rounded"
                      title="删除"
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

      {/* 底部信息 */}
      <div className="px-4 py-3 border-t border-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[11px] text-gray-400">本地运行中</span>
          </div>
          <span className="text-[11px] text-gray-300">v2.7.2</span>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
