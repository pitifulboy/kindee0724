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
> - **PowerShell 脚本编码（两个方向，别搞反）**：脚本**自身**必须存为 **UTF-8 with BOM**——它含中文注释与 `═` 框线，无 BOM 时 PowerShell 5.1 会按系统 ANSI（简中 GBK）解码，中文乱码后解析器误判出「意外的标记 `}`」，脚本在递增版本之前就中断；而脚本**写出**文件时显式用 **UTF-8 无 BOM**（`New-Object System.Text.UTF8Encoding($false)`），避免把中文写成乱码。
> - `electron-builder` 需访问 `%APPDATA%\electron-office`（Chromium 缓存目录）与网络下载；受限沙箱下会被拦截，需在非沙箱环境执行。

### 质量护栏

```powershell
npm run typecheck   # 渲染层 + 主进程 类型检查（已接入 build，通过后才继续打包）
npm run lint        # ESLint（flat config：eslint.config.mjs）
npm run format      # Prettier 自动格式化（配置见 .prettierrc）
npm test            # Vitest 最小单测（配置见 vitest.config.ts）
```

> - `build` / `build:dir` / `build:nsis` / `release*` 均以 `npm run typecheck` 作为前置，类型检查不通过不会出包。
> - `lint` / `format` / `test` 所需依赖（eslint、prettier、vitest、typescript-eslint 等）在 `devDependencies` 中声明，**先执行一次 `npm install` 后即可使用**。
> - CI 工作流见 `.github/workflows/ci.yml`（typecheck + lint + test）。

## 4. 硬约束（务必遵守）

1. **不联网**：不得引入任何联网请求。
2. **文字颜色**：正文文字一律使用黑色（`text-black`）。例外仅有：黑底白字、主色按钮（`bg-primary-800`）白字、语义色（错误 `text-red-600/700`、成功 `text-success-700/800`）、以及**半透明黑**的辅助说明文字（下限 `text-black/60`，约 5.7:1，满足 WCAG AA；不要再使用 `text-black/50`，其 3.95:1 不达标）。删除 / 警示类元素统一用 `bg-red-50 text-red-600 rounded hover:bg-red-100`。
   - **拖拽悬停高亮**：用**浅色**高亮（`border-dashed border-primary-400 bg-primary-50 ring-2 ring-primary-200`），**禁止**深底高亮（深色底 + 黑字对比度不足）。
   - **成功 / 错误面板**：成功走绿色语义（`bg-success-50 border-success-200` / Toast `bg-success-700`），错误走深红（Toast `bg-red-700`）；不要用主色蓝表达成功。
   - **焦点可见性**：统一用 `.focus-ring`（`focus-visible:ring-2 ring-primary-500`），不要用 `focus:outline-none` 而不给替代焦点指示。
   - **字号下限**：正文 ≥ `text-sm`(14px)，辅助说明 ≥ `text-xs`(12px)；不要使用 `text-[10px]` / `text-[11px]`。
3. **退出逻辑**：应用退出用 `app.exit(0)` + 800ms `process.exit(0)` 兜底；**禁止** detached 批处理执行 `taskkill`、**禁止**终止 `explorer.exe`（会触发杀软 / 黑屏）。
4. **版本号（单一来源）**：`package.json.version` 为唯一来源；界面显示的版本由 Vite 在构建期通过 `define` 注入的 `__APP_VERSION__` 派生（见 `src-electron/renderer/config/appText.ts`），**无需再两处手动同步**。打包前只需递增 `package.json` 的版本。
5. **含非 ASCII 的 `.ps1` 必须存为 UTF-8 with BOM**：本机 PowerShell 5.1 对无 BOM 的 `.ps1` 按系统 ANSI（GBK）解码，中文注释 / 框线会乱码并导致语法报错（见 `build-release.ps1` 的历史事故）。`build-release.ps1` 已加 BOM，后续新增 / 改动此类脚本请保持 BOM。同理，`.js` / `.ts` / `.json` / `.md` 一律 UTF-8 无 BOM。

