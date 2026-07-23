import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import PdfConvertPage from './pages/PdfConvertPage'
import ImageToPdfPage from './pages/ImageToPdfPage'
import PdfMergePage from './pages/PdfMergePage'
import PdfSplitPage from './pages/PdfSplitPage'
import ExcelMergePage from './pages/ExcelMergePage'
import KingdeeImportPage from './pages/KingdeeImportPage'
import PlaceholderPage from './pages/PlaceholderPage'
import { moduleRegistry } from './components/moduleRegistry'

const App: React.FC = () => {
  const [activeModuleId, setActiveModuleId] = useState('pdf-convert')

  // 根据当前选中的模块渲染对应页面
  const renderPage = () => {
    switch (activeModuleId) {
      case 'pdf-convert':
        return <PdfConvertPage />
      case 'img-to-pdf':
        return <ImageToPdfPage />
      case 'pdf-merge':
        return <PdfMergePage />
      case 'pdf-split':
        return <PdfSplitPage />
      case 'excel-merge':
        return <ExcelMergePage />
      case 'kingdee-import':
        return <KingdeeImportPage />
      case 'excel-analysis':
        return <PlaceholderPage title="Excel数据分析" description="多表关联、数据清洗、可视化分析" phase="阶段四" />
      default:
        return <PdfConvertPage />
    }
  }

  // 获取当前模块信息（用于页面标题栏）
  const activeModule = moduleRegistry.find(m => m.id === activeModuleId)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 侧边栏导航 */}
      <Sidebar
        activeModuleId={activeModuleId}
        onModuleChange={setActiveModuleId}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                {activeModule?.name || '离线办公工具'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeModule?.description || ''}
              </p>
            </div>
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-green-600 font-medium">离线模式</span>
            </div>
          </div>
        </header>

        {/* 页面内容（可滚动） */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>

        {/* 底部状态栏 */}
        <footer className="bg-white border-t border-gray-100 px-6 py-2.5 flex-shrink-0">
          <p className="text-center text-xs text-gray-400">
            所有数据均在本地处理 · 无网络传输 · 安全可靠
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
