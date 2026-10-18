// IPC 通信类型定义

// 通用响应类型（渲染层 / preload / 主进程统一使用）
export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}
