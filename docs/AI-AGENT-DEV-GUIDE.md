# AI Agent 多人协作开发规则手册

> 本文档是所有 AI Agent / 开发者参与本项目的强制规范。任何 Agent 在开始开发前**必须完整阅读本文档**。

---

## 一、项目总览

### 1.1 项目名称
Electron 离线办公工具套件（electron-office）

### 1.2 技术架构
```
┌─────────────────────────────────────────────────────┐
│                   Electron 主进程                     │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 窗口管理   │  │  IPC 通信层   │  │  模块调度器   │  │
│  └───────────┘  └──────────────┘  └──────┬───────┘  │
│                                         │           │
│              ┌──────────────────────────┼────────┐  │
│              │     业务模块层（可插拔）    │        │  │
│              │  ┌─────────┐ ┌─────────┐ │        │  │
│              │  │PDF模块  │ │Excel模块│ │        │  │
│              │  └─────────┘ └────┬────┘ │        │  │
│              └───────────────────┼──────┘        │  │
│                                  │               │  │
│              ┌───────────────────┼──────┐        │  │
│              │   Python 子进程调度器    │        │  │
│              │   (仅Excel模块使用)      │        │  │
│              └──────────────────────────┘        │  │
├─────────────────────────────────────────────────────┤
│                  渲染进程（React）                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ 侧边栏导航 │  │ 页面路由  │  │  各功能页面组件   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────┐   │
│  │            Redux 全局状态管理                  │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│              Preload 安全隔离层                        │
│  contextBridge → electronAPI（最小权限暴露）          │
└─────────────────────────────────────────────────────┘
```

### 1.3 核心技术栈
| 层级 | 技术 | 版本要求 |
|------|------|----------|
| 框架 | Electron | ^29.x |
| 语言 | TypeScript | ^5.3 |
| 前端 | React 19 + Tailwind CSS | 最新稳定版 |
| 状态 | Redux Toolkit | ^2.x |
| 构建 | Vite + vite-plugin-electron | ^5.x |
| 打包 | electron-builder (NSIS) | ^24.x |
| PDF | pdfjs-dist + @napi-rs/canvas | ^4.x / ^0.1.x |
| Excel | Python Pandas (子进程) | 后续阶段 |

---

## 二、目录结构与文件所有权

### 2.1 完整目录规范
```
electron-office/
├─ src-electron/
│  ├─ main/                          # 【主进程】
│  │  ├─ index.ts                    # 入口：app生命周期 (已锁定，勿改)
│  │  ├─ core/                       # 框架核心（锁定区，需评审才能改）
│  │  │  ├─ windowManager.ts         # 窗口管理
│  │  │  ├─ moduleRegistry.ts        # 模块注册器
│  │  │  └─ errorHandler.ts          # 全局异常处理
│  │  ├─ modules/                    # 业务模块（各Agent工作区）
│  │  │  ├─ pdfConvert/              # PDF转图片模块
│  │  │  │  ├─ index.ts              # IPC注册入口
│  │  │  │  ├─ service.ts            # 核心业务逻辑
│  │  │  │  └─ types.ts              # 模块类型定义
│  │  │  └─ excelAnalysis/           # Excel分析模块（后续阶段）
│  │  └─ ipc/                        # IPC通信层
│  │     ├─ index.ts                 # IPC注册总入口
│  │     └─ types.ts                 # 全局IPC类型定义
│  ├─ preload/                       # 【预加载脚本】
│  │  └─ index.ts                    # contextBridge安全API
│  └─ renderer/                      # 【渲染进程】
│     ├─ App.tsx                     # 应用根组件
│     ├─ main.tsx                    # React入口
│     ├─ index.css                   # 全局样式
│     ├─ index.html                  # HTML模板
│     ├─ components/                 # 公共UI组件
│     │  ├─ Sidebar.tsx              # 侧边栏导航
│     │  ├─ Layout.tsx               # 布局容器
│     │  └─ ui/                      # 基础UI组件
│     ├─ pages/                      # 功能页面
│     │  ├─ PdfConvertPage.tsx       # PDF转图片页
│     │  └─ ExcelAnalysisPage.tsx    # Excel分析页（后续）
│     ├─ store/                      # Redux状态管理
│     │  ├─ index.ts                 # Store配置
│     │  ├─ hooks.ts                 # 类型安全的hooks
│     │  └─ slices/                  # 各模块状态切片
│     │     ├─ pdfConvertSlice.ts
│     │     └─ excelAnalysisSlice.ts
│     └─ types/                      # 渲染进程类型
│        └─ electron.d.ts            # electronAPI类型声明
├─ python-service/                   # Python数据分析服务（后续阶段）
├─ extra-resources/                  # 打包静态资源
├─ build/                            # 构建资源（图标等）
├─ docs/                             # 项目文档
│  ├─ AI-AGENT-DEV-GUIDE.md          # 本文件
│  └─ PROGRESS.md                    # 开发进度追踪
├─ electron-builder.config.js        # 打包配置
├─ vite.config.ts                    # Vite构建配置
├─ tailwind.config.js                # Tailwind配置
├─ tsconfig.json                     # TS配置
└─ package.json                      # 依赖管理
```

