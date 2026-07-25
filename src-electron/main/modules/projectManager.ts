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
  startBillNo: number
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
// 存储
// ═══════════════════════════════════════════════════════════════

const STORAGE_DIR = 'electron-office-projects'
const STORAGE_FILE = 'projects.json'

function getFilePath(): string {
  return path.join(app.getPath('temp'), STORAGE_DIR, STORAGE_FILE)
}

function ensureDir(): void {
  const dir = path.dirname(getFilePath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadAll(): Record<string, ProjectItem> {
  const fp = getFilePath()
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'))
    }
  } catch {
    // 损坏就重新创建
  }
  return {}
}

function saveAll(data: Record<string, ProjectItem>): void {
  ensureDir()
  fs.writeFileSync(getFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ═══════════════════════════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════════════════════════

export function listProjects(): ProjectListItem[] {
  const data = loadAll()
  return Object.values(data)
    .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getProject(id: string): ProjectItem | null {
  const data = loadAll()
  return data[id] || null
}

export function saveProject(project: ProjectItem): void {
  const data = loadAll()
  data[project.id] = {
    ...project,
    updatedAt: new Date().toISOString()
  }
  saveAll(data)
}

export function deleteProject(id: string): boolean {
  const data = loadAll()
  if (!data[id]) return false
  delete data[id]
  saveAll(data)
  return true
}

export function renameProject(id: string, newName: string): boolean {
  const data = loadAll()
  if (!data[id]) return false
  data[id].name = newName
  data[id].updatedAt = new Date().toISOString()
  saveAll(data)
  return true
}

export function updateStep1Preset(id: string, preset: Step1Preset): boolean {
  const data = loadAll()
  if (!data[id]) return false
  data[id].step1Preset = preset
  data[id].updatedAt = new Date().toISOString()
  saveAll(data)
  return true
}

export function updateStep2Preset(id: string, preset: Step2Preset): boolean {
  const data = loadAll()
  if (!data[id]) return false
  data[id].step2Preset = preset
  data[id].updatedAt = new Date().toISOString()
  saveAll(data)
  return true
}
