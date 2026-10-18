import React, { useEffect, useId, useRef, useState } from 'react'
import { combinedPage as t } from '../../config/appText'

/**
 * 个人设置弹框：配色方案
 *
 * - 每个方案包含 6 个元素颜色：页面背景 / 建模视图背景 / 主按钮 / 强调色 / 强调浅底 / 强调边框
 * - 主色亮暗阶（primary 300/400/500/600/900）由主按钮色自动派生，无需逐个设置
 * - 默认方案按软件原版配色保存：锁定不可修改，可复制后编辑
 * - 用户方案：编辑即时保存（localStorage），可另存为新方案、可删除
 */

// ─── 方案模型 ───

export interface SchemeColors {
  /** 页面背景（分步操作视图） */
  pageBg: string
  /** 建模视图背景 */
  modelBg: string
  /** 主按钮底色（primary-800） */
  primary: string
  /** 强调色：链接文字 + 主按钮悬浮（primary-700） */
  accent: string
  /** 强调浅底（primary-50/100） */
  primarySoft: string
  /** 强调边框（primary-200） */
  primaryBorder: string
}

export interface ColorScheme {
  id: string
  name: string
  /** 默认方案锁定：不可修改、不可删除 */
  locked: boolean
  colors: SchemeColors
}

/** 默认方案 = 软件原版配色（代码内置，锁定不可改） */
export const DEFAULT_SCHEME: ColorScheme = {
  id: 'default',
  name: '默认',
  locked: true,
  colors: {
    pageBg: '#F8FAFC',
    modelBg: '#F0FDF4',
    primary: '#1E40AF',
    accent: '#1D4ED8',
    primarySoft: '#EFF6FF',
    primaryBorder: '#BFDBFE',
  },
}

/**
 * 内置配色方案（全部锁定：不可修改 / 不可删除，可复制为副本后编辑）。
 * 色值取自 Tailwind 色板：primary=700 阶、accent=600 阶、soft=50 阶、border=200 阶、
 * modelBg=100 阶，pageBg 为带微弱同色系色相的近白色。
 */
export const BUILTIN_SCHEMES: ColorScheme[] = [
  DEFAULT_SCHEME,
  {
    id: 'pink',
    name: '粉色',
    locked: true,
    colors: {
      pageBg: '#FDF7FA',
      modelBg: '#FCE7F3',
      primary: '#BE185D',
      accent: '#DB2777',
      primarySoft: '#FDF2F8',
      primaryBorder: '#FBCFE8',
    },
  },
  {
    id: 'violet',
    name: '紫色',
    locked: true,
    colors: {
      pageBg: '#FBFAFE',
      modelBg: '#EDE9FE',
      primary: '#6D28D9',
      accent: '#7C3AED',
      primarySoft: '#F5F3FF',
      primaryBorder: '#DDD6FE',
    },
  },
  {
    id: 'teal',
    name: '青绿',
    locked: true,
    colors: {
      pageBg: '#F7FCFB',
      modelBg: '#CCFBF1',
      primary: '#0F766E',
      accent: '#0D9488',
      primarySoft: '#F0FDFA',
      primaryBorder: '#99F6E4',
    },
  },
  {
    id: 'orange',
    name: '暖橙',
    locked: true,
    colors: {
      pageBg: '#FDFBF8',
      modelBg: '#FFEDD5',
      primary: '#C2410C',
      accent: '#EA580C',
      primarySoft: '#FFF7ED',
      primaryBorder: '#FED7AA',
    },
  },
]

