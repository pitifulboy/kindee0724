import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/** Step 1 预设：Excel 合并配置 */
export interface Step1Preset {
  orderFiles: { id: string; path: string; name: string }[]
  auxTables: any[]
  auxFilePaths: Record<string, string>
  orderColumns: string[]
  auxColumnsMap: Record<string, string[]>
}

/** Step 2 预设：金蝶导入配置 */
export interface Step2Preset {
  table2Path: string
  outputDir: string
  outputPrefix: string
  seqConfigs?: Array<{ id: string; name: string; type: string; constantValue: string; start: number; step: number; baseField: string }>
  date: string
  groupByColumn: string
  matchFieldTable1: string
  matchFieldTable2: string
  templateHeaderRowIndex: number
  templateDataStartRowIndex: number
  fieldMappings: any[]
  textFormatColumns: string[]
}

export interface ProjectItem {
  id: string
  name: string
  step1Preset: Step1Preset | null
  step2Preset: Step2Preset | null
  createdAt: string
  updatedAt: string
}

export interface ProjectListItem {
  id: string
  name: string
  updatedAt: string
}

// ═══════════════════════════════════════════════════════════════
// 存储 — 双路径（主路径 + 备用路径）
// 安全软件可能锁定 %APPDATA% 目录，备用路径使用 %TEMP% 不受监控
// ═══════════════════════════════════════════════════════════════

const STORAGE_DIR = 'electron-office-projects'
const STORAGE_FILE = 'projects.json'

/** 主路径：%APPDATA%\electron-office\electron-office-projects\projects.json */
function getPrimaryPath(): string {
  return path.join(app.getPath('userData'), STORAGE_DIR, STORAGE_FILE)
}

/** 备用路径：%TEMP%\electron-office-projects\projects.json（安全软件不监控） */
function getFallbackPath(): string {
  return path.join(app.getPath('temp'), STORAGE_DIR, STORAGE_FILE)
}

function ensureDirFor(fp: string): void {
  const dir = path.dirname(fp)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function ensureDirs(): void {
  ensureDirFor(getPrimaryPath())
  ensureDirFor(getFallbackPath())
}

/** 延迟等待（非阻塞） */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 尝试写入单个文件（带重试）
 * 成功返回 true，返回 false 表示遇到 EPERM 类错误（应由调用方切换路径重试）
 */
async function tryWrite(filePath: string, data: string): Promise<boolean> {
  const maxRetries = 5
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const bak = filePath + '.bak'
      // 失败后才备份（避免不必要的文件操作）
      if (attempt > 1 && fs.existsSync(filePath)) {
        try { fs.copyFileSync(filePath, bak) } catch { /* ignore */ }
      }
      fs.writeFileSync(filePath, data, 'utf-8')
      // 成功 → 删备份
      try { if (fs.existsSync(bak)) fs.unlinkSync(bak) } catch { /* ignore */ }
      return true
    } catch (err: any) {
      // 清理残留 tmp 文件（之前版本写入失败留下的）
      if (attempt === 1) {
        try {
          const dir = path.dirname(filePath)
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.startsWith('.projects.json.') && f.endsWith('.tmp')) {
                try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignore */ }
              }
            }
          }
        } catch { /* ignore */ }
      }
      if (attempt === maxRetries) {
        // 如果是锁类错误，返回 false 让调用方切换路径；其他错误抛出
        if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') return false
        throw err
      }
      if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') throw err
      await delay(300 * attempt) // 非阻塞等待
    }
  }
  return false
}

/**
 * 读取单个文件（带重试）
 */
function tryRead(filePath: string): string | null {
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch (err: any) {
      if (attempt === maxRetries) return null
      if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
        // 同步等待（tryRead 仅在启动时调用，短暂阻塞可接受）
        const start = Date.now()
        while (Date.now() - start < 200 * attempt) { /* yield to event loop */ }
        continue
      }
      return null
    }
  }
  return null
}

/**
 * 保存：写入主路径和备用路径（双写），确保即使主路径 EPERM 也不丢数据
 */
async function saveAll(data: Record<string, ProjectItem>): Promise<void> {
  ensureDirs()
  const payload = JSON.stringify(data, null, 2)
  const primary = getPrimaryPath()
  const fallback = getFallbackPath()

  try {
    const [primaryOk, fallbackOk] = await Promise.all([
      tryWrite(primary, payload),
      tryWrite(fallback, payload)
    ])

    if (!primaryOk && !fallbackOk) {
      throw new Error(`主路径和备用路径均无法写入`)
    }
    if (!primaryOk) {
      console.warn(`[projectManager] 主路径写入失败，数据仅保存在备用路径: ${fallback}`)
    }
  } catch (err: any) {
    throw new Error(`项目数据保存失败: ${err.message}`)
  }
}

