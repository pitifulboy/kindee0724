# UI 设计规范 · 新味智枢

> **定位**：本项目的**规范性**文档（不是评审报告）。写界面代码前先查本文；评审 / 整改结论汇总见《界面设计评审报告-2026-10-06.md》《界面整改概述-2026-10-06.md》。
> **适用**：`src-electron/renderer/` 全部界面。基准窗口 1280×800，最小可用宽度约 1024。
> **来源**：公开设计规范调研（Material Design 3 / WCAG 2.2 / NN/g，链接见 §8）+ 本项目既有硬约束。
> **建立**：2026-10-17。

---

## 0. 一句话

面向「高中 ~ 大专学历的企业文员」的**离线桌面工具**：

> **文字要大、指引要少而准、层级要一眼看清。**

配套三条不可退让的底线：

1. **正文不小于 14px**，12px 只能用于「辅助/摘要」；**禁止 10px / 11px**。
2. **关键信息必须常显**（状态、校验、报错、结果），只有「可选的补充说明」才允许收进悬浮提示。
3. 除「黑底白字 / 错误红 / 成功绿」外，**文字一律黑色**（`text-black`，辅助信息下限 `text-black/60`）。

---

## 1. 用户与设计原则

目标用户画像（摘自评审报告）：Excel 熟练但不懂编程概念、会操作但不敢乱点、可能 30~50 岁视力一般、只做本职流程不探索、一次处理大批文件怕出错。

由此确定 5 条设计原则（**规范性条款**）：

| # | 原则 | 落地要求 |
|---|---|---|
| P1 | 一次只让用户面对一件事 | 六步是流程，逐步引导；不得把六步控件默认全铺开 |
| P2 | 用业务词，不用技术词 | 「保留全部订单」而不是「Left Join」；文案集中于 `config/appText.ts` |
| P3 | 执行按钮紧贴它作用的区域 | 按钮就近放在它作用的卡片标题行 |
| P4 | 任何状态都要有文字说明 | 不能只靠颜色/图标传达成功或失败 |
| P5 | 重要反馈必须够大、够清晰 | 拖拽悬停、错误提示是最关键的两个时刻 |

> P4 与「指引收进提示气泡」的边界由 §5 的**指引分层表**裁定。

---

## 2. 公开规范调研（我们采纳了什么）

| 公开规范 | 关键条款（原文要点） | 本项目采纳方式 |
|---|---|---|
| **Material Design 3 · Spacing** | 间距体系建在 **8dp 网格**上（`space100 = 8dp`），组件内可用 4dp；间距分 padding（内部）/ gap（元素间）/ margin（外部），且**优先用 padding 与 gap，少用 margin** | 见 §3.1：间距只取 4 / 8 / 12 / 16 / 24，禁止 5 / 7 / 10 / 14 之类「随手值」；卡片内用 padding、卡片间用 gap |
| **Material Design 3 · Typography** | 一套**类型比例（type scale）**统一产品字号；小字号用于 Body / Label，需保证可读性；正文基准 14~16px | 见 §3.2：本项目只保留 4 档字号，正文基准 **14px** |
| **WCAG 2.2 · 2.5.8 Target Size (Minimum)（AA）** | 指针目标 ≥ **24×24 CSS px**（或满足 24px 圆间距例外） | 「?」图标等小控件必须有 ≥24px 触达区（§5.3） |
| **WCAG 2.1/2.2 · 2.5.5 Target Size (Enhanced)（AAA）** | 推荐 44×44 px | 高频 / 不可撤销的操作（如执行按钮）按大按钮做 |
| **WCAG · 1.4.13 Content on Hover or Focus（AA）** | 悬浮/聚焦出现的内容必须 **可悬停（Hoverable）· 可清除（Dismissible）· 持久（Persistent）** | 「?」提示必须：指针能移入气泡不消失、Esc 可关、不自动消失（§5.3） |
| **WCAG · 2.1.1 Keyboard（A）** | 所有功能键盘可达 | 「?」提示除 hover 外必须支持 **focus 触发**，并用 `aria-describedby` 关联 |
| **WCAG · 1.4.4 Resize Text / 1.4.12 Text Spacing** | 文本可放大到 200% 不丢内容；行高、字距可调 | 字号用相对类（`text-sm` 等）而非固定 `px` 硬值；行高统一 1.5 左右 |
| **NN/g · Info Tips（2026-01）** | 信息提示（`?` / `i` 图标）适合**补充、可选**信息；**不应把必备信息藏进气泡**，也不应让气泡内容过长（「jump scare」）；`?` 图标语义偏「帮助/支持」，**离被说明的元素越近，越被理解为局部而非全局帮助** | 见 §5：只把「可选补充说明」收进 `?`；图标紧贴标签/标题；单条 ≤ 2 句 |
| **NN/g · Tooltip Guidelines** | tooltip 是**用户主动触发**的简短说明；触发方式须同时支持鼠标与键盘；不要给每个元素都挂 tooltip | 见 §5.2 / §5.3：不做「每项都加 `?`」，只给「看了会更好、不看也能做」的项加 |
| **NN/g · Heuristic #10 Help and Documentation** | 帮助应「易查、聚焦用户任务、给出具体步骤、不要太大」 | 气泡文案一律写成「怎么做」而非「概念是什么」 |

