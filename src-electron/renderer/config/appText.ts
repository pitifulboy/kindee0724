/**
 * 应用 UI 文字配置
 * 集中管理所有界面可见文本，方便统一修改软件名称、标签等文字内容。
 * 按模块/组件分组组织。
 */

// ═══════════════════════════════════════════════════════════════
// 应用全局
// ═══════════════════════════════════════════════════════════════
export const app = {
  // name: '新味智枢', // 已废弃，App.tsx 中硬编码
  version: 'v3.1.1',
  statusOnline: '本地离线',
  statusRunning: '本地运行中',
  footerText: '所有数据均在本地处理 · 无网络传输 · 安全可靠',
  defaultNewProject: '新项目',
  placeholderSelectProject: '选择项目开始使用',
  locale: 'zh-CN',
  lastModified: '上次修改：',
}

// ═══════════════════════════════════════════════════════════════
// 侧边栏 Sidebar
// ═══════════════════════════════════════════════════════════════
export const sidebar = {
  projectListTitle: '项目列表',
  emptyProjectHint: '暂无项目',
  emptyProjectAction: '点击 + 新建项目',
  newProjectTitle: '新建项目',
  renameTitle: '重命名',
  deleteTitle: '删除',
  copyProject: '复制项目',
  // importTitle: '导入',    // 未使用，Sidebar 中直接使用 importBtn
  // exportTitle: '导出',    // 未使用，Sidebar 中直接使用 exportBtn
  importBtn: '导入',
  exportBtn: '导出',
  importFromFileHint: '拖放文件到此导入',
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
}

// ═══════════════════════════════════════════════════════════════
// 模块注册表
// ═══════════════════════════════════════════════════════════════
export const moduleRegistry = {
  excelKingdee: {
    name: 'Excel合并→金蝶导入',
    description: 'Excel批量合并后自动转为金蝶导入数据源',
  },
}