## 5. 本目录文档索引

| 文档 | 用途 |
|---|---|
| [README.md](./README.md) | 本文件：项目总览与交接入口 |
| [代码评审报告-2026-10-05.md](./代码评审报告-2026-10-05.md) | 三方专家团只读代码评审：P0/P1/P2 缺陷与优化点（含行号证据） |
| [界面设计评审报告-2026-10-06.md](./界面设计评审报告-2026-10-06.md) | 面向文员用户的界面设计评审：布局 / 文案 / 配色 / 无障碍 / 微交互（含对比度实测与修正代码） |
| [界面整改概述-2026-10-06.md](./界面整改概述-2026-10-06.md) | 界面整改一页纸总览：前后对照 / 改动清单 / 验证结果 / 暂缓项 |
| [UI设计规范.md](./UI设计规范.md) | **规范性文档**：公开规范调研（Material 3 / WCAG 2.2 / NN-g）+ 设计令牌（间距 · 字号）+ 布局规范 + 指引信息分层 + 「?」提示组件规范 + 常见违规对照表。写界面前先查本文 |
| [操作记录.md](./操作记录.md) | 按时间记录已执行的操作、改动与验证结果 |
| [SKILLS.md](./SKILLS.md) | 已使用 / 可复用的 skill 及其调用方式 |
| [任务拆分.md](./任务拆分.md) | 待办任务拆解与验收标准（给后续 Agent） |
| [可视化方案.md](./可视化方案.md) | 「步骤可视化」技术方案与组件规格 |

## 6. 当前进度速览

- 分支：`XWZS_1004`（工作副本 `D:\myvb\xwzs1004`）
- 已完成：GitHub 双远程同步、项目副本与分支建立、可视化方案设计与实现、界面1 简化、界面2 拖拽连线 / 关联删除 / 全局+卡内字段搜索 / 卡片可拖动 / 卡内滑动 / 全部展开 / 每表底部展开折叠 / 画布缩放 / 关联字段上浮 / 连接方式下拉（Left/Inner/Right Join）、「合并Excel + 金蝶导入」页重构为 **六步（S1~S6，每步独立执行）** 并把界面1~5 收敛到**「建模视图」单页（可一键平铺展示 1~6 步全部图形，与分步操作双视图切换）**、S4 布局微调（模板表头行移至模板表地址下方）、「序号自增配置」改造为「**自定义填充规则**」模块、S5 取值区顺序与可视化内容调整（数据表取值 / 自定义字段取值）、S5 字段映射可视化按**运行口径**简化为「合并表列 / 自定义字段」、S5 匹配关系完整性修复（连线稳定标识 / 合并表列兜底 / 未完成映射红色提示）、**读表格式扩展（新增 `.xls`（SheetJS BIFF）/ `.csv`（RFC4180 + 编码探测））**、编译自测、v3.6.1 打包出包
- 产物：`release/新味智枢-v4.0.0-Setup.exe`（NSIS x64）
- 版本：`4.0.0`（单一来源 `package.json.version`；界面通过构建期注入的 `__APP_VERSION__` 派生）
- 注意：v4.0.0 含 10-18 全部迭代（原表预处理拆分 / 数据转换 / 配色方案 / 字号规范 / 测试体系），`typecheck` / `lint` / `test`（31 用例）全绿。
- **代码评审整改（2026-10-06）**：按《代码评审报告-2026-10-05.md》落地全部可安全执行的整改项——
  - P0：发布脚本 UTF-8 编码 + 版本号单源；Sidebar 未选中项白底白字；辅助表拖拽监听器泄漏；`.xls` 白名单收窄为 `.xlsx`；图标源 `icons/myicons.jpg` 入库并在构建脚本加缺图兜底；`package.json` 恢复标准格式。
  - 死代码：删除 excelMerge / kingdeeImport 两套预设管理器及其 IPC / preload / 类型（约 240 行）；删除窗口控制 IPC；清理废弃注释块与旧 `generateImportFile` 入口。
  - 后端：抽 `main/shared/excel.ts`（读表 / 取值 / 清洗 / 写盘统一）；step2c 去重复读模板；**`readTemplate` 加 mtime 失效缓存，流水线模板读盘 4 次 → 1 次**；step2a 排序改 Map 预建索引（消 O(n²)）；模板重复列名告警；`projectManager` 先落盘后改缓存；`shell.openPath` 透传失败；`setWindowOpenHandler` 协议校验；`file:listExcelFiles` 仅 `.xlsx`。
  - 渲染层：抽 `utils/id.ts`（替换 9 处 `Date.now()+substr`）、`hooks/useNativeDropZone.ts` + `components/NativeDropZone.tsx`（统一 3 处原生拖拽）、`components/Toast.tsx`、`components/combined/DuplicateColumnsDialog.tsx`；删除死状态 `mergeError`。
  - 工程护栏：新增 `npm run typecheck`（已接入 build 前置）、ESLint flat config（当前 0 error / 0 warning）、Prettier、Vitest 配置、GitHub Actions CI；`@types/react` 升 ^19；`react`/`react-dom` 移入 devDependencies；删 `jimp`；简化 electron-builder `files`（生产依赖交给 electron-builder 自动收集）。
  - 打包验证（`--dir`）：`app.asar` **36 MB → 28 MB**；asar 内自动收集 exceljs 等 75 个生产依赖、**已剔除 react/react-dom** 与 `tsbuildinfo`。未生成新 NSIS 安装包，版本仍为 `3.6.1`。
  - 文案 / 样式：非黑色文字全部改 `text-black`（SearchableSelect / SplitOrderView / LeftJoinModelView / CombinedPage / index.css body），硬编码中文迁入 `appText.ts`。