### 2.2 文件所有权规则

| 区域 | 所有权 | 修改规则 |
|------|--------|----------|
| `main/index.ts` | 🔒 锁定 | 仅技术负责人可改 |
| `main/core/` | 🔒 锁定 | 需评审，改动需记录到 PROGRESS.md |
| `main/modules/{module}/` | 🟢 模块所有者 | 对应 Agent 独占开发 |
| `main/ipc/types.ts` | 🟡 共享 | 新增类型可以，修改已有类型需通知所有 Agent |
| `preload/index.ts` | 🟡 共享 | 新增 API 需在 PROGRESS.md 记录 |
| `renderer/components/` | 🟡 共享 | 公共组件，改动需通知 |
| `renderer/pages/{page}` | 🟢 页面所有者 | 对应 Agent 独占开发 |
| `renderer/store/slices/` | 🟢 模块所有者 | 各 Agent 管理自己的 slice |
| `electron-builder.config.js` | 🔒 锁定 | 仅打包阶段可改 |
| `vite.config.ts` | 🔒 锁定 | 仅技术负责人可改 |

> 🔒 锁定 = 需要评审才能修改
> 🟡 共享 = 可修改但需通知
> 🟢 独占 = 对应 Agent 自由开发

---

## 三、IPC 通信契约规范

### 3.1 IPC 命名规则
```
{模块名}:{动作}

示例：
  pdf:convert              # PDF模块 - 转换
  pdf:convert:cancel       # PDF模块 - 取消转换
  pdf:convert:progress     # PDF模块 - 转换进度（主进程推送）
  excel:merge              # Excel模块 - 合并
  excel:merge:progress     # Excel模块 - 合并进度（主进程推送）
```

### 3.2 请求/响应格式
所有 IPC 通信必须遵循统一的类型格式：

```typescript
// 请求（渲染进程 → 主进程）
// 通过 ipcRenderer.invoke(channel, payload) 调用

// 响应（主进程 → 渲染进程）
interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string    // 失败时的中文错误描述
}

// 进度推送（主进程 → 渲染进程）
// 通过 win.webContents.send(channel, progress) 推送
interface ProgressPayload {
  status: 'pending' | 'processing' | 'completed' | 'error'
  overallProgress: number  // 0-100
  message?: string         // 中文状态描述
  // ...模块特有字段
}
```

### 3.3 新增 IPC 接口的步骤

1. **在 `main/ipc/types.ts` 中定义类型**
```typescript
// 示例：新增 Excel 合并接口
export interface ExcelMergeOptions {
  filePaths: string[]
  outputDir: string
  sheetName?: string
}

export interface ExcelMergeResult {
  outputPath: string
  rowCount: number
}
```

2. **在模块目录下创建 handler**
```typescript
// main/modules/excelMerge/index.ts
import { ipcMain } from 'electron'
import * as service from './service'

export function registerExcelMergeHandlers() {
  ipcMain.handle('excel:merge', async (event, options: ExcelMergeOptions) => {
    try {
      const result = await service.mergeExcelFiles(options, (progress) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('excel:merge:progress', progress)
      })
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
```

3. **在 `main/ipc/index.ts` 中注册**
```typescript
import { registerExcelMergeHandlers } from '../modules/excelMerge'

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ...已有的handler
  registerExcelMergeHandlers()  // 新增这行
}
```