---

## 3. 设计令牌（Design Tokens）

### 3.1 间距

间距只允许下列取值（4 的倍数），命名沿用 Tailwind：

| Token | 值 | 用途 |
|---|---|---|
| `0.5` | 2px | 仅图标与紧邻文字的微调 |
| `1` | 4px | 组件内：图标与文字、徽标与文字 |
| `2` | 8px | 组件内：同一行元素之间（`gap-2`） |
| `3` | 12px | **卡片内边距（`p-3`）、卡片之间（`space-y-3`）** |
| `4` | 16px | 区块之间（`space-y-4`）、页面内容左右边距（`px-4`） |
| `6` | 24px | 大分区之间（少用） |

**禁止**：`gap-2.5`、`p-3.5`、`mb-1.5`、`mt-2.5` 等非 4 倍数「随手值」；已在使用的历史值在改动该处时**一并归位**。
**优先 padding，少用 margin**；能用父级 `space-y-*` / `gap-*` 表达时，不要给子元素加 `mt-*` / `mb-*`。

### 3.2 字号与行高

**字号阶梯以微信电脑端（Windows）为基准，只允许 3 档常规字号**：

| Token | 字号 | 行高 | 用途（白名单） | 微信对照 |
|---|---|---|---|---|
| `text-base` | 16px | 1.4 | 步骤卡 / 区块 / 弹框标题（`h2`）、关键结果数字、顶栏应用名 | 会话名 / 面板标题 |
| `text-sm` | 14px | 1.5 | **默认正文**：表单标签、输入框内容、按钮文案、列表主信息、下拉项、完成状态、警告提示 | 聊天正文 / 列表项 / 按钮 |
| `text-xs` | 12px | 1.5 | **仅限辅助**：图例、时间戳、执行日志、统计摘要、输出路径、条数徽标、「列数」徽标、tooltip 内文字、步骤卡描述 | 时间戳 / 摘要 / 角标 |

**硬性规则**
- 禁止 `text-[10px]` / `text-[11px]` / `text-[13px]` 等任意像素值；禁止 18px 及以上（`text-lg` / `text-xl` / `text-2xl` 已全量下线）。
- 一处文案若「用户必须读懂才能正确操作」，**不得**用 `text-xs`。
- 同一个逻辑块的标签、值、按钮三者字号必须一致。
- 辅助信息（路径、日志、摘要、徽标）一律 12px，不得因醒目需求升到 14px；需要强调用颜色 / 加粗实现，不升字号。

### 3.3 圆角 / 边框 / 阴影

| 元素 | 规范 |
|---|---|
| 卡片 | `rounded-lg` + `border`（默认 `border-gray-200`；当前步骤卡用 `border-2 border-blue-200` 强调步序，保留） |
| 按钮 / 输入 | `rounded-lg` |
| 徽标 / 胶囊 | `rounded-full` |
| 阴影 | 卡片默认无阴影；**悬浮/拖拽中**才用 `shadow-sm` / `shadow-lg` |

### 3.4 颜色与对比度

沿用既有硬约束（详见《README.md》）：主色单调蓝色系 `primary-50~900`；成功用 `success-*`、错误用 `red-600`；文字黑色（`text-black`、`text-black/70`、下限 `text-black/60`）；主色按钮白字 6.72:1 为**已批准例外**；tooltip 用黑底白字（同为已批准例外）。所有文字对比度 ≥ WCAG AA（4.5:1，大字号 3:1）。

### 3.5 配色方案（个人设置换肤）

软件支持用户级配色方案（顶栏齿轮「个人设置」），规范如下：

