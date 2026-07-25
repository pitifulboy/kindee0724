import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { KingdeeImportPreset, PresetListItem } from './types'

const PRESETS_FILE_NAME = 'kingdee-import-presets.json'

/** 单一存储路径：系统临时目录（避免 AppData 被 360 / 杀软锁定） */
function getFilePath(): string {
  return path.join(app.getPath('temp'), 'electron-office-presets', PRESETS_FILE_NAME)
}

/** 确保目录存在 */
function ensureDir(): void {
  const dir = path.dirname(getFilePath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/** 读取全部预设数据，文件不存在或损坏时返回空对象 */
function loadAll(): Record<string, any> {
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

/** 写入全部预设数据 */
function saveAll(data: Record<string, any>): void {
  ensureDir()
  fs.writeFileSync(getFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ═══════════════════════════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════════════════════════

export function listPresets(): PresetListItem[] {
  const data = loadAll()
  return Object.entries(data)
    .map(([name, cfg]) => ({
      name,
      lastModified: (cfg as any)._lastModified || ''
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

export function getPreset(name: string): KingdeeImportPreset | null {
  const data = loadAll()
  const preset = data[name]
  if (!preset) return null
  const { _lastModified, ...config } = preset
  return config as KingdeeImportPreset
}

export function savePreset(config: KingdeeImportPreset): void {
  const data = loadAll()
  data[config.name] = { ...config, _lastModified: new Date().toISOString() }
  saveAll(data)
}

export function deletePreset(name: string): boolean {
  const data = loadAll()
  if (!data[name]) return false
  delete data[name]
  saveAll(data)
  return true
}