4. **在 `preload/index.ts` 中暴露 API**
```typescript
excelMerge: {
  merge: (options: ExcelMergeOptions): Promise<IpcResponse<ExcelMergeResult>> => {
    return ipcRenderer.invoke('excel:merge', options)
  },
  onProgress: (callback: (progress: any) => void) => {
    const handler = (_e: any, progress: any) => callback(progress)
    ipcRenderer.on('excel:merge:progress', handler)
    return () => ipcRenderer.removeListener('excel:merge:progress', handler)
  }
}
```

5. **在 `renderer/types/electron.d.ts` 中更新类型声明**

---

## 四、新模块开发模板

每个新功能模块**必须**包含以下文件结构：

```
main/modules/{moduleName}/
├─ index.ts          # IPC注册入口（必须导出 register{Name}Handlers 函数）
├─ service.ts        # 核心业务逻辑
└─ types.ts          # 模块私有类型（可选，也可放 ipc/types.ts）

renderer/pages/{ModuleName}Page.tsx   # 功能页面组件
renderer/store/slices/{moduleName}Slice.ts  # Redux状态切片
```

### 4.1 模块开发清单（Checklist）

每个新模块开发时，逐项检查：

- [ ] 在 `main/ipc/types.ts` 中定义 Options 和 Result 类型
- [ ] 创建 `main/modules/{moduleName}/index.ts`，导出 `register{Name}Handlers`
- [ ] 创建 `main/modules/{moduleName}/service.ts`，实现核心逻辑
- [ ] 在 `main/ipc/index.ts` 中注册新 handler
- [ ] 在 `preload/index.ts` 中暴露安全 API
- [ ] 在 `renderer/types/electron.d.ts` 中更新类型声明
- [ ] 创建 `renderer/store/slices/{moduleName}Slice.ts`
- [ ] 在 `renderer/store/index.ts` 中注册 reducer
- [ ] 创建 `renderer/pages/{ModuleName}Page.tsx`
- [ ] 在侧边栏导航中添加入口
- [ ] 所有用户可见文本为简体中文
- [ ] 异常处理有友好中文提示
- [ ] 在 `docs/PROGRESS.md` 中记录开发状态

---

## 五、代码规范

### 5.1 TypeScript 规范
- 所有函数参数和返回值必须有类型注解
- 禁止使用 `any`（除与第三方库交互处可用并注释原因）
- 接口命名以 `I` 为前缀已废弃，直接使用名称（如 `PdfConvertOptions`）
- 枚举使用 PascalCase

### 5.2 React 规范
- 函数组件 + Hooks，不使用 class 组件
- 组件文件名 PascalCase（如 `PdfConvertPage.tsx`）
- Props 接口定义在组件文件顶部
- 使用 `useAppSelector` / `useAppDispatch` 而非原生 hooks

### 5.3 CSS 规范
- 使用 Tailwind utility classes 为主
- 全局样式定义在 `index.css`，使用 `@apply` 组合
- 自定义类名使用 kebab-case（如 `.drop-zone`、`.btn-primary`）
- 禁止内联 style，除非动态计算值

### 5.4 命名规范
| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | camelCase / PascalCase | `pdfConvertSlice.ts` / `PdfConvertPage.tsx` |
| 变量 | camelCase | `outputDir`、`isConverting` |
| 类型/接口 | PascalCase | `PdfConvertOptions` |
| IPC频道 | `模块:动作` | `pdf:convert`、`excel:merge` |
| Redux action | camelCase | `addFiles`、`setFormat` |
| CSS类 | kebab-case | `.btn-primary`、`.drop-zone` |

### 5.5 离线规范（最高优先级）
- **禁止**任何 `fetch`、`XMLHttpRequest`、`WebSocket` 网络请求
- **禁止**引入需要联网下载资源的依赖
- **禁止**使用 CDN 链接（所有资源本地内置）
- **所有第三方依赖**必须能离线工作（如 pdfjs-dist 的 worker 文件需本地内置）
- `package.json` 中不引入任何含网络请求的包

---

## 六、多 Agent 协作流程

### 6.1 Agent 角色分配

| Agent | 负责区域 | 阶段 |
|-------|----------|------|
| Agent-Framework | `core/`、`ipc/`、`preload/`、构建配置 | 全阶段 |
| Agent-PDF | `modules/pdfConvert/`、`pages/PdfConvertPage.tsx` | 阶段1-2 |
| Agent-Excel | `modules/excelAnalysis/`、Python服务 | 阶段3-4 |
| Agent-UI | `components/`、公共样式 | 全阶段 |