**换肤基建**
- `index.css` `:root` 定义 CSS 变量：`--ui-page-bg` / `--ui-model-bg` / `--ui-primary` / `--ui-primary-hover` / `--ui-primary-border` / `--ui-primary-soft` / `--ui-primary-300~600` / `--ui-primary-900`；Tailwind `primary` 全阶（50~900）引用这些变量。
- **新增组件一律使用 `primary-*` 语义类，禁止硬编码蓝色 hex**，否则换肤时该处不变色。
- 语义色（`success-*` / `red-*` / `amber-*`）**不纳入方案**，状态含义全局一致。

**方案模型**
- 每个方案含 6 个元素颜色：页面背景 / 建模视图背景 / 主按钮 / 强调色（链接、悬浮）/ 强调浅底 / 强调边框；主按钮亮暗阶（300/400/500/600/900）由主色自动派生，不单列。
- **默认方案 = 软件原版配色，锁定不可修改，可复制**；用户方案可另存、删除（两击确认），编辑即时生效并持久化（localStorage `xwzs:settings:colorSchemes` / `xwzs:settings:activeSchemeId`）。
- 建模视图背景是独立元素（与分步操作视图区分的硬约束不变），不随「页面背景」变化。
- 元素编辑入口：色块展开 PS 风格取色器（SV 方块 + 色相条）或直接输入 hex。

---

## 4. 布局规范

### 4.1 页面骨架

```
┌ 顶栏（单行，px-4 py-2.5，高 ≤ 48px）：项目名 + 最后修改时间 ──────────┐
├ 粘性操作条（单行紧凑胶囊步骤条 + 右侧视图切换/一键完成）─────────────┤
└ main（px-4 py-3，overflow-y-auto）──────────────────────────────┘
    ├ 分步操作视图：max-w-6xl，space-y-3
    └ 建模视图：max-w-7xl，grid gap-3（xl 两列）
```

- 顶栏**永远单行**；粘性条**永远单行**（换行会破坏「跳转偏移」计算）。
- 视图切换由 `viewMode: 'step' | 'model'` 控制，持久化 `localStorage`。

### 4.2 卡片

- 内边距统一 `p-3`（12px）；卡片之间 `space-y-3`。
- 卡片标题行结构固定为：
  ```
  [序号圆点] 标题  （依赖提示）        ……         [完成标签] [执行按钮]
  ```
  即 `flex items-center gap-2` + `<h2 className="... flex items-center min-w-0">` + `<div className="flex-1" />` + 完成标签 + 按钮。**执行按钮必须在标题行**（P3）。
- 卡片描述行紧随标题，`text-xs` + `ml-8`（与标题文字对齐）。

### 4.3 表单行

- 禁止用固定左偏移对齐标签（历史违规：`ml-56`）。改用 **`grid grid-cols-[auto_1fr]`** 或 `flex` + `w-32/w-56` 标签 + `flex-1` 控件。
- 标签与控件之间 `gap-2`；同一表单内多行之间 `space-y-2`。
- 长文本一律 `truncate` + `title` 兜底，**禁止靠换行撑高行**（会破坏紧凑度）。

### 4.4 兜底

- 任何横向容器（`overflow-x-auto`）必须在窄窗口下可用；优先改为换行 / 摘要行，而非横向滚动（历史：编号规则曾用横向滚动大卡片，已改摘要行）。
- 空态文案居中、`py-4`（原 `py-6` 已收紧）。

---

## 5. 指引信息分层规范

> 这是本项目**最重要**的一条界面规则，直接决定「界面上到底该显示哪些文字」。

### 5.1 分层表（规范性）

| 类型 | 举例（`appText` 键） | 处理方式 |
|---|---|---|
| **状态 / 校验 / 报错 / 结果** | `validate*`、`stepDone*`、`result*`、`fallbackWarning`、`dragExcelHint`（Toast） | **必须常显**，绝不允许收进 `?` 气泡 |
| **步骤一句话说明** | `stepS1Desc` ~ `stepS6Desc` | **收进 `?` 气泡**，图标紧贴步骤标题（经用户 2026-10-18 确认：标题下不再常显） |
| **可视化图例 / 示意图注脚** | `legendHint`、`mergeSketchOnlyTwo`、`splitSketchOnlyTwo` | **常显**（图例本身就是指引） |
| **拖拽区占位提示** | `placeholderDragFile`、`placeholderDragOrClick` | **常显**（同时是空态提示） |
| **字段级补充说明** | `hintAuxTable`、`hintJoinType`、`hintGroupBy`、`hintTemplate`、`hintTemplateHeader`、`hintMatchField`、`hintOutputDir`、`hintOrderFiles` | **收进 `?` 气泡**，图标紧贴对应标签/标题 |
| **操作流程补充说明** | `stepS1SharedHint`、`sectionFillRulesHint`、`hintStep5`、`viewModelHint` | **收进 `?` 气泡**，图标贴在区块标题右侧 |
| **按钮旁的次要提示** | `hintStep3`、`hintStep4`（如仍在使用） | 有对应字段标签则收进该标签的 `?`；无则删除（与 `stepS*Desc` 重复） |