- **界面设计整改（2026-10-06）**：按《界面设计评审报告-2026-10-06.md》落地（面向高中~大专文员用户）——
  - 配色：**主色色阶由「600 青 → 700 蓝」的断裂改为统一蓝色系**（`tailwind.config.js` 50~900）；新增 `success` 语义色；拖拽悬停高亮由深蓝底黑字（3.13:1）改**浅色高亮**（`bg-primary-50 + 蓝色虚线 + ring`）；成功态改绿、错误 Toast 改深红 `bg-red-700`；删除图标 `text-red-400 → text-red-600`。
  - 文案：`appText.ts` 术语全面中文化（`Left Join → 全部订单都保留`；`步骤1/2a/2b/2c/2d/3 → 第 N 步`；`模板表(Table2) → 金蝶模板表`；`运行口径 → 生成方式`；`填充规则/序号自增 → 自定义编号规则`）；新增 9 条关键配置项的说明文字（`hint*`）；校验提示统一为「还差一步：…」。
  - 布局：新增顶部**横向步骤条**（`components/combined/StepIndicator.tsx`，已完成/进行中/待开始，图标+文字双编码）；**S1 卡片补执行按钮**（就近原则）；一键/分步入口主次明确；项目名+修改时间三处重复收敛为 App 顶部一处。
  - 无障碍：图标按钮补 `aria-label`（侧栏 / 缩放 / 关闭 / 删除）；焦点统一 `.focus-ring`（`focus-visible:ring-2`）；两个模态框补 `role=dialog` + `aria-modal` + Esc + 焦点管理；`SearchableSelect` 补 combobox ARIA（`aria-haspopup/expanded/controls`、`listbox/option`）；字号下限提到 12px（清空 `text-[10px]`/`text-[11px]`）。
  - 体验：执行日志由深色终端风改为**句子列表 + 绿勾/转圈图标**；按钮加 `hover:scale-[1.02] active:scale-[0.98]`（`200ms`，仅 `transform`）；Toast 加关闭按钮 + 错误停留 7 秒；空态加图标。
  - 验证：`npm run typecheck` / `npm run lint` / `npm test` / `vite build` 全绿。
  - 明确**暂缓**（属结构性大改，需单独评估）：S1~S6 卡片「一次只展开当前步」的折叠引导、左/右侧栏位置对调、宽屏两列布局。
