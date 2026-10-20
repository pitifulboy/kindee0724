/**
 * 应用 UI 文字配置
 * 集中管理所有界面可见文本，方便统一修改软件名称、标签等文字内容。
 * 按模块/组件分组组织。
 *
 * 文案基线：面向高中~大专学历的企业文员。
 * - 用业务词，不用技术词（如「全部订单都保留」而非「Left Join」）
 * - 步骤编号统一为「第 N 步」，与界面 1~6 一致（不再出现 2a/2b/S3 之类内部代号）
 * - 报错说「怎么改」，而不只是「哪里错」
 */

// ═══════════════════════════════════════════════════════════════
// 应用全局
// ═══════════════════════════════════════════════════════════════
export const app = {
  name: '新味智枢',
  /** 版本号单一来源：由 Vite 构建期注入（取自 package.json.version） */
  version: `v${__APP_VERSION__}`,
  statusOnline: '本地离线',
  statusRunning: '本地运行中',
  footerText: '所有数据均在本机处理 · 不联网 · 安全可靠',
  defaultNewProject: '新项目',
  placeholderSelectProject: '请先新建或选择一个项目',
  locale: 'zh-CN',
  lastModified: '最后修改：',
}

// ═══════════════════════════════════════════════════════════════
// 侧边栏 Sidebar
// ═══════════════════════════════════════════════════════════════
export const sidebar = {
  projectListTitle: '项目列表',
  emptyProjectHint: '还没有项目',
  emptyProjectAction: '点右上角 + 新建项目',
  newProjectTitle: '新建项目',
  renameTitle: '重命名',
  deleteTitle: '删除',
  copyProject: '复制项目',
  importBtn: '导入',
  exportBtn: '导出',
  importFromFileHint: '松手即导入这个项目',
  importPresetTitle: '导入项目预设',
  exportPresetTitle: '导出项目预设',
  copySuffix: ' - 副本',
}

// ═══════════════════════════════════════════════════════════════
// 消息提示（alert / toast）
// ═══════════════════════════════════════════════════════════════
export const message = {
  // ── 导入 ──
  importSuccess: (count: number) => `导入成功！共导入 ${count} 个项目。`,
  importFail: (err: string) => `导入失败: ${err}`,
  importError: (err: string) => `导入出错: ${err}`,
  userCancel: '用户取消',

  // ── 拖拽导入 ──
  dragImportSuccess: (count: number) => `导入成功！共导入 ${count} 个项目。`,
  dragImportFail: (err: string) => `导入失败: ${err}`,
  dragImportError: (err: string) => `导入出错: ${err}`,

  // ── 导出 ──
  exportSuccess: (count: number, filePath: string) =>
    `导出成功！共导出 ${count} 个项目。\n文件已保存到：\n${filePath}`,
  exportFail: (err: string) => `导出失败: ${err}`,
  exportError: (err: string) => `导出出错: ${err}`,

  // ── 复制 ──
  copyNotFound: '复制失败: 找不到原项目',
  copyFail: (err: string) => `复制失败: ${err}`,
  copyError: (err: string) => `复制出错: ${err}`,

  // ── 新建 ──
  createFail: (err: string) => `新建项目失败: ${err || '未知错误'}`,
  createError: (err: string) => `新建项目出错: ${err}`,
}

