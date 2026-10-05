# 新味智枢（electron-office）— 开发交接文档

> 本目录用于 **跨 Agent / 跨会话交接**。新接手的 Agent 请先完整阅读本 README，再按需查阅其余文档。

## 1. 项目是什么

一个 **纯本地离线** 的 Windows 桌面办公工具（Electron + React 19 + TypeScript + Tailwind CSS）。

- 所有数据在本地处理，**无任何网络传输**（硬约束）
- 打包为 Windows NSIS 安装包
- 当前唯一业务模块：**「Excel合并 → 金蝶导入」**

### 业务主线（两阶段流水线）

```
[步骤1] 文件夹中的订单表合并  →  合并表.xlsx
[步骤2] 合并表 LEFT JOIN 辅助表，再按模板结构填充
        拆分订单 → 关联 → 清理未匹配 → 填充字段 → 恢复模板结构 → 汇总输出
```

真实业务配置见仓库根目录的 `项目预设_2026-10-04.json`（示例项目：「京东万商-销售订单」「超盒算NB-销售」）。

## 2. 技术栈与目录

| 层 | 位置 | 说明 |
|---|---|---|
| 渲染进程 | `src-electron/renderer/` | React 页面与组件 |
| 预加载桥 | `src-electron/preload/index.ts` | `contextBridge` 暴露 `window.electronAPI` |
| 主进程 IPC | `src-electron/main/ipc/index.ts` | 统一注册所有通道 |
| 业务模块 | `src-electron/main/modules/` | `excelMerge`（合并）、`kingdeeImport`（金蝶模板生成） |
| 类型声明 | `src-electron/renderer/types/electron.d.ts` | 渲染进程可见的 API 类型 |

**关键约定**

- IPC 统一响应格式：`{ success: boolean, data?: T, error?: string }`
- 模块注册表模式：`src-electron/renderer/components/moduleRegistry.tsx`，新增模块即插即用
- UI 文案集中管理：`src-electron/renderer/config/appText.ts`

## 3. 环境与运行

```powershell
# 安装依赖
npm install

# 开发模式（vite + vite-plugin-electron，保存后自动热更新并拉起 Electron 窗口）
npm run dev

# 打包 Windows NSIS 安装包（electron-builder）
npm run build            # 直接出包，版本号取 package.json 当前值
npm run release          # 出包并自动递增 patch 版本（走 build-release.ps1）
npm run release:minor    # 递增 minor 后出包
npm run release:major    # 递增 major 后出包
```

> - 打包前必须确保没有「新味智枢」进程在运行，否则 `app.asar` / `release\win-unpacked\icudtl.dat` 被锁定导致打包失败。
> - `build-release.ps1` 会自动递增版本并**严格校验 `\d+\.\d+\.\d+` 格式**（历史曾产生非法版本号 `.6.0` 导致 `electron-builder` 报 `Invalid version`，已加固）。
> - `electron-builder` 需访问 `%APPDATA%\electron-office`（Chromium 缓存目录）与网络下载；受限沙箱下会被拦截，需在非沙箱环境执行。

## 4. 硬约束（务必遵守）

1. **不联网**：不得引入任何联网请求。
2. **文字颜色**：除「黑底白字」和「错误红 / 成功绿」外，其余文字一律使用黑色（`text-black`）。删除/警示类元素统一用 `bg-red-50 text-red-600 rounded hover:bg-red-100`。
3. **退出逻辑**：应用退出用 `app.exit(0)` + 800ms `process.exit(0)` 兜底；**禁止** detached 批处理执行 `taskkill`、**禁止**终止 `explorer.exe`（会触发杀软 / 黑屏）。
4. **版本号**：每次打包前在 `package.json` 中递增 patch 版本。

## 5. 本目录文档索引

| 文档 | 用途 |
|---|---|
| [README.md](./README.md) | 本文件：项目总览与交接入口 |
| [操作记录.md](./操作记录.md) | 按时间记录已执行的操作、改动与验证结果 |
| [SKILLS.md](./SKILLS.md) | 已使用 / 可复用的 skill 及其调用方式 |
| [任务拆分.md](./任务拆分.md) | 待办任务拆解与验收标准（给后续 Agent） |
| [可视化方案.md](./可视化方案.md) | 「步骤可视化」技术方案与组件规格 |

## 6. 当前进度速览

- 分支：`XWZS_1004`（工作副本 `D:\myvb\xwzs1004`）
- 已完成：GitHub 双远程同步、项目副本与分支建立、可视化方案设计与实现、界面1 简化、界面2 拖拽连线 / 关联删除 / 全局+卡内字段搜索 / 卡片可拖动 / 卡内滑动 / 全部展开 / 每表底部展开折叠 / 画布缩放 / 关联字段上浮 / 连接方式下拉（Left/Inner/Right Join）、「合并Excel + 金蝶导入」页重构为 **六步（S1~S6，每步独立执行）** 并内嵌界面1~5、S4 布局微调（模板表头行移至模板表地址下方）、「序号自增配置」改造为「**自定义填充规则**」模块、S5 取值区顺序与可视化内容调整（数据表取值 / 自定义字段取值）、S5 字段映射可视化按**运行口径**简化为「合并表列 / 自定义字段」、S5 匹配关系完整性修复（连线稳定标识 / 合并表列兜底 / 未完成映射红色提示）、编译自测、v3.6.1 打包出包
- 产物：`release/新味智枢-v3.6.1-Setup.exe`
- 版本：`3.6.1`（`package.json` 与 `appText.ts` 同步，改动后须两处一起更新）
- 注意：S5 可视化整改**仅源码 + 文档改动，未递增版本、未重新打包**（用户已确认暂不打包）；如需出包须显式授权。
- 下一步：见《任务拆分.md》「待确认 / 后续可扩展」
