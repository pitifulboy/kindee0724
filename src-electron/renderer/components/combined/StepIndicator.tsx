import React from 'react'
import { combinedPage as t } from '../../config/appText'

export type StepStatus = 'done' | 'active' | 'todo'

export interface FlowStep {
  /** 步骤标题（如「合并表格」） */
  title: string
  /** 步骤状态 */
  status: StepStatus
}

interface StepIndicatorProps {
  steps: FlowStep[]
  /** 展示形态：'full' 大号带状态文字；'chips' 紧凑胶囊条（顶部工具条用） */
  variant?: 'full' | 'chips'
  /** 当前正在查看的环节（1~6），用于 aria-current 与「查看中」高亮 */
  activeStep?: number
  /** 点击某一步（1~6）：切到对应步骤卡并滚动过去 */
  onSelectStep?: (step: number) => void
}

/** 状态对应的圆形徽标样式（含文字状态，不单靠颜色传达） */
const circleClass: Record<StepStatus, string> = {
  done: 'bg-success-700 text-white border-success-700',
  active: 'bg-primary-800 text-white border-primary-800 ring-4 ring-primary-100',
  todo: 'bg-white text-black border-gray-300',
}

/** 状态对应的胶囊底色（chips 形态；状态另以 aria-label / title / sr-only 文字表达） */
const chipClass: Record<StepStatus, string> = {
  done: 'bg-success-50 border-success-700',
  active: 'bg-primary-50 border-primary-800 font-semibold',
  todo: 'bg-white border-gray-300',
}

/**
 * 横向步骤条：让用户一眼看清「共几步 / 现在在第几步 / 哪几步已完成」。
 * 每一步都是按钮：点击即跳到对应步骤卡。
 */
const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, variant = 'full', activeStep, onSelectStep }) => {
  const statusTextOf = (status: StepStatus) =>
    status === 'done' ? t.stepStatusDone : status === 'active' ? t.stepStatusActive : t.stepStatusTodo

  if (variant === 'chips') {
    return (
      <nav aria-label={t.flowTitle} className="w-full min-w-0">
        <ol className="flex items-center flex-wrap gap-y-1">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            const n = i + 1
            const isCurrent = activeStep === n
            const statusText = statusTextOf(step.status)
            return (
              <li key={step.title} className="flex items-center">
                <button
                  type="button"
                  onClick={onSelectStep ? () => onSelectStep(n) : undefined}
                  aria-label={t.stepLabel(n, step.title)}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={`${step.title} · ${statusText}`}
                  className={`flex items-center gap-1 min-w-0 rounded-full border px-2 py-0.5 focus-ring ${
                    chipClass[step.status]
                  } ${onSelectStep ? 'cursor-pointer hover:brightness-95' : ''} ${
                    isCurrent ? 'ring-2 ring-primary-200' : ''
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded-full border-2 font-bold flex-shrink-0 text-xs ${
                      circleClass[step.status]
                    }`}
                    aria-hidden="true"
                  >
                    {step.status === 'done' ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    ) : (
                      n
                    )}
                  </span>
                  <span className="text-sm text-black truncate">{step.title}</span>
                  <span className="sr-only">{statusText}</span>
                </button>
                {!isLast && <span className="w-3 h-0.5 mx-1 rounded bg-gray-200 flex-shrink-0" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      </nav>
    )
  }

  return (
    <nav aria-label={t.flowTitle} className="w-full">
      <ol className="flex items-start">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          const n = i + 1
          const isCurrent = activeStep === n
          const statusText = statusTextOf(step.status)
          return (
            <li key={step.title} className="flex-1 flex items-start min-w-0">
              <button
                type="button"
                onClick={onSelectStep ? () => onSelectStep(n) : undefined}
                aria-label={t.stepLabel(n, step.title)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex flex-col items-center min-w-0 flex-1 rounded-lg py-1 focus-ring ${
                  onSelectStep ? 'cursor-pointer hover:bg-blue-50' : ''
                } ${isCurrent ? 'bg-blue-50' : ''}`}
              >
                <div
                  className={`flex items-center justify-center rounded-full border-2 font-bold flex-shrink-0 w-8 h-8 text-sm ${
                    circleClass[step.status]
                  }`}
                  aria-hidden="true"
                >
                  {step.status === 'done' ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    n
                  )}
                </div>
                <span
                  className={`mt-1.5 text-center leading-tight truncate w-full px-1 text-sm ${
                    step.status === 'active' ? 'text-black font-semibold' : 'text-black'
                  }`}
                  title={step.title}
                >
                  {step.title}
                </span>
                <span className="sr-only">{statusText}</span>
                <span
                  className={`mt-0.5 text-xs ${
                    step.status === 'done'
                      ? 'text-success-700'
                      : step.status === 'active'
                        ? 'text-primary-700'
                        : 'text-black/60'
                  }`}
                >
                  {statusText}
                </span>
              </button>
              {!isLast && (
                <div
                  className={`h-0.5 flex-shrink-0 mt-5 mx-1 rounded ${
                    step.status === 'done' ? 'bg-success-700' : 'bg-gray-200'
                  }`}
                  style={{ width: 20 }}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default StepIndicator
