import React from 'react'

interface PlaceholderPageProps {
  title: string
  description: string
  phase: string
}

/**
 * 未启用模块的占位页面
 * 后续阶段模块在侧边栏可见但点击后显示此页面
 */
const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description, phase }) => {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-5 bg-gray-50 rounded-2xl flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">{title}</h2>
        <p className="text-sm text-gray-400 mb-4">{description}</p>
        <span className="inline-block px-3 py-1 bg-primary-50 text-primary-600 text-xs font-medium rounded-full">
          计划于 {phase} 开发
        </span>
      </div>
    </div>
  )
}

export default PlaceholderPage
