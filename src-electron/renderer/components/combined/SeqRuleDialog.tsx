import React, { useEffect, useRef } from 'react'
import { combinedPage as t } from '../../config/appText'

/** 编号规则（结构同 CombinedPage 的 SeqConfig，避免跨文件导出类型） */
export interface SeqRuleLike {
  id: string
  name: string
  type: 'constant' | 'sequential' | 'fieldBased'
  constantValue: string
  start: number
  step: number
  baseField: string
}

interface SeqRuleDialogProps {
  /** 正在配置的规则；为 null 时不渲染 */
  rule: SeqRuleLike | null
  /** 可选列（用于「按哪一列分组」下拉） */
  columnOptions: string[]
  /** 是否禁用（执行中） */
  disabled?: boolean
  /** 底部补充说明（如单号规则与第 3 步的关系）；为空则不显示 */
  note?: string
  /** 改规则字段（即时写回） */
  onChange: (id: string, field: string, value: string | number) => void
  onClose: () => void
}

/**
 * 「自定义编号规则」的配置弹框：规则名 / 类型 / 各类型参数。
 * 列表里只显示规则名 + 类型摘要，完整配置收进本弹框，避免占满页面。
 * 无障碍：role=dialog + aria-modal，打开时聚焦关闭按钮，Esc 关闭，关闭后归还焦点。
 */
const SeqRuleDialog: React.FC<SeqRuleDialogProps> = ({
  rule, columnOptions, disabled, note, onChange, onClose,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = 'seq-rule-dialog-title'
  const ruleId = rule?.id ?? null

  // 打开时聚焦「完成」；关闭后把焦点还给触发元素（依赖 ruleId，避免每次输入都重新聚焦）
  useEffect(() => {
    if (!ruleId) return
    const prevActive = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    return () => prevActive?.focus?.()
  }, [ruleId])

  // Esc 关闭
  useEffect(() => {
    if (!ruleId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [ruleId, onClose])

  if (!rule) return null

  const set = (field: string, value: string | number) => onChange(rule.id, field, value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-primary-50">
          <span id={titleId} className="text-sm font-semibold text-black">{t.seqDialogTitle}</span>
          <button onClick={onClose} aria-label={t.btnDone}
            className="w-7 h-7 flex items-center justify-center text-sm text-black bg-white border border-gray-200 rounded hover:bg-gray-50 focus-ring">✕</button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-black block mb-1" htmlFor="seq-rule-name">{t.labelRuleName}</label>
            <input id="seq-rule-name" type="text" value={rule.name} disabled={disabled}
              onChange={e => set('name', e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
          </div>

          <div>
            <label className="text-xs text-black block mb-1" htmlFor="seq-rule-type">{t.labelRuleType}</label>
            <select id="seq-rule-type" value={rule.type} disabled={disabled}
              onChange={e => set('type', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50">
              <option value="constant">{t.ruleTypeConstant}</option>
              <option value="sequential">{t.ruleTypeSequential}</option>
              <option value="fieldBased">{t.ruleTypeFieldBased}</option>
            </select>
          </div>

          {rule.type === 'constant' && (
            <div>
              <label className="text-xs text-black block mb-1" htmlFor="seq-rule-constant">{t.labelConstantValue}</label>
              <input id="seq-rule-constant" type="text" value={rule.constantValue} disabled={disabled}
                onChange={e => set('constantValue', e.target.value)} placeholder={t.placeholderConstant}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
            </div>
          )}

          {rule.type === 'sequential' && (
            <>
              <div>
                <label className="text-xs text-black block mb-1" htmlFor="seq-rule-start">{t.labelBillNoStart}</label>
                <input id="seq-rule-start" type="number" value={rule.start} disabled={disabled}
                  onChange={e => set('start', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
              </div>
              <div>
                <label className="text-xs text-black block mb-1" htmlFor="seq-rule-step">{t.labelBillNoStep}</label>
                <input id="seq-rule-step" type="number" min="1" value={rule.step} disabled={disabled}
                  onChange={e => set('step', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
              </div>
            </>
          )}

          {rule.type === 'fieldBased' && (
            <>
              <div>
                <label className="text-xs text-black block mb-1" htmlFor="seq-rule-field">{t.labelBaseField}</label>
                <select id="seq-rule-field" value={rule.baseField} disabled={disabled || columnOptions.length === 0}
                  onChange={e => set('baseField', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50">
                  <option value="">{t.placeholderSelectCol}</option>
                  {columnOptions.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-black block mb-1" htmlFor="seq-rule-start">{t.labelBillNoStart}</label>
                <input id="seq-rule-start" type="number" value={rule.start} disabled={disabled}
                  onChange={e => set('start', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
              </div>
              <div>
                <label className="text-xs text-black block mb-1" htmlFor="seq-rule-step">{t.labelBillNoStep}</label>
                <input id="seq-rule-step" type="number" min="1" value={rule.step} disabled={disabled}
                  onChange={e => set('step', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus-ring disabled:bg-gray-50" />
              </div>
            </>
          )}

          {note && <p className="text-sm text-black bg-blue-50 border border-blue-100 rounded px-2 py-1">{note}</p>}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button ref={closeBtnRef} onClick={onClose}
            className="btn-press px-4 py-1.5 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors focus-ring">
            {t.btnDone}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SeqRuleDialog