/** 方案元素顺序与中文标签（编辑区展示顺序） */
export const SCHEME_ELEMENTS: { key: keyof SchemeColors; label: string }[] = [
  { key: 'pageBg', label: '页面背景' },
  { key: 'modelBg', label: '建模视图背景' },
  { key: 'primary', label: '主按钮' },
  { key: 'accent', label: '强调色（链接 / 悬浮）' },
  { key: 'primarySoft', label: '强调浅底' },
  { key: 'primaryBorder', label: '强调边框' },
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function safeHex(hex: string, fallback: string): string {
  return HEX_RE.test(hex) ? hex : fallback
}

// ─── 颜色工具 ───

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  if (!HEX_RE.test(hex)) return { h: 0, s: 0, v: 1 }
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

/** 线性混色：t=0 → a，t=1 → b */
function mixHex(a: string, b: string, t: number): string {
  const pa = safeHex(a, '#000000')
  const pb = safeHex(b, '#ffffff')
  const r = Math.round(parseInt(pa.slice(1, 3), 16) * (1 - t) + parseInt(pb.slice(1, 3), 16) * t)
  const g = Math.round(parseInt(pa.slice(3, 5), 16) * (1 - t) + parseInt(pb.slice(3, 5), 16) * t)
  const bl = Math.round(parseInt(pa.slice(5, 7), 16) * (1 - t) + parseInt(pb.slice(5, 7), 16) * t)
  const to = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(bl)}`.toUpperCase()
}

/**
 * 把方案颜色写入 CSS 变量（tailwind.config 的 primary 各阶引用这些变量）。
 * 亮暗阶由主按钮色自动派生。
 */
export function applySchemeVars(c: SchemeColors): void {
  const root = document.documentElement
  const p = safeHex(c.primary, DEFAULT_SCHEME.colors.primary)
  root.style.setProperty('--ui-page-bg', safeHex(c.pageBg, DEFAULT_SCHEME.colors.pageBg))
  root.style.setProperty('--ui-model-bg', safeHex(c.modelBg, DEFAULT_SCHEME.colors.modelBg))
  root.style.setProperty('--ui-primary', p)
  root.style.setProperty('--ui-primary-hover', safeHex(c.accent, DEFAULT_SCHEME.colors.accent))
  root.style.setProperty('--ui-primary-border', safeHex(c.primaryBorder, DEFAULT_SCHEME.colors.primaryBorder))
  root.style.setProperty('--ui-primary-soft', safeHex(c.primarySoft, DEFAULT_SCHEME.colors.primarySoft))
  root.style.setProperty('--ui-primary-600', mixHex(p, '#FFFFFF', 0.12))
  root.style.setProperty('--ui-primary-500', mixHex(p, '#FFFFFF', 0.25))
  root.style.setProperty('--ui-primary-400', mixHex(p, '#FFFFFF', 0.45))
  root.style.setProperty('--ui-primary-300', mixHex(p, '#FFFFFF', 0.65))
  root.style.setProperty('--ui-primary-900', mixHex(p, '#000000', 0.15))
}

// ─── PS 风格取色器 ───

interface ColorPickerProps {
  /** 当前 hex（#RRGGBB） */
  value: string
  onChange: (hex: string) => void
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const lastEmittedRef = useRef(value)
  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)

  // 外部值变化（如从 hex 输入框同步）时更新内部 hsv；自己发出的值不回灌
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value
      setHsv(hexToHsv(value))
    }
  }, [value])

  const hsvRef = useRef(hsv)
  hsvRef.current = hsv

  const emit = (next: { h: number; s: number; v: number }) => {
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    lastEmittedRef.current = hex
    onChange(hex)
  }

  /** 在面板/色相条上按位置取值（pointerdown + pointermove 共用） */
  const pickFrom = (el: HTMLElement | null, e: React.PointerEvent | PointerEvent, kind: 'sv' | 'hue') => {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (kind === 'sv') {
      const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      emit({ ...hsvRef.current, s, v })
    } else {
      const h = Math.min(359.9, Math.max(0, ((e.clientY - r.top) / r.height) * 360))
      emit({ ...hsvRef.current, h })
    }
  }

  const bindDrag = (elRef: React.RefObject<HTMLElement | null>, kind: 'sv' | 'hue') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      const el = elRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      pickFrom(el, e, kind)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons & 1) pickFrom(elRef.current, e, kind)
    },
  })

  return (
    <div className="flex gap-3">
      {/* SV 方块：x = 饱和度（左白右纯色），y = 明度（上亮下黑） */}
      <div
        ref={svRef}
        role="slider"
        aria-label={t.pickerAriaSv}
        aria-valuetext={hsvToHex(hsv.h, hsv.s, hsv.v)}
        tabIndex={0}
        className="relative flex-1 h-40 rounded-md border border-gray-200 cursor-crosshair select-none"
        style={{
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${hsv.h}, 100%, 50%)`,
          touchAction: 'none',
        }}
        {...bindDrag(svRef, 'sv')}
      >
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }}
        />
      </div>
      {/* 色相竖条 */}
      <div
        ref={hueRef}
        role="slider"
        aria-label={t.pickerAriaHue}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        className="relative w-4 h-40 rounded-full cursor-pointer select-none flex-shrink-0"
        style={{
          background: 'linear-gradient(to bottom, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
          touchAction: 'none',
        }}
        {...bindDrag(hueRef, 'hue')}
      >
        <div
          className="absolute left-1/2 w-5 h-2 rounded border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${(hsv.h / 360) * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }}
        />
      </div>
    </div>
  )
}

// ─── 元素颜色行：色块（点击展开取色器）+ hex 输入 ───

interface ElementColorRowProps {
  label: string
  hex: string
  disabled: boolean
  /** 是否展开取色器（由父层统一管理，一次只展开一个） */
  pickerOpen: boolean
  onTogglePicker: () => void
  onChange: (hex: string) => void
}

const ElementColorRow: React.FC<ElementColorRowProps> = ({ label, hex, disabled, pickerOpen, onTogglePicker, onChange }) => (
  <div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onTogglePicker}
        disabled={disabled}
        aria-expanded={pickerOpen}
        aria-label={`${label}颜色`}
        className="w-9 h-9 rounded-lg border-2 border-gray-200 flex-shrink-0 focus-ring disabled:opacity-60 disabled:cursor-not-allowed hover:border-gray-300"
        style={{ backgroundColor: safeHex(hex, '#FFFFFF') }}
        title={t.settingsOpenPicker}
      />
      <span className="text-sm text-black w-44 flex-shrink-0">{label}</span>
      <input
        type="text"
        value={hex}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={t.settingsHexPlaceholder}
        aria-label={label}
        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded focus-ring text-black disabled:bg-gray-50 disabled:text-black/60"
      />
    </div>
    {pickerOpen && (
      <div className="mt-2 mb-3 ml-11 p-3 bg-white rounded-lg border border-gray-200 shadow-lg w-72">
        <ColorPicker value={hex} onChange={onChange} />
      </div>
    )}
  </div>
)