// ═══════════════════════════════════════════════════════════════
// 可视化组件（建模视图 / 拆分视图 / 文件清单）
// ═══════════════════════════════════════════════════════════════
export const visualization = {
  // ── 通用 ──
  cancel: '取消',
  confirm: '确定',
  removePair: '删除关联',

  // ── LeftJoinModelView ──
  leftJoinToolbarDefault: '合并原表关联辅助表',
  leftJoinLeftTitleDefault: '合并原表',
  leftJoinLeftLabelDefault: '合并原表',
  leftJoinEmptyDefault: '还没有辅助表，请先在上方「辅助表配置」里添加',
  fieldsCount: (n: number) => `${n} 列`,
  noMatchField: '（无匹配列）',
  noColumnsOf: (label: string) => `（未读取到${label}的列）`,
  noColumns: '（未读取到列）',
  zoomTitle: '放大缩小这块画布',
  zoomReset: '复位',
  expandAllLabel: '全部展开',
  expandAllTitle: '一次展开所有卡片的全部列',
  hideUnusedLabel: '仅显示已使用字段',
  hideUnusedTitle: '隐藏未参与匹配/映射的字段，方便检查配置',
  noUsedFieldsLeft: (label: string) => `暂未使用${label}的任何字段`,
  noUsedFieldsRight: '暂未使用本表的任何字段',
  searchPlaceholder: '搜索列名…',
  searchClear: '清除搜索',
  cardSearchPlaceholder: '搜索本表列…',
  matchCount: (n: number) => `匹配到 ${n} 列`,
  noMatchFields: '没有匹配的列',
  footerExpand: (n: number) => `展开全部 ${n} 列 ▾`,
  footerCollapse: '收起 ▴',
  legendKey: '加粗的列 = 用来匹配的列',
  legendHint: '拖动卡片可移动 · 滚动看列 · 拖一列到另一边即建立关联',
  joinType: '连接方式',
  editPairTitle: '修改关联关系',
  editLeftField: (label: string) => `${label}的列`,
  editAuxField: (name?: string) => (name ? `辅助表的列（${name}）` : '辅助表的列'),
  editFieldPlaceholder: '— 选择列 —',

  // ── SplitSketchView（第 3 步拆分示意图）──
  splitSketchTitle: '拆分示意',
  splitGroupBy: (col: string) => `按「${col}」分组`,
  splitPending: '还没选拆分依据',
  splitNeedGroupBy: '请先选择「拆分依据」',
  splitSketchArrow: '拆分',
  splitSketchFileName: (group: string, billNo: number) => `订单_${group}_${billNo}.xlsx`,
  splitSketchMore: '其余分组各自拆成一个文件',
  splitSketchSummaryFile: '订单拆分汇总.xlsx',
  splitBillNoRule: (start: number, step: number) => `单号从 ${start} 开始，每个订单加 ${step}`,
  splitSketchOnlyTwo: '（示意：最多显示 2 个文件名）',

  // ── FolderMergeView ──
  folderMergeTitle: '待合并文件清单',
  fileCount: (n: number) => `${n} 个文件`,
  folderMergeEmpty: '还没有加入要合并的原表文件',
  folderOrderPrefix: '',

  // ── MergeSketchView（第 1 步合并示意图）──
  mergeSketchTitle: '合并示意',
  mergeSketchEmpty: '还没有加入要合并的原表文件',
  mergeSketchMore: (n: number) => `另有 ${n} 个文件`,
  mergeSketchArrow: '合并',
  mergeSketchOnlyTwo: '（示意：最多显示 2 个文件名）',
}