### 5.2 判断口诀

> 用户**不看这条说明就做不下去** → 常显；**看了会做得更对，不看也能做** → 收进 `?`。

NN/g 的警告同样适用：**`?` 不是「界面太挤」的垃圾桶**。若某条说明其实很关键，正确做法是把标签/字段本身写清楚（P2 用业务词），而不是把它藏起来。

### 5.3 「?」提示组件规范（`HelpTip`）

**必做（无障碍，全部为验收项）**

| 项 | 要求 |
|---|---|
| 触达区 | ≥ 24×24 CSS px（图标 16px + `p-1`，见 WCAG 2.5.8） |
| 触发 | `mouseenter` / `mouseleave` **且** `focus` / `blur`（键盘可达，WCAG 2.1.1） |
| 关闭 | Esc 关闭；移出 / 失焦关闭（WCAG 1.4.13 Dismissible） |
| 可悬停 | 气泡与触发器之间无空隙（或用 `padding` 桥接），指针可移入气泡而不消失（Hoverable） |
| 持久 | **不自动消失**（Persistent） |
| 语义 | 触发器 `aria-describedby={tipId}`；气泡 `role="tooltip"`；触发器 `aria-label` 说明其用途 |
| 点击兜底 | 允许点击切换（无鼠标 / 触控场景可达） |

**视觉 / 内容**

- 触发器：`?` 圆圈图标，`text-black/60`，`hover:text-black`，与所说明文字 `gap-1`，**垂直居中**。
- 气泡：`bg-black/85 text-white text-xs rounded-md px-2 py-1`，`max-w-xs`，单条 **≤ 2 句**，默认出现在触发器**下方**（避免被粘性顶栏遮挡），不做箭头指向动画。
- 不承载「必须知道才能继续」的信息（见 §5.1）。

---

## 6. 无障碍基线（本项目 AA 落地清单）

- [x] 模态框：`role="dialog"` + `aria-modal` + 打开聚焦主按钮 + Esc 关闭 + 关闭归还焦点
- [x] 图标按钮：`aria-label`
- [x] 统一 `.focus-ring`
- [x] **「?」提示**：`role="tooltip"` + focus 触发 + Esc 关闭（已落地 `HelpTip.tsx`，见 §5.3）
- [x] 最小触达区 24×24（`HelpTip` 触发器为 24×24 按钮）
- [x] 文字对比度（AA）
- [ ] 键盘 Tab 顺序：顶栏 → 粘性条 → 各步骤卡（改动布局时需回归）

---

## 7. 本轮需求落地建议（4 项）

> 需求原文：「1，调整布局，让布局合理。2，调整文字大小，让排版更合理。3，调整操作指引文字，用图标问号。鼠标悬浮到问号上，才展示指引文字。4，寻找公开软件设计规范，给我调整建议。」

| # | 需求 | 落地做法（依据条款） | 验收标准 |
|---|---|---|---|
| 1 | 调整布局 | §4.2 执行按钮移入标题行（已完成）；§4.3 消除固定左偏移（`ml-56` → `grid`/`flex`）；§3.1 间距统一为 4 的倍数（`mb-1.5`/`p-3.5` 等归位）；长文本一律 `truncate` | 全库无 `ml-[0-9]+` 硬偏移、无非 4 倍数间距类；1280 宽下无横向滚动条 |
| 2 | 调整字号 | §3.2：表单标签 / 输入值 / 按钮 / 列表主信息由 `text-xs` 提到 `text-sm`；`text-xs` 仅保留辅助白名单；同一逻辑块三类文字字号一致 | 全库 `text-[10px]`/`text-[11px]` 为 0；`text-xs` 数量下降 ≥ 30% 且仅出现在白名单场景 |
| 3 | 指引改「?」悬浮 | §5.1 分层表：8 条字段级 + 4 条流程级说明收进 `HelpTip`；关键信息（校验/状态/结果/图例/空态）保持常显；§5.3 无障碍全项 | 悬浮/聚焦均出气泡；Esc 可关；气泡可移入不消失；无任何 `validate*`/`stepDone*` 被移入气泡 |
| 4 | 公开规范建议 | 即本文 §2 / §3 / §4 / §5（含来源链接 §8） | 本文入库并在《README.md》文档索引登记 |

