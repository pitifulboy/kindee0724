import React from 'react'
import { moduleRegistry, type ModuleDef } from './moduleRegistry'

interface SidebarProps {
  activeModuleId: string
  onModuleChange: (moduleId: string) => void
}

const Sidebar: React.FC<SidebarProps> = ({ activeModuleId, onModuleChange }) => {
  return (
    <aside className="w-60 bg-white border-r border-gray-100 flex flex-col h-full">
      {/* Logo区域 */}
      <div className="px-5 py-5 border-b border-gray-50">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-800">离线办公工具</h1>
            <p className="text-[10px] text-gray-400">纯本地 · 零网络</p>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-2 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          功能模块
        </p>
        {moduleRegistry.map((mod: ModuleDef) => {
          const isActive = activeModuleId === mod.id
          const isDisabled = !mod.enabled

          return (
            <button
              key={mod.id}
              onClick={() => !isDisabled && onModuleChange(mod.id)}
              disabled={isDisabled}
              className={`
                w-full flex items-center px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group
                ${isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : isDisabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <span className={`flex-shrink-0 ${isActive ? 'text-primary-600' : ''}`}>
                {mod.icon}
              </span>
              <span className="ml-3 flex-1 text-left truncate">{mod.name}</span>
              {mod.badge && (
                <span className={`
                  px-1.5 py-0.5 text-[9px] rounded-md font-medium
                  ${isActive ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}
                `}>
                  {mod.badge}
                </span>
              )}
              {isActive && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary-500" />
              )}
            </button>
          )
        })}
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
