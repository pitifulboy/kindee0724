import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { KingdeeImportPreset, PresetListItem } from './types'

const PRESETS_FILE_NAME = 'kingdee-import-presets.json'

function getPresetsFilePath(): string {
  return path.join(app.getPath('userData'), PRESETS_FILE_NAME)
}

function loadAllPresets(): Record<string, KingdeeImportPreset & { _lastModified: string }> {
  const filePath = getPresetsFilePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveAllPresets(presets: Record<string, any>): void {
  fs.writeFileSync(getPresetsFilePath(), JSON.stringify(presets, null, 2), 'utf-8')
}

export function listPresets(): PresetListItem[] {
  const presets = loadAllPresets()
  return Object.entries(presets)
    .map(([name, config]) => ({
      name,
      lastModified: config._lastModified || ''
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

export function getPreset(name: string): KingdeeImportPreset | null {
  const presets = loadAllPresets()
  const preset = presets[name]
  if (!preset) return null
  const { _lastModified, ...config } = preset
  return config as KingdeeImportPreset
}

export function savePreset(config: KingdeeImportPreset): void {
  const presets = loadAllPresets()
  presets[config.name] = { ...config, _lastModified: new Date().toISOString() }
  saveAllPresets(presets)
}

export function deletePreset(name: string): boolean {
  const presets = loadAllPresets()
  if (!presets[name]) return false
  delete presets[name]
  saveAllPresets(presets)
  return true
}