- **v3.6.2 出包（2026-10-06）**：执行 `npm run release` 成功，版本 `3.6.1 → 3.6.2`，产出 `release/新味智枢-v3.6.2-Setup.exe`（78 MB，NSIS x64，含界面设计整改全部内容）。
  - 排障：首次执行失败——`build-release.ps1` 为 **UTF-8 无 BOM**，PowerShell 5.1 按系统 ANSI(GBK) 解码，中文注释与 `═` 框线乱码，解析到注释处报「意外的标记 `}`」，**在递增版本之前**即中断（`package.json` 未被改动）。已补 **UTF-8 BOM**（2720 → 2723 字节）修复；后续勿用「另存为 ANSI / 无 BOM」覆盖该脚本。
  - 版本一致性实测（三处均为 `3.6.2`）：`package.json` · `dist/assets/index.js`（构建期注入的 `__APP_VERSION__`）· `app.asar` 内 `package.json`。
  - 遗留：`release/新味智枢-v3.6.1-Setup.exe`（旧包）与 `release/win-unpacked/` 仍在，未清理。
- **表格格式扩展 + 可视化迁至左侧栏（2026-10-17）**（详见《操作记录.md》同日条目）——
  - 读表：新增 `xlsx@0.18.5`（SheetJS）支持 `.xls`（BIFF）；自实现 RFC4180 CSV 解析 + 编码探测（UTF-8 BOM → UTF-16LE BOM → UTF-8 → GBK 回退）支持 `.csv`；`shared/excel.ts` 抽 `readRawSheet` 按扩展名分派，`.xlsx/.xlsm` 仍走 exceljs 原路径（行为口径不变）；`file:listExcelFiles` 白名单与渲染层拖拽 / dialog filters / 文案同步放开到 `.xlsx/.xls/.csv`。
  - 布局（**2026-10-17 二次调整**）：可视化改为 CombinedPage 内**双视图**——「分步操作（`step`，`max-w-5xl`）」与「**建模视图（`model`，`max-w-7xl`，Power BI 建模页风格，把 1~6 步图形一次全平铺）**」，切换态持久化 `localStorage`（`xwzs:combined:viewMode`）；原左侧可收起栏 `VisualSidePanel.tsx` **已删除**。顶部「操作流程 + 工具栏」两块粘性卡片压缩为**单块单行紧凑条**（`StepIndicator variant="chips"` 紧凑胶囊条 + 右侧「建模视图/分步操作 / 清空配置 / 一键完成整个流程」）。**环节切换入口统一到顶栏步骤条**（点击 = 回分步操作 + 滚动到对应步骤卡，偏移按顶栏实时高度计算）。环节跟随 = 顶栏点击 + 执行时自动切换。
  - 合并前检测（**2026-10-17 二次调整**）：`checkMergeFiles()`（订单文件 · 工作表名 / 字段一致性）+ `checkAuxDuplicateColumns()`（辅助表结构 · 原方式跨文件重名列，只报至少一方为辅助表的重复），**两个独立检测共用同一闸门、同一弹框**（`MergeCheckDialog`），只提示、可选继续。
  - 可视化（**2026-10-17 三次调整**）：界面3 由三栏 `SplitOrderView` 改为 **`SplitSketchView` 拆分示意图**——与界面1 合并示意图同款效果、方向相反（`合并结果.xlsx` → 箭头「拆分」→ 最多 2 个 `订单_{分组}_{单号}.xlsx` + 虚线省略号 + `订单拆分汇总.xlsx`）；原 `SplitOrderView.tsx` **已删除**。
  - 可视化（**2026-10-17 四次调整**）：S5 字段填充可视化与 S2 对齐——二者本就复用同一 `LeftJoinModelView`（拖拽建关系 / 拖动卡片 / 双击改删 / 缩放 / 搜索 完全一致），唯一差异是表头控件；改为 S5 也用「连接方式」下拉，**删除** `auxHeaderBadge` prop 与 `appText.mappingAuxBadge`（新增 `mappingJoinTypes` + `changeMappingJoinType`）。
  - 布局紧凑化（**2026-10-17 五次调整**）：**移除顶栏「清空配置」按钮**（清空能力由侧栏「新建项目」替代；`handleClearAllConfig()` 仍用于「无项目时重置」）；`App.tsx` 顶部标题栏 `px-6 py-5 → px-4 py-2.5` 并把项目名 / 修改时间**并为一行**、`main` `p-6 → px-4 py-3`；分步视图容器 `max-w-5xl → max-w-6xl`，容器与卡片间距整体收紧（`space-y-5 → space-y-3`、卡片 `p-4 → p-3`、卡内 `mb-4/mt-4 → mb-3/mt-3`）。
  - 标题行收纳与弹框化（**2026-10-17 六次调整**）：S1~S6 执行按钮（S2 / S5 另含「保存到项目」）从独立按钮行移到**标题行右侧**（省 6 行）；「自定义编号规则」由水平滚动大卡片列表改为**紧凑摘要行 + 「配置」按钮 + `SeqRuleDialog` 弹框**（`seqSummary()` 出摘要，完整参数收进弹框）；建模视图的**合并 / 拆分示意图改横向排列**（左列输入 → 向右箭头 → 右列输出），减少纵向占用。
  - 验证：`typecheck` 0 error · `lint` 通过 · `vite build` 三产物成功（xlsx 已打包进主进程 bundle）· `vitest` 新增 5 例（含真实 BIFF8 / GBK 字节）全通过 · `npm run dev` 启动成功。
  - **未递增版本、未打包**（出包需用户显式授权）。