/**
 * 加载：优先使用最新的文件（比较修改时间），主路径损坏时读备用路径
 */
function loadAll(): Record<string, ProjectItem> {
  const primary = getPrimaryPath()
  const fallback = getFallbackPath()

  // 收集所有可用的文件路径及其 mtime
  const candidates: { path: string; mtime: number }[] = []
  for (const fp of [primary, fallback]) {
    if (fs.existsSync(fp)) {
      try {
        const stat = fs.statSync(fp)
        candidates.push({ path: fp, mtime: stat.mtimeMs })
      } catch { /* ignore */ }
    }
  }

  // 没有可用文件 → 返回空
  if (candidates.length === 0) return {}

  // 按修改时间降序排序（最新的在前）
  candidates.sort((a, b) => b.mtime - a.mtime)

  // 尝试最新的文件，失败则依次尝试其他文件
  for (const { path: fp } of candidates) {
    const raw = tryRead(fp)
    if (raw !== null) {
      try { return JSON.parse(raw) } catch { /* 损坏，尝试下一个 */ }
    }
  }

  return {}
}

// ═══════════════════════════════════════════════════════════════
// 内存缓存 — 首次读取后所有读写操作均在缓存中进行
// 写操作同步刷盘，读操作零磁盘 I/O，彻底规避安全软件锁文件问题
// ═══════════════════════════════════════════════════════════════

let projectsCache: Record<string, ProjectItem> | null = null

/** 从缓存获取全部项目数据（首次调用时从磁盘加载） */
function getProjects(): Record<string, ProjectItem> {
  if (projectsCache === null) {
    projectsCache = loadAll()
  }
  return projectsCache
}

/** 保存到磁盘并更新缓存 */
async function saveProjects(data: Record<string, ProjectItem>): Promise<void> {
  await saveAll(data)
  projectsCache = data
}

// ═══════════════════════════════════════════════════════════════
// 公开 API（全部通过缓存操作）
// ═══════════════════════════════════════════════════════════════

export function listProjects(): ProjectListItem[] {
  const data = getProjects()
  return Object.values(data)
    .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getProject(id: string): ProjectItem | null {
  const data = getProjects()
  return data[id] || null
}

export async function saveProject(project: ProjectItem): Promise<void> {
  const data = getProjects()
  data[project.id] = {
    ...project,
    updatedAt: new Date().toISOString()
  }
  await saveProjects(data)
}

export async function deleteProject(id: string): Promise<boolean> {
  const data = getProjects()
  if (!data[id]) return false
  delete data[id]
  await saveProjects(data)
  return true
}

export async function renameProject(id: string, newName: string): Promise<boolean> {
  const data = getProjects()
  if (!data[id]) return false
  data[id].name = newName
  data[id].updatedAt = new Date().toISOString()
  await saveProjects(data)
  return true
}

export async function updateStep1Preset(id: string, preset: Step1Preset): Promise<boolean> {
  const data = getProjects()
  if (!data[id]) return false
  data[id].step1Preset = preset
  data[id].updatedAt = new Date().toISOString()
  await saveProjects(data)
  return true
}

export async function updateStep2Preset(id: string, preset: Step2Preset): Promise<boolean> {
  const data = getProjects()
  if (!data[id]) return false
  data[id].step2Preset = preset
  data[id].updatedAt = new Date().toISOString()
  await saveProjects(data)
  return true
}

// ═══════════════════════════════════════════════════════════════
// 导入 / 导出
// ═══════════════════════════════════════════════════════════════

/** 导出全部项目为可移植 JSON 对象 */
export function exportProjects(): Record<string, ProjectItem> {
  return { ...getProjects() }
}

/** 导入项目（新增模式：不覆盖，同名项目自动加序号） */
export async function importProjects(projects: Record<string, ProjectItem>): Promise<number> {
  const data = getProjects()
  const existingNames = new Set(Object.values(data).map(p => p.name))
  let count = 0

  for (const project of Object.values(projects)) {
    let finalName = project.name
    if (existingNames.has(finalName)) {
      let suffix = 1
      while (existingNames.has(`${project.name}_${suffix}`)) suffix++
      finalName = `${project.name}_${suffix}`
    }
    existingNames.add(finalName)

    const newId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    data[newId] = {
      ...project,
      id: newId,
      name: finalName,
      updatedAt: new Date().toISOString()
    }
    count++
  }

  await saveProjects(data)
  return count
}
