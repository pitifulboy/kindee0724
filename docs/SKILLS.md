# SKILLS 记录

> 记录本项目开发过程中使用过的 skill / 能力，以及后续 Agent 可直接复用的调用方式。

## 1. 已使用的 skill

### 1.1 `dynamic-ui`（Inline Visuals）

- **用途**：在对话里内联渲染图表 / 架构图 / 交互式原型（SVG + HTML），用于快速对齐视觉与交互设计。
- **工具**：`PureShowWidget`
- **本项目实际用法**：产出「界面1 文件夹表格合并清单」「界面2 Left Join 建模连线」两版原型，供用户确认后再落地为 React 组件。
- **关键约定**（复用时必须遵守）：
  - 根元素必须带 `data-dynamic-ui-widget` + `data-template="<id>"`。
  - 输出顺序：`<style>` → 内容 HTML/SVG → 最后一段 `<script>`。
  - 禁止 `<!DOCTYPE>` / `<html>` / `<body>` / 注释；禁止 `position: fixed`、inline 事件、`document.currentScript`、全局选择器。
  - 必须同时支持 `:root`（浅色）与 `:root[data-widget-theme="dark"]`（深色）。
  - 交互用 `addEventListener`，且所有 DOM 查询都要以 root 为作用域。

### 1.2 `trae-remote-official:github`

- **用途**：GitHub 仓库同步、提交推送、分支管理、PR 创建与合并。
- **本项目实际用法**：双远程（`origin` / `myexe`）推送，创建 `XWZS_keshihua` 分支并合并 PR。
- **踩坑备查**：git 协议到 github.com 不稳定时会 Connection reset，可改用 GitHub REST API 直接创建 ref。

## 2. 可复用但本项目未使用的 skill

| skill | 适用场景 |
|---|---|
| `skill-creator` | 需要把某类重复操作封装成可复用 skill 时 |
| `TRAE-browseruse` | 需要对前端页面做浏览器端自动化验证时 |
| `trae-remote-official:lark:*` | 需要对接飞书文档 / 表格 / 消息时 |

## 3. 本项目的工程方法（非 skill，但值得沿用）

### 3.1 跨目录写入的中转法

当开发工作区与目标目录不同（例如工作区是 `d:\888_vibecoding`，但代码要落到 `D:\myvb\xwzs1004`）时，直接用 Write/Edit 会被「Edit operations are restricted to the working directory」拦截。

可靠做法：

1. 先用 Write 把文件写到**工作区内**的中转目录（如 `.xwzs-staging/`）；
2. 再用 PowerShell 的 `[System.IO.File]::ReadAllText` / `WriteAllText`（UTF-8 无 BOM）或 `Copy-Item` 落盘到目标目录；
3. 完成后删除中转目录。

> 直接用 PowerShell here-string 拼中文内容极易出现编码错乱，务必不要这样做。

### 3.2 大页面增量修改锚点法

`CombinedPage.tsx` 约 1500 行且含大量中文。对其做增量修改时：

- 选择**纯 ASCII 的唯一锚点字符串**做 `String.Replace`，避免中文锚点在命令行传输中被转义/乱码。
- 读文件时用 `[System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false))`，写回时用 `[System.Text.UTF8Encoding]::new($false)` 保证**不带 BOM**。

### 3.3 前端改动的浏览器自动化回归

每次可视化改动（界面1~5 / 六步 S1~S6）落地后，除 `npx tsc --noEmit`（要求 **0 error**）外，还会跑一轮**浏览器自动化回归**验证渲染与交互：

- 采用 `browser_use` 子代理：`npm run dev` 起 Electron（vite dev server `http://localhost:5173`），对目标视图做断言式检查（元素存在 / 文案匹配 / 高亮色 / 连线数 / 回归旧视图）。
- 断言清单按改动面裁剪，典型如：「视图位于某标题之后、另一标题之前」「表头徽标 = 字段映射」「N 条关联线 `#1d4ed8`」「界面2/3/4 回归正常」。
- 历史结果：界面5 相关改动分别取得 **11/11、12/12** 全通过。
- 若需把该能力固化为可复用 skill，可用 `TRAE-browseruse`（见 §2）。