// ═══════════════════════════════════════════════════════════════
// CombinedPage - 合并Excel + 金蝶导入
// ═══════════════════════════════════════════════════════════════
export const combinedPage = {
  // ── 标题 ──
  step1Title: '原表预处理',
  part1Title: '第一部分：合并原表',
  part2Title: '第二部分：合并辅助表',
  step2Title: '生成目标表',

  // ── 六步流程（1~6）──
  flowTitle: '操作流程',
  stepS1Title: '合并原表',
  stepS1Desc: '把多个原表合并为一张「合并原表.xlsx」',
  stepS2Title: '合并辅助表',
  stepS2Desc: '按匹配列把辅助表补充进合并原表，得到「合并结果.xlsx」',
  stepS3Title: '订单拆分',
  stepS3Desc: '按拆分依据分组，一个订单一个文件',
  stepS4Title: '目标表匹配',
  stepS4Desc: '目标表与订单明细按匹配列对上，并去掉对不上的行',
  stepS5Title: '字段填充',
  stepS5Desc: '按字段映射与编号规则，把数据填进目标表',
  stepS6Title: '汇总输出',
  stepS6Desc: '把所有目标表合并成一张金蝶导入表',
  stepStatusDone: '已完成',
  stepStatusActive: '进行中',
  stepStatusTodo: '待开始',
  btnExecS1: '执行第 1 步：合并原表',
  btnExecS2: '执行第 2 步：合并辅助表',
  btnExecS3: '执行第 3 步：订单拆分',
  btnExecS4: '执行第 4 步：目标表匹配',
  btnExecS5: '执行第 5 步：字段填充',
  btnExecS6: '执行第 6 步：汇总输出',
  stepS2DependsS1: '（要先完成第 1 步「合并原表」）',
  stepS3DependsS2: '（要先完成第 1、2 步合并）',
  stepS4DependsS2: '（要先完成第 1、2 步合并）',
  stepS5DependsS4: '（要先完成第 4 步）',
  stepS6DependsS5: '（要先完成第 5 步）',
  stepDoneS3: '订单拆分完成',
  stepDoneS4: '目标表匹配完成',
  stepDoneS5: '字段填充完成',
  resultSplitFile: '拆分出的订单文件',
  resultMatchOutput: '匹配后的明细文件',
  resultFilledCount: (n: number) => `已填充目标表 ${n} 个`,
  needS3First: '请先选好拆分依据，再执行订单拆分',
  needS4First: '请先完成第 4 步「目标表匹配」',
  needS5First: '请先完成第 5 步「字段填充」',

  sectionFileConfig: '文件配置',
  sectionAuxTable: '辅助表配置',
  sectionOutputConfig: '输出配置',
  sectionSplitConfig: '订单拆分与匹配设置',
  sectionFieldConfig: '表格字段配置',
  sectionFieldMappingData: '字段映射（取自合并结果）',
  sectionFieldMappingOther: '字段映射（固定值 / 编号）',
  sectionTextFormat: '文本格式列（汇总时用）:',
  noMappingsData: '还没有「取自合并结果」的字段映射，点上方按钮添加',
  noMappingsOther: '还没有「固定值 / 编号」的字段映射，点上方按钮添加',

  // ── 按钮 ──
  btnRunAll: '一键完成整个流程',
  btnRunAllExecuting: '执行中…',
  btnStep1Merge: '1、合并原表',
  btnStep1Merging: '合并中…',
  btnStep2Generate: '2、生成目标表',
  btnStep2Generating: '生成中…',
  btnSelectFile: '选择文件',
  btnClear: '清空',
  btnAddAuxTable: '+ 添加辅助表',
  btnDelete: '删除',
  btnSelect: '选择',
  btnAddMatchField: '+ 添加匹配列',
  // ── 计算字段（第 2 步合并后追加的四则运算新列）──
  sectionComputedFields: '计算字段（可选）',
  noComputedField: '还没有计算字段，点右上角「+ 添加计算字段」开始',
  btnAddComputedField: '+ 添加计算字段',
  btnAddComputedItem: '+ 添加参与字段',
  labelComputedName: '结果列名',
  placeholderComputedName: '输入新列名，如：含税金额',
  hintComputedFields: '对合并结果做加减乘除，生成一个新列。参与计算的值会自动转成数字；计算按从上到下的顺序进行。设置后，后面的步骤（如目标表匹配）就能选到这个新列。',
  helpComputedFields: '计算字段说明',
  validateComputedIncomplete: (name: string) => `还差一步：计算字段「${name}」的结果列名和参与字段都要填好`,
  validateComputedNameConflict: (name: string) => `计算字段「${name}」和已有列重名了，请换一个结果列名`,
  btnAddMappingData: '+ 添加合并结果字段',
  btnAddMappingOther: '+ 添加固定值/编号字段',
  btnAdd: '添加',
  btnSavePreset: '保存到项目',
  btnOpenOutput: '打开输出位置',
  step1RawDoneLabel: '合并原表已完成',
  step1DoneLabel: '合并已完成',
  step2DoneLabel: '已生成',
  needStep1RawFirst: '（要先完成第 1 步「合并原表」）',
  needStep1First: '（要先完成第 1、2 步合并）',

  // ── 标签 ──
  labelOrderFiles: '原表文件:',
  labelTemplateTable: '目标表:',
  labelOutputDir: '输出目录:',
  labelOutputPrefix: '输出文件名前缀:',
  // ── 第 6 步可选：数据转换（对汇总表数据行生效，表头不动）──
  sectionTransforms: '数据转换（可选）',
  hintTransforms: '对最终汇总表的数据行做转换，表头不变；按规则顺序依次执行。不配置就完全不影响导出。',
  helpTransforms: '查看「数据转换」的说明',
  transformEmpty: '还没有转换规则。点下方按钮添加；不添加就按原样导出。',
  transformCount: (n: number) => `${n} 条规则`,
  transformOrder: (n: number) => `规则${n + 1}`,
  transformPickColumn: '— 选择列 —',
  opTextToNumber: '文本转数字',
  opNumberToText: '数字转文本',
  opReplace: '替换文字',
  opFormula: '公式计算',
  transformFind: '查找内容',
  transformReplaceWith: '替换为',
  transformUseRegex: '正则',
  transformExprPlaceholder: '如：ROUND({数量}*{单价},2)',
  transformExprHint: '用 {列名} 引用本行其他列；支持 + - * / 和 ROUND、ABS、MAX、MIN、CEILING、FLOOR；填入计算后的值。',
  transformAdd: '+ 添加转换规则',
  sectionAutoInc: '自定义编号规则',
  sectionFillRulesHint: '规则用来给某些列自动填值：填固定值、每行加一、或同一组用同一个编号。',
  ruleTypeConstant: '固定值',
  ruleTypeSequential: '每行自动加一',
  ruleTypeFieldBased: '同一组用同一个编号',
  btnAddRule: '+ 添加规则',
  btnConfigure: '配置',
  btnDone: '完成',
  seqDialogTitle: '配置编号规则',
  labelRuleName: '规则名',
  labelRuleType: '类型',
  ruleSummaryConstant: (v: string) => `固定值「${v}」`,
  ruleSummaryConstantEmpty: '固定值（还没填）',
  ruleSummaryRange: (start: number, step: number) => `从 ${start} 开始，每次加 ${step}`,
  ruleSummaryFieldBased: (field: string) => `按「${field}」分组，同一组同一个编号`,
  ruleSummaryNeedField: '还没选分组列',
  billNoRuleNote: '这条规则的首个编号 / 每次加多少 / 按哪一列分组，同时也是第 3 步「订单拆分」生成单号的依据。',
  labelBillNoStart: '首个编号',
  labelBaseField: '按哪一列分组：',
  labelBillNoStep: '每个订单加多少:',
  labelGroupByColumn: '拆分依据（按哪一列拆）:',
  labelMatchFieldTable: '合并结果侧',
  labelMatchFieldTemplate: '目标表侧',
  labelTemplateHeaderRow: '目标表头在第几行:',
  labelDate: '日期:',
  labelFile: '文件:',
  labelJoinType: '连接方式:',
  labelMatchField: '匹配列:',
  labelOrder: '订单',
  labelAux: '辅助',
  labelTemplateCol: '目标表列',
  labelSourceType: '填入方式',
  labelDataTableCol: '合并结果列',
  labelConstantValue: '固定值',
  labelLastModified: '最后修改：',
  placeholderSelectCol: '— 选择列 —',
  placeholderSelectDir: '点击选择目录',
  placeholderDragFile: '把文件或文件夹拖到这里',
  placeholderDragOrClick: '拖入文件，或点右侧按钮选择',
  placeholderConstant: '输入固定值',
  seqDefaultName: '新编号规则',

  // ── 步骤卡 / 可视化标题 ──
  templateMatchToolbar: '目标表关联订单明细',
  templateMatchLeftTitle: '目标表',
  mappingToolbar: '生成方式：把合并结果的列填进目标表的对应列',
  mappingEmpty: '还没有字段映射，请先在上方添加「取自合并结果」或「固定值 / 编号」',
  mappingTable1CardName: '合并结果列',
  mappingCustomCardName: '固定值 / 编号',

  // ── 拖拽提示 ──
  dragExcelHint: '请拖入表格文件（.xlsx / .xls / .csv），或装有表格文件的文件夹',
  dragFileExists: '这个文件已经在清单里了',
  dragNoExcel: '这个位置没有找到表格文件',
  dragInvalid: '请拖入 .xlsx / .xls / .csv 格式的表格文件',

  // ── 说明文字（新用户引导）──
  hintOrderFiles: '可以直接把整个文件夹拖进来，会自动读取里面的表格文件（.xlsx / .xls / .csv）。',
  hintAuxTable: '辅助表 = 需要一起匹配过来的补充信息表，例如物料编码表、客户资料表。',
  hintJoinType: '一般保持默认的「全部订单都保留」即可。',
  hintGroupBy: '拆分依据决定一个订单怎么算一组，按它把订单拆成一个个文件。通常选「采购单号」或「订单号」。',
  hintTemplate: '这里选从金蝶导出的目标表文件（.xlsx / .xls / .csv）。',
  hintTemplateHeader: '目标表里列名所在的那一行，通常是第 1 行。',
  hintMatchField: '选两边含义相同的那一列。需要多列一起定位同一条记录时，点下方「+ 添加匹配列」再加一组。',
  hintOutputDir: '生成的金蝶导入表会保存到这个文件夹。',
  hintStep5: '在这里设置每个目标表列的数据从哪来。',

  // ──「?」悬浮提示的触发器无障碍名（见《UI设计规范.md》§5.3）──
  helpOrderFiles: '查看「原表文件」的说明',
  helpAuxTable: '查看「辅助表配置」的说明',
  helpJoinType: '查看「连接方式」的说明',
  helpGroupBy: '查看「拆分依据」的说明',
  helpTemplate: '查看「目标表」的说明',
  helpTemplateHeader: '查看「目标表头行」的说明',
  helpMatchField: '查看「匹配列」的说明',
  helpOutputDir: '查看「输出目录」的说明',
  helpStep5: '查看「字段映射」的说明',
  helpAutoInc: '查看「自定义编号规则」的说明',
  helpViewModel: '查看建模视图说明',
  helpStepDesc: (title: string) => `查看「${title}」的说明`,

  // ── 预设 ──
  presetSaved: '已保存到当前项目',
  presetSaveFail: '保存失败',
  presetStep2Saved: '已保存到当前项目',
  presetStep2SaveFail: '保存失败',
  noProjectSelected: '请先在右侧选择或新建一个项目',

  // ── 校验 ──
  validateNoOrderFiles: '还差一步：请先加入要合并的原表文件',
  validateNoAuxTables: '还差一步：请至少添加一个辅助表',
  validateAuxNoFile: (name: string) => `还差一步：辅助表「${name}」还没选文件`,
  validateAuxIncomplete: (name: string) => `还差一步：辅助表「${name}」有匹配列没选完`,
  validateNoTemplate: '还差一步：请选择目标表',
  validateNoGroupBy: '还差一步：请选择拆分依据（按哪一列拆）',
  validateNoMatchField: '还差一步：请把两边的匹配列都选上',
  validateMatchPairIncomplete: (n: number) => `第 ${n} 组匹配列还没选完：左边和右边都要选上`,
  validateNoFieldMapping: '还差一步：请至少配置一条字段映射',
  validateNoOutputDir: '还差一步：请选择输出目录',
  validateFillRuleBaseField: (name: string) => `还差一步：编号规则「${name}」还没选「按哪一列分组」`,
  validateSeqBaseField: (name: string) => `还差一步：编号规则「${name}」还没选「按哪一列分组」`,

  // ── 执行进度 ──
  progressMerging: '正在合并原表…',
  progressJoinAux: '正在合并辅助表…',
  progressStep1: '第 3 步 · 正在拆分订单…',
  progressStep1Fail: '订单拆分失败',
  progressStep1Done: (count?: number) => `订单拆分完成${count ? `（共 ${count} 个订单）` : ''}`,
  progressStep2a: '第 4 步 · 正在关联目标表…',
  progressStep2aFail: '目标表关联失败',
  progressStep2aDone: '目标表关联完成',
  progressStep2b: '第 4 步 · 正在去掉对不上的行…',
  progressStep2bFail: '清理未匹配行失败',
  progressStep2bDone: '未匹配的行已清理',
  progressStep2c: '第 5 步 · 正在填充数据…',
  progressStep2cFail: '数据填充失败',
  progressStep2cDone: '数据填充完成',
  progressStep2d: '第 5 步 · 正在恢复目标表结构…',
  progressStep2dFail: '恢复目标表结构失败',
  progressStep2dDone: '目标表结构已恢复',
  progressStep3: '第 6 步 · 正在汇总输出…',
  progressStep3Fail: '汇总输出失败',
  progressStep3Done: (path: string) => `全部完成！输出文件：${path}`,
  progressGenerating: '正在生成金蝶导入表…',

  // ── 结果 ──
  resultRawMergeDone: (rows: number) => `合并原表完成，共 ${rows} 行`,
  resultMergeDone: (rows: number) => `合并完成，共 ${rows} 行`,
  resultMergeFail: '合并失败',
  resultMergeError: (msg: string) => `合并出错: ${msg}`,
  resultStep2Error: (msg: string) => `生成出错: ${msg}`,
  resultExecutionError: (msg: string) => `执行出错: ${msg}`,
  resultAllDone: '全部完成',
  resultAllDoneMsg: '一键执行完成！金蝶导入表已生成',
  resultStep2DoneTitle: '生成完成',
  resultStep2DoneMsg: '金蝶导入表已生成！',
  resultStep2DoneOutput: '金蝶导入表已生成',
  resultOpenDir: '打开所在文件夹',

  // ── 输出统计 ──
  statTotalRows: '合并总行数',
  statTotalCols: '合并总列数',
  statMatchedRows: '匹配上的行数',
  statUnmatchedRows: '没匹配上的行数',
  statSplitOrders: '拆出的订单数',
  statOutputRows: '输出总行数',
  statOutputFile: '输出文件:',

  // ── 连接类型（用业务动作描述，不用 Join 术语）──
  joinLeft: '全部订单都保留',
  joinInner: '只保留两边都能匹配上的',
  joinRight: '辅助表内容都保留',

  // ── 来源类型 ──
  sourceDataTable: '取自合并结果',
  sourceConstant: '固定值',
  sourceDate: '日期',

  // ── 合并前检测弹框（工作表名不一致 / 各文件字段不一致 / 辅助表重名列）──
  checkDialogTitle: '合并前发现这些问题，请先确认',
  checkSheetTitle: '工作表名称不一致',
  checkSheetDesc: '软件读的是每份文件的第一张工作表，名称不同往往说明表选错了：',
  checkColumnsTitle: '各文件的字段不一致',
  checkColumnsDesc: (baseName: string) => `以第一个文件「${baseName}」的字段为基准，下列文件存在差异（缺的列会变成空值）：`,
  checkDupTitle: '辅助表与其它文件存在重名列',
  checkDupDesc: '辅助表会和合并结果拼在一起，重名列会让后面的步骤分不清该取哪一列（关联用的字段不计）：',
  checkDupValue: (col: string, others: string) => `${col} ↔ 与「${others}」重名`,
  checkInFileNoSheet: 'CSV 文件（没有工作表）',
  checkContinue: '仍然继续合并',
  checkClose: '先去改文件',

  // ── 状态提示 ──
  selectedFilesCount: (n: number) => `已选 ${n} 个文件`,
  needMergedColumns: '还没读取到合并结果的列。请先在上方完成第 1、2 步合并，再回来看这里的连线。',
  incompleteMappings: (n: number) => `有 ${n} 条映射还没配好（缺目标表列或来源列），图中未连线。`,
  openFailed: (msg: string) => `打开失败：${msg}`,

  // ── 默认值 ──
  defaultOutputPrefix: '金蝶导入数据',
  defaultMergedRawOutput: '合并原表.xlsx',
  defaultMergeOutput: '合并结果.xlsx',
  auxTableDefaultName: (index: number) => `辅助表${index}`,
  noAuxTable: '还没有辅助表，点右上角「+ 添加辅助表」开始',

  // ── SearchableSelect ──
  selectPlaceholder: '— 选择列 —',
  selectSearchPlaceholder: '搜索…',
  selectNoOptions: '请先选择文件',
  selectNoMatch: '没有匹配的列',

  // ── 个人设置 ──
  settingsTitle: '个人设置',
  // 配色方案
  schemeSection: '配色方案',
  schemeSelectLabel: '当前配色方案',
  schemeLockedSuffix: '（默认，锁定）',
  schemeLockedHint: '默认方案按软件原版配色保存，不可修改。点「复制方案」后即可编辑。',
  schemeDuplicate: '复制方案',
  schemeSaveAs: '另存为',
  schemeSaveAsPlaceholder: '输入方案名称',
  schemeSaveConfirm: '保存',
  schemeDelete: '删除方案',
  schemeDeleteConfirm: '确认删除？再点一次',
  elementColorsSection: '元素颜色',
  settingsOpenPicker: '打开颜色画板',
  settingsHexPlaceholder: '色值，如 #F0FDF4',
  helpSettings: '查看设置说明',
  pickerAriaSv: '颜色画板：横向为饱和度，纵向为明度',
  pickerAriaHue: '色相条',

  // ── 视图切换 / 建模视图（单独一页，按步骤平铺全部图形）──
  viewStep: '分步操作视图',
  viewModel: '建模视图',
  viewModelHint: '这里把 1~6 步的图形一次全展示出来，方便通盘检查配置；点顶部步骤条可跳回对应步骤继续操作。',
  stepLabel: (n: number, title: string) => `第 ${n} 步 · ${title}`,
  summaryTitle: '输出汇总',
  summaryOrders: (n: number) => `拆出的订单文件：${n} 个`,
  summaryFilled: (n: number) => `已填充的目标表文件：${n} 个`,
  summaryNoDir: '还没选择输出目录',
}