// ─── 设置弹框 ───

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  /** 全部方案（含锁定的默认方案，默认方案在前） */
  schemes: ColorScheme[]
  /** 当前活动方案 id */
  activeId: string
  onSelect: (id: string) => void
  /** 编辑当前用户方案的颜色（即时保存） */
  onUpdateColors: (colors: SchemeColors) => void
  /** 复制当前活动方案为新方案并激活 */
  onDuplicate: () => void
  /** 另存当前方案为新名称方案并激活 */
  onSaveAs: (name: string) => void
  /** 删除用户方案 */
  onDelete: (id: string) => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open, onClose, schemes, activeId, onSelect, onUpdateColors, onDuplicate, onSaveAs, onDelete,
}) => {
  const titleId = useId()
  const [openPicker, setOpenPicker] = useState<string>('')
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>('')

  const active = schemes.find(s => s.id === activeId) ?? schemes[0] ?? DEFAULT_SCHEME
  const locked = !!active.locked

  // Esc 关闭（优先收起取色器 / 另存行，再关弹框）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openPicker) { setOpenPicker(''); return }
        if (saveAsOpen) { setSaveAsOpen(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, openPicker, saveAsOpen, onClose])

  // 弹框关闭时清掉临时态
  useEffect(() => {
    if (open) return
    setOpenPicker(''); setSaveAsOpen(false); setSaveAsName(''); setConfirmDeleteId('')
  }, [open])

  if (!open) return null

  const handleSaveAsConfirm = () => {
    const name = saveAsName.trim()
    if (!name) return
    onSaveAs(name)
    setSaveAsOpen(false)
    setSaveAsName('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center px-5 py-4 border-b border-gray-100">
          <svg className="w-5 h-5 text-black/70 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.08a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          <span id={titleId} className="ml-2 text-sm font-semibold text-black">{t.settingsTitle}</span>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 方案选择与管理 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-black flex-shrink-0">{t.schemeSection}</span>
              <select
                value={active.id}
                onChange={e => { onSelect(e.target.value); setOpenPicker(''); setConfirmDeleteId('') }}
                aria-label={t.schemeSelectLabel}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus-ring text-black"
              >
                {schemes.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.locked ? t.schemeLockedSuffix : ''}</option>
                ))}
              </select>
            </div>

            {/* 操作按钮组 */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { onDuplicate(); setOpenPicker(''); setConfirmDeleteId('') }}
                className="px-3 py-1.5 text-sm text-primary-800 border border-primary-200 rounded hover:bg-primary-50 focus-ring"
              >
                {t.schemeDuplicate}
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={() => { setSaveAsOpen(v => !v); setSaveAsName(active.name); setOpenPicker('') }}
                  aria-expanded={saveAsOpen}
                  className="px-3 py-1.5 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 focus-ring"
                >
                  {t.schemeSaveAs}
                </button>
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDeleteId === active.id) { onDelete(active.id); setConfirmDeleteId('') }
                    else setConfirmDeleteId(active.id)
                  }}
                  className={`px-3 py-1.5 text-sm rounded focus-ring border ${confirmDeleteId === active.id
                    ? 'text-white bg-red-600 border-red-600'
                    : 'text-red-700 border-red-200 hover:bg-red-50'}`}
                >
                  {confirmDeleteId === active.id ? t.schemeDeleteConfirm : t.schemeDelete}
                </button>
              )}
            </div>

            {/* 另存为输入行 */}
            {saveAsOpen && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAsConfirm() }}
                  placeholder={t.schemeSaveAsPlaceholder}
                  aria-label={t.schemeSaveAs}
                  autoFocus
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus-ring text-black"
                />
                <button
                  type="button"
                  onClick={handleSaveAsConfirm}
                  disabled={!saveAsName.trim()}
                  className="px-3 py-1.5 text-sm text-white bg-primary-800 rounded hover:bg-primary-700 focus-ring disabled:opacity-50"
                >
                  {t.schemeSaveConfirm}
                </button>
              </div>
            )}

            {/* 锁定提示 */}
            {locked && (
              <div className="text-xs text-black bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                {t.schemeLockedHint}
              </div>
            )}
          </div>

          {/* 元素颜色编辑 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-black">{t.elementColorsSection}</p>
            {SCHEME_ELEMENTS.map(el => (
              <ElementColorRow
                key={el.key}
                label={el.label}
                hex={active.colors[el.key]}
                disabled={locked}
                pickerOpen={openPicker === el.key}
                onTogglePicker={() => setOpenPicker(v => (v === el.key ? '' : el.key))}
                onChange={hex => onUpdateColors({ ...active.colors, [el.key]: hex })}
              />
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-white bg-primary-800 rounded hover:bg-primary-700 focus-ring"
          >
            {t.btnDone}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