- **v4.0.0 大版本发布（2026-10-18）**（详见《操作记录.md》同日条目与《任务拆分.md》T20~T25）——
  - 流程重构：原表预处理拆为两个独立步骤（S1 合并原表 → S2 合并辅助表）；检测闸门同步拆分（工作表名/字段一致性 · 辅助表重名列分别把守 S1/S2）；第 6 步「合并目标表+导出」保持单步；全界面术语统一为「原表 / 目标表」（《UI设计规范.md》§9 术语表）。
  - 数据转换（可选）：第 6 步新增四种规则——文本转数字（千分位/全角/货币符号清洗）、数字转文本（`@` 格式）、替换文字（普通/正则）、公式计算（计算后填值，自写安全求值器）；仅数据行、失败保原值不中断；规则随项目保存。
  - 界面体验：建模视图定位「检查配置」（未使用字段默认隐藏）；日志区移至底部；HelpTip 全部 portal 顶层化；视图切换按钮深色底区分 + 建模视图浅绿背景；字号按微信电脑端收敛（16/14/12 三档，《UI设计规范.md》§3.2）。
  - 个人设置「配色方案」：CSS 变量换肤基建（primary 全阶变量化）；6 元素方案模型（页面/建模背景、主按钮、强调色/浅底/边框）；默认方案锁定可复制；PS 风格取色器（SV 画板 + 色相条）；方案另存/删除，localStorage 持久化。
  - 工程化：死代码清理（moduleRegistry、bat×3）；测试体系 **10 → 31 用例**（新增 leftJoin 6 例 + transform 15 例）；`typecheck` / `lint` 全绿。
  - 产物：`release/新味智枢-v4.0.0-Setup.exe`（NSIS x64）。
- 下一步：见《任务拆分.md》「待确认 / 后续可扩展」；深度的 S1~S6 步骤卡组件拆分与 LeftJoinModelView 渲染优化已列出但**未实施**（属大改，需单独评估）。