### 6.2 开发前必须执行的步骤

每个 Agent 在开始工作前：

1. **阅读本文档**（`docs/AI-AGENT-DEV-GUIDE.md`）
2. **阅读进度文档**（`docs/PROGRESS.md`）了解当前状态
3. **检查 `PROGRESS.md` 中的「已知问题」**，确认自己不会碰到已知的坑
4. **确认自己的模块所有权**，不修改其他 Agent 的锁定文件

### 6.3 开发完成后必须执行的步骤

1. **更新 `docs/PROGRESS.md`**：
   - 在「已完成」中记录完成的工作
   - 在「已知问题」中记录遇到的新问题
   - 更新模块状态标记
2. **检查 IPC 契约**：如果新增/修改了 IPC 接口，在 PROGRESS.md 的「IPC变更记录」中记录
3. **自测**：确保功能可用，异常场景有友好提示

### 6.4 冲突处理规则

- **IPC 类型冲突**：如果两个 Agent 需要修改 `ipc/types.ts` 中的同一类型，后者必须兼容前者的接口
- **preload 冲突**：新增 API 追加到末尾，不修改已有 API 签名
- **样式冲突**：公共样式改动需在 PROGRESS.md 中记录变更说明

---

## 七、分阶段开发规划

### 阶段一：基础框架 + PDF转图片（当前阶段）
**目标**：可运行的软件 + PDF转图片完整闭环
- [x] Electron 工程初始化
- [x] 窗口管理、生命周期
- [x] Preload 安全配置
- [x] IPC 通信框架
- [x] electron-builder 打包配置
- [ ] PDF转图片功能闭环（修复中）
- [ ] 侧边栏导航架构
- [ ] 安装包构建验证

### 阶段二：PDF全功能
**目标**：图片转PDF、PDF合并/拆分、页面编辑
- [ ] 图片转PDF模块
- [ ] PDF合并模块
- [ ] PDF拆分模块
- [ ] PDF页面编辑模块

### 阶段三：Python Pandas 接入 + Excel合并
**目标**：Python子进程架构 + Excel批量合并
- [ ] Python服务打包方案（PyInstaller）
- [ ] Electron ↔ Python 子进程通信
- [ ] Excel批量合并功能

### 阶段四：Excel数据分析
**目标**：多表主键关联、数据清洗、可视化分析
- [ ] 多Excel主键关联
- [ ] 数据清洗功能
- [ ] 可视化数据分析
- [ ] 结果导出

---

## 八、问题报告格式

在 `docs/PROGRESS.md` 中报告问题时使用以下格式：

```markdown
### 🔴 问题 #编号：问题标题
- **发现时间**：YYYY-MM-DD
- **发现者**：Agent名称
- **影响范围**：受影响的模块/文件
- **问题描述**：详细描述问题现象
- **根本原因**：分析原因（如已知）
- **临时方案**：临时绕过方法（如有）
- **状态**：🔴 未解决 / 🟡 处理中 / 🟢 已解决
- **解决方案**：最终解决方案（解决后填写）
```

---

## 九、关键注意事项

### 9.1 pdfjs-dist 在 Electron 主进程的使用
- pdfjs-dist 设计用于浏览器环境，在 Node.js 主进程使用需要 Canvas polyfill
- **使用 `@napi-rs/canvas`** 替代 `canvas`（避免原生编译问题）
- Worker 配置：在主进程中设置 `GlobalWorkerOptions.workerSrc` 指向本地 worker 文件
- 打包时需确保 worker 文件被正确包含

### 9.2 Python 子进程通信（阶段三预留）
- 通信方式：stdin/stdout JSON 流
- 消息格式：`===JSON_START===` + JSON + `===JSON_END===`（固定标记隔离）
- 进程管理：Electron 主进程负责启动/监控/终止 Python 子进程
- 打包方式：PyInstaller 打包为单文件 exe，放入 `extra-resources/`

### 9.3 electron-builder 打包注意
- 原生模块（如 @napi-rs/canvas）需要配置 `asarUnpack`
- `extra-resources/` 中的文件打包后路径：`process.resourcesPath/extra-resources/`
- 开发环境与生产环境路径不同，需做兼容处理
