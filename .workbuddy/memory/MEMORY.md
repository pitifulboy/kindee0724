# 项目记忆 — Electron 离线办公工具

## 项目概况
- **名称**: electron-office（离线办公工具）
- **架构**: Electron + React 19 + TypeScript + Tailwind CSS + Redux Toolkit
- **特点**: 纯本地离线，无任何网络请求，Windows NSIS 安装包
- **文档**: `docs/AI-AGENT-DEV-GUIDE.md`（开发规则）、`docs/PROGRESS.md`（进度追踪）

## 分阶段规划
1. 阶段一：基础框架 + PDF转图片 — 完成
2. 阶段二：PDF全功能（图片转PDF完成、PDF合并完成、PDF拆分完成）— 完成
3. 阶段三（当前）：Excel 批量合并 — 完成（v2.7.0），改用 exceljs 纯 JS 方案（非 Python）
4. 阶段四：Excel 数据分析 + 可视化

## 当前版本
- **v2.7.0**（2026-07-22）：新增 Excel 批量合并模块（exceljs + 自实现 join + 预设记忆）
- v1.3.0（2026-07-05）：修复PDF合并/拆分空白页Bug（移除useObjectStreams:false）
- v1.2.0：PDF合并/拆分功能分离 + 版本号修正
- v1.1.0：新增图片转PDF、PDF合并、PDF拆分、拖拽文件夹批量转换
- v1.0.0：基础框架 + PDF转图片（已测试通过，勿覆盖）

## 关键技术决策
- **Canvas 渲染**: 使用 `@napi-rs/canvas`（Rust预编译）替代 `canvas`（C++原生编译）
- **pdfjs-dist**: v4.10.38 为纯 ESM，使用 `await import()` 动态加载
- **CanvasFactory**: 自定义 `NodeCanvasFactory` 桥接 pdfjs-dist 内部临时画布需求
- **Worker**: `require.resolve` 找路径 + `url.pathToFileURL()` 转 file:// URL（Windows 必需）
- **Dev模式检测**: 使用 `process.env.VITE_DEV_SERVER_URL`（非 NODE_ENV）
- **多模块导航**: moduleRegistry 注册表模式，新模块即插即用
- **IPC 契约**: 统一 `{success, data?, error?}` 响应格式
- **文件名防冲突**: getUniqueOutputDir() 同名PDF自动加序号
- **Node.js 22+ API Polyfill**: Electron 29 用 Node.js 20，需 polyfill `process.getBuiltinModule` + `Promise.withResolvers`
- **全局 API 注入**: @napi-rs/canvas 的 Path2D/ImageData/Image 需手动注入 globalThis
- **CJK 支持**: getDocument 需配置 `cMapUrl` + `cMapPacked: true`（cmaps 在 pdfjs-dist/cmaps/）
- **JPEG 质量**: @napi-rs/canvas 的 toBuffer 第二参数为 `{ quality }` 对象，非裸数字
- **资源释放**: pdfDoc.destroy()/page.cleanup()/loadingTask.destroy() 必须 try-finally
- **Canvas 内存**: toBuffer 后设 canvas.width=0; height=0 释放 Skia 位图
- **打包依赖白名单**: electron-builder files 必须覆盖所有运行时 require 的依赖，包括间接依赖（如 pdf-lib 的 pako/tslib、exceljs 的 jszip/archiver 等55个包）
- **exceljs**: v4.4.0 纯 JS Excel 库，getCell 为 1-based，单元格值可能是对象类型需处理
- **Excel join 逻辑**: 自实现 Map 查找（非 SQL），key 用 \x00 分隔多字段值，列名冲突加 _{表名} 后缀
- **预设持久化**: 存储到 userData/excel-merge-presets.json，跨重启保留

## 图片转PDF功能（2026-07-05 完成）
- 拖拽排序：HTML5 原生 draggable，保留上移/下移按钮，转换中禁用
- 智能默认命名：第一张图片名(去扩展名)+.pdf，用户可改
- 智能默认路径：第一张图片所在目录，用户可改
- 文件名和目录分离输入，转换时拼接完整路径
- 涉及文件：renderer/pages/ImageToPdfPage.tsx（纯前端改造，后端零改动）

## PDF转图片 — 拖拽文件夹批量转换（2026-07-04 完成）
- 新增 `file:scanPdfsInDir` IPC handler，递归扫描文件夹内 PDF
- 三重防护：lstatSync 跳过符号链接 + visited Set 防循环 + 深度限制 20 层
- 前端 handleDrop 支持混合拖入（PDF文件 + 文件夹），isScanning 状态防重入
- 空 PDF 文件夹给用户 toast 反馈"未在文件夹中找到PDF文件"
- 涉及文件：main/ipc/index.ts、preload/index.ts、renderer/types/electron.d.ts、renderer/pages/PdfConvertPage.tsx

## PDF合并 + PDF拆分功能（2026-07-05 完成）
- PDF合并/拆分Bug修复：save({ useObjectStreams: false }) 会导致空白页，改为默认 save()
- PDF拆分页面新建：3种模式（自定义范围/每页一个/每N页一个），智能默认值
- 导航拆分：moduleRegistry 原"PDF合并拆分"→"PDF合并"+"PDF拆分"两个独立入口
- 页码范围正则支持单页+范围+混合：`/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/`
- pdf-lib load/save 修复必须对称应用于 pdfMerge 和 pdfSplit 两个服务
- 涉及文件：pdfMerge/service.ts、pdfSplit/service.ts、PdfSplitPage.tsx(新建)、moduleRegistry.tsx、App.tsx

## Excel 批量合并功能（2026-07-22 完成）
- 技术栈：exceljs@4.4.0（纯 JS，无原生编译）
- 核心功能：多订单文件合并 + 1~N 辅助表动态关联 + 预设记忆 + 多业务场景
- join 逻辑：自实现 Map 查找，支持 left/inner/right join + 多字段联合匹配
- 预设管理：CRUD + JSON 持久化到 userData 目录
- 前端页面：预设栏 + 订单文件区 + 辅助表配置卡片 + 输出执行区 + 进度日志
- 开发文档：`docs/excel-merge-dev-task.md`（自包含规格文档）
- 涉及文件：excelMerge/{types,presetManager,service,index}.ts + ExcelMergePage.tsx + 7个增量修改

## 已知待处理项
- postcss.config.js 模块类型警告（非阻塞）
- v2.7.0 打包验证待执行（`npm run build`）
- 既有 TypeScript 类型错误 ~11 个（info.data possibly undefined、module 解析），非阻塞技术债