// ═══════════════════════════════════════════════════════════════
// CombinedPage - 合并Excel + 金蝶导入
// ═══════════════════════════════════════════════════════════════
export const combinedPage = {
  // ── 标题 ──
  step1Title: '合并Excel',
  step2Title: '生成汇总模板表',
  sectionFileConfig: '文件配置',
  sectionAuxTable: '辅助表配置',
  sectionOutputConfig: '文件配置',
  sectionSplitConfig: '客户订单表，拆分&匹配配置',
  sectionFieldConfig: '表格字段配置',
  sectionFieldMappingData: '字段映射（数据表取值）',
  sectionFieldMappingOther: '字段映射（非数据表取值）',
  sectionTextFormat: '文本格式列（步骤3汇总用）:',
  noMappingsData: '暂无数据表取值映射，点击按钮添加',
  noMappingsOther: '暂无非数据表取值映射，点击按钮添加',

  // ── 按钮 ──
  btnRunAll: '执行完整项目',
  btnRunAllExecuting: '执行中...',
  btnStep1Merge: '1、合并Excel',
  btnStep1Merging: '合并中...',
  btnStep2Generate: '2、生成汇总模板表',
  btnStep2Generating: '生成中...',
  btnSelectFile: '选择文件',
  btnClear: '清空',
  btnAddAuxTable: '+ 添加辅助表',
  btnDelete: '删除',
  btnSelect: '选择',
  btnAddMatchField: '+ 添加匹配字段',
  // btnAddMapping: '+ 添加映射', // 未使用，改用 btnAddMappingData 和 btnAddMappingOther
  btnAddMappingData: '+ 添加数据表字段',
  btnAddMappingOther: '+ 添加非数据表字段',
  btnAdd: '添加',
  btnSavePreset: '保存预设',
  btnLoadPreset: '加载推荐配置',
  btnClearConfig: '清空配置',
  btnOpenOutput: '打开输出目录',
  step1DoneLabel: '合并已完成',
  step2DoneLabel: '已生成',
  needStep1First: '（需先执行合并Excel）',

  // ── 标签 ──
  labelOrderFiles: '订单文件:',
  labelTemplateTable: '模板表:',
  labelOutputDir: '输出目录:',
  labelOutputPrefix: '输出文件前缀:',
  sectionAutoInc: '序号自增配置',
  labelBillNoStart: '起始值',
  autoIncRuleStep: '规则：起始值 + 递增',
  labelBaseField: '基于字段：',
  labelBillNoStep: '递增值:',
  labelGroupByColumn: '订单表拆分依据:',
  labelMatchFieldTable: '数据表匹配字段:',
  labelMatchFieldTemplate: '模板匹配字段:',
  labelTemplateHeaderRow: '模板表头行:',
  // labelDataStartRow: '数据起始行:',  // 未使用，模板数据起始行自动为表头行+1
  labelDate: '日期:',
  labelFile: '文件:',
  labelJoinType: '连接方式:',
  labelMatchField: '匹配字段:',
  labelOrder: '订单',
  labelAux: '辅助',
  labelTemplateCol: '模板列',
  labelSourceType: '来源类型',
  labelDataTableCol: '数据表列',
  labelConstantValue: '常量值',
  // labelOffset: '偏移量(默认1)',  // 未使用，偏移量统一在序號自增配置中管理
  labelLastModified: '最后修改：',
  placeholderSelectCol: '— 选择列 —',
  placeholderSelectDir: '点击选择目录',
  placeholderDragFile: '拖拽文件或文件夹到此处',
  placeholderDragOrClick: '拖入文件或点击选择',
  // placeholderSearch: '搜索...', // 未使用，SearchableSelect 中直接使用 selectSearchPlaceholder
  placeholderConstant: '输入常量值',

  // ── 拖拽提示 ──
  dragExcelHint: '请拖入Excel文件或包含Excel文件的文件夹',
  dragFileExists: '文件已存在',
  dragNoExcel: '未找到Excel文件',
  dragInvalid: '请拖入Excel文件',

  // ── 预设 ──
  presetSaved: '合并Excel预设已保存到项目',
  presetSaveFail: '保存失败',
  presetStep2Saved: '金蝶导入预设已保存到项目',
  presetStep2SaveFail: '保存失败',
  presetLoaded: '已加载推荐配置',
  noProjectSelected: '请先在左侧选择或新建一个项目',

  // ── 校验 ──
  validateNoOrderFiles: '请先选择订单文件',
  validateNoAuxTables: '请至少添加一个辅助表',
  validateAuxNoFile: (name: string) => `辅助表"${name}"未选择文件`,
  validateAuxIncomplete: (name: string) => `辅助表"${name}"有未完成的匹配字段`,
  validateNoTemplate: '请选择模板表(Table2)',
  validateNoGroupBy: '请选择分组列',
  validateNoMatchField: '请配置匹配字段',
  validateNoFieldMapping: '请至少配置一个字段映射',
  validateNoOutputDir: '请选择输出目录',

  // ── 执行进度 ──
  progressMerging: '正在合并Excel文件...',
  progressStep1: '步骤1: 订单拆分...',
  progressStep1Fail: '步骤1失败',
  progressStep1Done: (count?: number) => `✓ 步骤1: 订单拆分完成${count ? `（${count}单）` : ''}`,
  progressStep2a: '步骤2a: 关联...',
  progressStep2aFail: '步骤2a失败',
  progressStep2aDone: '✓ 步骤2a: Join完成',
  progressStep2b: '步骤2b: 清理未匹配行...',
  progressStep2bFail: '步骤2b失败',
  progressStep2bDone: '✓ 步骤2b: 清理完成',
  progressStep2c: '步骤2c: 填充数据...',
  progressStep2cFail: '步骤2c失败',
  progressStep2cDone: '✓ 步骤2c: 填充完成',
  progressStep2d: '步骤2d: 恢复模板结构...',
  progressStep2dFail: '步骤2d失败',
  progressStep2dDone: '✓ 步骤2d: 恢复完成',
  progressStep3: '步骤3: 汇总输出...',
  progressStep3Fail: '步骤3失败',
  progressStep3Done: (path: string) => `✓ 全部完成！输出文件：${path}`,
  progressGenerating: '正在生成导入金蝶汇总表...',

  // ── 结果 ──
  resultMergeDone: (rows: number) => `✓ 合并完成：${rows}行`,
  resultMergeFail: '合并失败',
  resultMergeError: (msg: string) => `合并出错: ${msg}`,
  resultStep2Error: (msg: string) => `生成出错: ${msg}`,
  resultExecutionError: (msg: string) => `执行出错: ${msg}`,
  resultAllDone: '全部完成',
  resultAllDoneMsg: '一键执行完成！金蝶导入汇总表已生成',
  resultStep2DoneTitle: '正式生成完成',
  resultStep2DoneMsg: '金蝶导入汇总表生成完成！',
  resultStep2DoneOutput: '金蝶导入汇总表已生成',

  // ── 输出统计 ──
  statTotalRows: '合并总行数',
  statTotalCols: '合并总列数',
  statMatchedRows: '匹配行数',
  statUnmatchedRows: '未匹配行数',
  statSplitOrders: '拆分订单数',
  statOutputRows: '汇总输出行数',
  statOutputFile: '输出文件:',

  // ── 连接类型 ──
  joinLeft: 'Left Join',
  joinInner: 'Inner Join',
  joinRight: 'Right Join',

  // ── 来源类型 ──
  sourceDataTable: '数据表取值',
  sourceConstant: '常量值',
  sourceDate: '日期',

  // ── 默认值 ──
  defaultOutputPrefix: '完成_批量金蝶导入',
  defaultMergeOutput: '合并结果.xlsx',
  auxTableDefaultName: (index: number) => `辅助表${index}`,
  noAuxTable: '尚未添加辅助表',

  // ── SearchableSelect ──
  selectPlaceholder: '— 选择列 —',
  selectSearchPlaceholder: '搜索...',
  selectNoOptions: '请先上传文件',
  selectNoMatch: '无匹配结果',
}
