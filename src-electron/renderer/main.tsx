import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 全局错误捕获 — 辅助调试
window.onerror = (message, source, lineno, colno, error) => {
  console.error('全局错误:', message, source, lineno, colno, error)
  alert(`渲染进程错误: ${message}\n${source}:${lineno}:${colno}`)
}
window.onunhandledrejection = (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason)
  alert(`未处理的 Promise 拒绝: ${event.reason?.message || event.reason}`)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)