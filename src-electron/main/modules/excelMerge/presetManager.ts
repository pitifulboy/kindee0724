/**
 * 预设管理器
 * 将预设配置持久化到 app.getPath('userData')/excel-merge-presets.json
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { PresetConfig, PresetListItem } from './types'

const PRESETS_FILE_NAME = 'excel-merge-presets.json'

/**
 * 获取预设文件路径
 */
function getPresetsFilePath(): string {
  return path.join(app.getPath('userData'), PRESETS_FILE_NAME)
}

/**
 * 读取所有预设（返回 name → config 的字典）
 */
function loadAllPresets(): Record<string, PresetConfig & { _lastModified: string }> {
  const filePath = getPresetsFilePath()
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * 保存所有预设
 */
function saveAllPresets(presets: Record<string, any>): void {
  const filePath = getPresetsFilePath()
  fs.writeFileSync(filePath, JSON.stringify(presets, null, 2), 'utf-8')
}

/**
 * 列出所有预设名
 */
export function listPresets(): PresetListItem[] {
  const presets = loadAllPresets()
  return Object.entries(presets)
    .map(([name, config]) => ({
      name,
      auxiliaryTableCount: config.auxiliaryTables?.length || 0,
      lastModified: config._lastModified || ''
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

/**
 * 获取单个预设
 */
export function getPreset(name: string): PresetConfig | null {
  const presets = loadAllPresets()
  const preset = presets[name]
  if (!preset) return null
  // 去掉内部字段
  const { _lastModified, ...config } = preset
  return config as PresetConfig
}

/**
 * 保存预设（新建或更新）
 */
export function savePreset(config: PresetConfig): void {
  const presets = loadAllPresets()
  presets[config.name] = {
    ...config,
    _lastModified: new Date().toISOString()
  }
  saveAllPresets(presets)
}

/**
 * 删除预设
 */
export function deletePreset(name: string): boolean {
  const presets = loadAllPresets()
  if (!presets[name]) return false
  delete presets[name]
  saveAllPresets(presets)
  return true
}