**顺序**：先落地 §7-3（会显著减少行高，为 §7-1 让出空间）→ 再 §7-2 字号 → 再 §7-1 间距归位 → 最后回归《界面设计评审报告》L1~L4 结论是否仍成立。

---

## 8. 常见违规 → 正确写法

| 违规写法 | 正确写法 | 依据 |
|---|---|---|
| `text-[10px]` / `text-[11px]` | `text-xs`（12px）起 | §3.2 |
| 标签 `text-xs`，值 `text-sm` | 两者都用 `text-sm` | §3.2 |
| `ml-56` 标签对齐 | `grid grid-cols-[auto_1fr]` 或 `flex` + `w-56` | §4.3 |
| `mb-1.5` / `p-3.5` | `mb-2` / `p-3`（4 的倍数） | §3.1 |
| 给每个表单行都挂 `?` | 只给「不看也能做」的项挂 `?` | §5.2 |
| 把校验信息做成 tooltip | 校验必须常显 | §5.1 / P4 |
| 横向滚动装大卡片 | 改摘要行 + 弹框 | §4.4 |
| 子元素各自 `mt-*` | 父级 `space-y-*` / `gap-*` | §3.1 |

---

## 9. 术语表（界面文案统一口径）

自 2026-10-18 起，界面可见文案统一使用下列术语；旧表述禁止再出现在渲染层。

| 术语 | 含义 | 禁用旧表述 |
|---|---|---|
| 原表 | 用户提供的订单 Excel / CSV 输入文件（第 1 步的输入） | 订单 Excel、订单表（输入语境） |
| 合并原表 | 第 1 步产物：多个原表纵向合并的中间结果（`合并原表.xlsx`） | 合并表 |
| 辅助表 | 按匹配列补充进来的参考资料表（物料编码表、客户资料表等） | — |
| 合并结果 | 第 2 步产物：合并原表 LEFT JOIN 辅助表后的最终合并表（`合并结果.xlsx`），第 3~5 步的数据源 | 合并表 |
| 目标表 | 从金蝶导出的导入模板文件，数据最终要填充进去 | 金蝶模板表、模板表 |
| 订单拆分 | 第 3 步业务动作：按拆分依据把合并结果拆成一个个订单文件 | — |
| 金蝶导入表 | 第 6 步最终输出：可导入金蝶的汇总表 | — |

使用规则：

- 面向用户的可见文案一律使用上表术语；「订单」仅保留在业务动作与产物文件名中（订单拆分、`订单_{组}_{单号}.xlsx`）。
- 六步标准名称：① 合并原表 ② 合并辅助表 ③ 订单拆分 ④ 目标表匹配 ⑤ 字段填充 ⑥ 汇总输出。
- 代码注释与变量名可保留 order / template 等英文，不强制改名；文案集中在 `config/appText.ts` 维护。

---

## 10. 参考来源

- [Material Design 3 · Spacing](https://m3.material.io/styles/spacing) —— 8dp 间距体系、padding/gap/margin 分工
- [Material Design 3 · Typography / type scale](https://m3.material.io/styles/typography/type-scale-tokens) —— 类型比例（type scale）
- [Material Design 2 · Spacing methods](https://m2.material.io/design/layout/spacing-methods.html) —— 8dp 基线网格、4dp 辅助网格
- [WCAG 2.2 · Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) —— 目标 ≥ 24×24 CSS px
- [WCAG · Understanding SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) —— 推荐 44×44 px
- [WCAG 2.1 · 1.4.13 Content on Hover or Focus](https://www.w3.org/TR/WCAG21/) —— 可悬停 / 可清除 / 持久
- [W3C Technique SCR39 · Making content on focus or hover hoverable, dismissible, and persistent](https://w3c.github.io/wcag/techniques/client-side-script/SCR39) —— 实现细节（Esc 关闭、指针可移入）
- [NN/g · Why So Many Info Tips Are Bad (and How to Make Them Better)](https://www.nngroup.com/articles/info-tips-bad/) —— 信息提示的适用边界、《?》图标语义与邻近性原则
- [NN/g · Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/) —— tooltip 触发方式与内容长度
- [NN/g · Help and Documentation (Heuristic #10)](https://www.nngroup.com/articles/help-and-documentation/) —— 帮助要聚焦任务、给具体步骤
