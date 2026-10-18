import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import SearchableSelect from '../SearchableSelect'
import { visualization as v, combinedPage as t } from '../../config/appText'

/**
 * 界面2 · 合并表 LEFT JOIN 辅助表（Power BI 风格建模视图）
 *
 * - 左侧一张「合并表」卡片，右侧若干「辅助表」卡片
 * - 按住卡片表头可拖动卡片位置（画布内），并可在表头下拉切换连接方式（Left / Inner / Right Join）
 * - 卡片字段区默认最多显示 MAX_VISIBLE_ROWS 行，滚轮可在卡内滑动查看其余字段
 * - 每张卡片底部有「展开/收起本表字段」条；顶部「全部展开字段」可一次展开所有卡片
 * - 顶部缩放按钮（－ / 百分比 / ＋ / 复位）可缩放整个建模画布
 * - 已建立关联的字段（匹配键）默认上浮到各表字段列表最上端
 * - 每张卡片各有「本表字段搜索」，另有顶部全局字段搜索
 * - 匹配键在两侧加粗 + 高亮底色，并用曲线连接；拖拽字段到另一张表的字段上即可建立关联
 * - 双击连线 → 弹出「修改关联关系」面板，可改可删
 *
 * 复用：界面4「模板匹配（第二步）」同样复用本组件——模板表作左表、拆分明细表作右表，
 * 通过 leftTitle / toolbarTitle / leftFieldLabel 定制文案。
 */

interface MatchPair {
  orderCol: string
  auxCol: string
}

interface AuxTable {
  id: string
  name: string
  fileName: string
  matchPairs: MatchPair[]
  /** 与 matchPairs 平行的稳定 id（用于 React key；缺省时回退 `auxId-pairIndex`） */
  pairIds?: (string | undefined)[]
  how: 'left' | 'inner' | 'right'
}

type Side = 'left' | 'right'

interface LeftJoinModelViewProps {
  /** 合并表字段列表（来自 orderColumns / table1Columns） */
  mergedColumns: string[]
  /** 辅助表配置（来自 auxTables） */
  auxTables: AuxTable[]
  /** 辅助表 id → 字段列表（来自 auxColumnsMap） */
  auxColumnsMap: Record<string, string[]>
  /** 写回匹配键（双击连线修改用） */
  onChangeMatchPair: (auxId: string, pairIndex: number, field: 'orderCol' | 'auxCol', value: string) => void
  /** 拖拽连线新建关联：合并表字段 ←→ 辅助表字段 */
  onConnect?: (auxId: string, orderCol: string, auxCol: string) => void
  /** 删除一条关联（双击连线面板中的「删除」） */
  onRemoveMatchPair?: (auxId: string, pairIndex: number) => void
  /** 修改某张辅助表的连接方式（left / inner / right join） */
  onChangeJoinType?: (auxId: string, how: 'left' | 'inner' | 'right') => void
  /** 左侧表卡片标题（默认「合并表」，第二步模板匹配时传「模板表」） */
  leftTitle?: string
  /** 顶部工具栏标题（默认「合并表 Left Join 辅助表」） */
  toolbarTitle?: string
  /** 左侧表在文案中的称谓（默认「合并表」，用于空态与关联面板标签） */
  leftFieldLabel?: string
  /** 无辅助表时的空态提示 */
  emptyText?: string
}

// ── 布局常量（SVG 用户坐标）──
const CARD_W = 240
const HDR_H = 34
const SEARCH_H = 28 // 卡片内「本表字段搜索」行高
const ROW_H = 26
const MAX_VISIBLE_ROWS = 8 // 未展开时每卡最多显示的行数（其余可滚动）
const FOOT_H = 26 // 卡片底部「展开/折叠」条高度
const SCROLLBAR_W = 6
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.25
const COL_GAP = 200
const V_GAP = 20
const PAD = 20
const BOTTOM = 36
const MIN_CONTENT_H = 120
const DRAG_MAX = 3000

const LEFT_X = PAD
const RIGHT_X = PAD + CARD_W + COL_GAP
const CANVAS_W = RIGHT_X + CARD_W + PAD

const KEY_FILL = '#dbeafe'   // primary-100，匹配键高亮底色
const HOVER_FILL = '#d1fae5' // 拖拽目标高亮（浅绿）
const LINE_COLOR = '#1d4ed8' // primary-700，关联线
const DIM_LINE = '#a5c4f7'   // 端点滚出视野时的淡化连线
const CONNECT_COLOR = '#10b981' // 拖拽建立关联时的提示色

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** 卡片字段区可视高度 / 卡片高度 */
const viewHOf = (rows: number) => Math.max(rows, 1) * ROW_H
const cardHOf = (rows: number, hasFoot: boolean) => HDR_H + SEARCH_H + viewHOf(rows) + (hasFoot ? FOOT_H : 0)
const bodyTopOf = (cardY: number) => cardY + HDR_H + SEARCH_H
/** 卡片底部「展开/折叠」条（下方两角圆角） */
const footerPath = (x: number, y: number, w: number, h: number) =>
  `M${x} ${y} H${x + w} V${y + h - 10} A10 10 0 0 1 ${x + w - 10} ${y + h} H${x + 10} A10 10 0 0 1 ${x} ${y + h - 10} Z`

/** 关联字段（参与匹配的字段）上浮到最上端，其余保持原顺序 */
const keyFirst = (cols: string[], isKey: (c: string) => boolean) => {
  const k: string[] = []
  const rest: string[] = []
  cols.forEach(c => (isKey(c) ? k : rest).push(c))
  return k.length ? [...k, ...rest] : cols
}
/** 某字段行中心的 Y 坐标（含卡内滚动偏移） */
const rowYOf = (cardY: number, index: number, scrollTop: number) =>
  bodyTopOf(cardY) + index * ROW_H + ROW_H / 2 - scrollTop

/** 卡片表头（仅上方两角圆角） */
const headerPath = (x: number, y: number, w: number) =>
  `M${x + 10} ${y} H${x + w - 10} A10 10 0 0 1 ${x + w} ${y + 10} V${y + HDR_H} H${x} V${y + 10} A10 10 0 0 1 ${x + 10} ${y} Z`

/** 两列之间的 S 形曲线 */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

const JOIN_OPTIONS: { value: 'left' | 'inner' | 'right'; label: string }[] = [
  { value: 'left', label: t.joinLeft },
  { value: 'inner', label: t.joinInner },
  { value: 'right', label: t.joinRight },
]

/** 卡片内「本表字段搜索」输入框样式（foreignObject 内，px 即 SVG 用户单位） */
const cardSearchStyle: React.CSSProperties = {
  width: '100%',
  height: SEARCH_H - 6,
  display: 'block',
  boxSizing: 'border-box',
  fontSize: 12,
  padding: '0 6px',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  color: '#000000',
  background: '#ffffff',
  outline: 'none',
}

/** 表头内「连接方式」下拉样式（foreignObject 内） */
const joinSelectStyle: React.CSSProperties = {
  width: '100%',
  height: HDR_H - 10,
  display: 'block',
  boxSizing: 'border-box',
  fontSize: 12,
  padding: '0 4px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  color: '#000000',
  background: '#ffffff',
  outline: 'none',
  cursor: 'pointer',
}

/** 卡内滚动条（可视 + 非交互，滚轮负责滚动） */
const CardScrollbar: React.FC<{ x: number; bodyTop: number; viewH: number; contentH: number; scrollTop: number }> = ({
  x, bodyTop, viewH, contentH, scrollTop,
}) => {
  if (contentH <= viewH) return null
  const trackX = x + CARD_W - SCROLLBAR_W - 2
  const trackY = bodyTop + 3
  const trackH = Math.max(viewH - 6, 0)
  const thumbH = Math.max(20, (trackH * viewH) / contentH)
  const thumbY = trackY + (scrollTop / (contentH - viewH)) * Math.max(trackH - thumbH, 0)
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={trackX} y={trackY} width={4} height={trackH} rx={2} fill="#f3f4f6" />
      <rect x={trackX} y={thumbY} width={4} height={thumbH} rx={2} fill="#9ca3af" opacity={0.85} />
    </g>
  )
}

interface DragState {
  side: Side
  auxId?: string
  col: string
  x: number
  y: number
  over: { side: Side; auxId?: string; col: string } | null
}

/** 卡片拖动状态 */
interface MoveState {
  id: string
  offsetX: number
  offsetY: number
}

/** 卡片几何（供滚轮命中 / 命中测试使用） */
interface CardGeom {
  id: string
  x: number
  y: number
  viewH: number
  contentH: number
}

const LeftJoinModelView: React.FC<LeftJoinModelViewProps> = ({
  mergedColumns, auxTables, auxColumnsMap, onChangeMatchPair, onConnect, onRemoveMatchPair, onChangeJoinType,
  leftTitle = v.leftJoinLeftTitleDefault,
  toolbarTitle = v.leftJoinToolbarDefault,
  leftFieldLabel = v.leftJoinLeftLabelDefault,
  emptyText = v.leftJoinEmptyDefault,
}) => {
  const [editing, setEditing] = useState<{ auxId: string; pairIndex: number } | null>(null)
  const [draftOrderCol, setDraftOrderCol] = useState('')
  const [draftAuxCol, setDraftAuxCol] = useState('')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [move, setMove] = useState<MoveState | null>(null)
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})
  const [scroll, setScroll] = useState<Record<string, number>>({})
  const [expandAll, setExpandAll] = useState(false)
  /** 每张卡片自己的展开/折叠：key = 'left' | aux.id */
  const [cardExpand, setCardExpand] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  /** 每张卡片自己的字段搜索：key = 'left' | aux.id */
  const [cardQuery, setCardQuery] = useState<Record<string, string>>({})
  /** 建模视图定位为「检查配置」界面：默认隐藏未使用（未参与匹配/映射）的字段 */
  const [hideUnused, setHideUnused] = useState(true)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const moveRef = useRef<MoveState | null>(null)
  const geomRef = useRef<{ left: CardGeom; cards: CardGeom[] } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** 实例级 clipPath ID 前缀：建模视图同时挂载多个本组件（步骤 2/4/5），
   *  SVG 的 url(#id) 按 DOM 顺序解析到第一个同名节点——若各实例共用固定 ID，
   *  后面的实例会裁剪到第一个实例的矩形上（表现为字段行被空白裁没）。 */
  const uid = useId().replace(/:/g, '')

  // 被 matchPairs 引用的匹配键集合
  const keyCols = useMemo(() => {
    const s = new Set<string>()
    auxTables.forEach(a => a.matchPairs.forEach(p => { if (p.orderCol) s.add(p.orderCol) }))
    return s
  }, [auxTables])

  // 字段搜索：顶部搜索框为全局；每张卡片另可用自己的搜索单独过滤（卡内搜索优先）
  const q = query.trim().toLowerCase()
  const cardQ = (id: string) => (cardQuery[id] || '').trim().toLowerCase()
  const leftQ = cardQ('left') || q

  const leftColsRaw = useMemo(() => {
    let cols = mergedColumns
    if (leftQ) {
      cols = cols.filter(c => c.toLowerCase().includes(leftQ))
    } else if (hideUnused) {
      // 仅显示参与匹配的字段（无搜索词时才隐藏未使用字段）
      cols = cols.filter(c => keyCols.has(c))
    }
    return cols
  }, [leftQ, mergedColumns, hideUnused, keyCols])
  // 关联字段（匹配键）上浮到最上端
  const leftCols = useMemo(
    () => keyFirst(leftColsRaw, c => keyCols.has(c)),
    [leftColsRaw, keyCols],
  )

  // 左侧合并表
  const leftPos = pos.left || { x: LEFT_X, y: PAD }
  const leftX = clamp(leftPos.x, 0, CANVAS_W - CARD_W)
  const leftY = Math.max(leftPos.y, 0)
  const leftContentH = viewHOf(leftCols.length)
  const leftExpanded = expandAll || !!cardExpand.left
  const leftVisRows = leftExpanded ? Math.max(leftCols.length, 1) : Math.min(Math.max(leftCols.length, 1), MAX_VISIBLE_ROWS)
  const leftViewH = viewHOf(leftVisRows)
  const hasFootLeft = !expandAll && leftCols.length > MAX_VISIBLE_ROWS
  const leftH = cardHOf(leftVisRows, hasFootLeft)
  const leftScrollTop = clamp(scroll.left || 0, 0, Math.max(0, leftContentH - leftViewH))

  // 右侧辅助表（默认纵向排布，拖动后使用自定义位置）
  const rightCards = useMemo(() => {
    let cy = PAD
    return auxTables.map(aux => {
      const all = (auxColumnsMap[aux.id] || []).filter(Boolean)
      const cq = (cardQuery[aux.id] || '').trim().toLowerCase() || q
      const isUsed = (c: string) => aux.matchPairs.some(p => p.auxCol === c)
      let filtered = all
      if (cq) {
        filtered = all.filter(c => c.toLowerCase().includes(cq))
      } else if (hideUnused) {
        filtered = all.filter(isUsed)
      }
      // 关联字段（匹配键）上浮到最上端
      const cols = keyFirst(filtered, isUsed)
      const contentH = viewHOf(cols.length)
      const expanded = expandAll || !!cardExpand[aux.id]
      const visRows = expanded ? Math.max(cols.length, 1) : Math.min(Math.max(cols.length, 1), MAX_VISIBLE_ROWS)
      const viewH = viewHOf(visRows)
      const hasFoot = !expandAll && cols.length > MAX_VISIBLE_ROWS
      const cardH = cardHOf(visRows, hasFoot)
      const defY = cy
      cy += cardH + V_GAP
      const p = pos[aux.id]
      const x = clamp(p ? p.x : RIGHT_X, 0, CANVAS_W - CARD_W)
      const y = Math.max(p ? p.y : defY, 0)
      const scrollTop = clamp(scroll[aux.id] || 0, 0, Math.max(0, contentH - viewH))
      return { aux, cols, contentH, visRows, viewH, cardH, defY, x, y, scrollTop, cq, expanded, hasFoot }
    })
  }, [auxTables, auxColumnsMap, q, cardQuery, pos, scroll, expandAll, cardExpand, hideUnused])

  const matchCount = useMemo(() => {
    if (!q) return 0
    const l = mergedColumns.filter(c => c.toLowerCase().includes(q)).length
    const r = auxTables.reduce((n, a) =>
      n + (auxColumnsMap[a.id] || []).filter(c => c.toLowerCase().includes(q)).length, 0)
    return l + r
  }, [q, mergedColumns, auxTables, auxColumnsMap])

  // 画布高度：按「默认纵向排布」计算，不随拖动变化（避免拖动时缩放抖动）
  const defaultBottom = Math.max(
    PAD + leftH,
    rightCards.length ? Math.max(...rightCards.map(c => c.defY + c.cardH)) : 0,
    PAD + MIN_CONTENT_H,
  )
  const legendY = defaultBottom + BOTTOM / 2
  const canvasH = defaultBottom + BOTTOM

  // 合并表字段 → 行号
  const leftIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    leftCols.forEach((c, i) => m.set(c, i))
    return m
  }, [leftCols])

  // 关联连线（端点滚出可视区时贴边 + 淡化）
  const lines = useMemo(() => {
    const out: {
      key: string; auxId: string; pairIndex: number
      x1: number; y1: number; x2: number; y2: number; dim: boolean
    }[] = []
    const leftBodyTop = bodyTopOf(leftY)
    const leftBodyBottom = leftY + leftH
    rightCards.forEach(card => {
      const bodyTop = bodyTopOf(card.y)
      const bodyBottom = card.y + card.cardH
      card.aux.matchPairs.forEach((p, pi) => {
        const li = leftIndexMap.get(p.orderCol)
        const ri = card.cols.indexOf(p.auxCol)
        if (li === undefined || ri < 0) return
        const lyRaw = rowYOf(leftY, li, leftScrollTop)
        const ryRaw = rowYOf(card.y, ri, card.scrollTop)
        const y1 = clamp(lyRaw, leftBodyTop + 2, leftBodyBottom - 2)
        const y2 = clamp(ryRaw, bodyTop + 2, bodyBottom - 2)
        out.push({
          key: card.aux.pairIds?.[pi] ?? `${card.aux.id}-${pi}`,
          auxId: card.aux.id,
          pairIndex: pi,
          x1: leftX + CARD_W,
          y1,
          x2: card.x,
          y2,
          dim: y1 !== lyRaw || y2 !== ryRaw,
        })
      })
    })
    return out
  }, [rightCards, leftIndexMap, leftX, leftY, leftH, leftScrollTop])

  const editingAux = editing ? auxTables.find(a => a.id === editing.auxId) : undefined
  const editingAuxCols = editing ? (auxColumnsMap[editing.auxId] || []).filter(Boolean) : []

  // ── 坐标换算 ──
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  // 供滚轮使用的卡片几何（每次渲染刷新）
  geomRef.current = {
    left: { id: 'left', x: leftX, y: leftY, viewH: leftViewH, contentH: leftContentH },
    cards: rightCards.map(c => ({ id: c.aux.id, x: c.x, y: c.y, viewH: c.viewH, contentH: c.contentH })),
  }

  // 卡内滚轮滑动（需非 passive 才能 preventDefault）
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      const g = geomRef.current
      if (!g) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const p = pt.matrixTransform(ctm.inverse())
      for (const c of [g.left, ...g.cards]) {
        const bodyTop = bodyTopOf(c.y)
        const bodyBottom = bodyTop + c.viewH
        if (p.x >= c.x && p.x <= c.x + CARD_W && p.y >= bodyTop && p.y <= bodyBottom) {
          const max = c.contentH - c.viewH
          if (max <= 0) return
          e.preventDefault()
          setScroll(s => ({ ...s, [c.id]: clamp((s[c.id] || 0) + e.deltaY, 0, max) }))
          return
        }
      }
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  // 修改关联关系面板：打开时聚焦面板，Esc 关闭
  useEffect(() => {
    if (!editing) return
    panelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [editing])

  /** 命中测试：返回鼠标所在字段行 */
  const hitTest = (x: number, y: number): { side: Side; auxId?: string; col: string } | null => {
    if (x >= leftX && x <= leftX + CARD_W) {
      const top = bodyTopOf(leftY)
      if (y >= top && y <= top + leftViewH) {
        const i = Math.floor((y - top + leftScrollTop) / ROW_H)
        if (i >= 0 && i < leftCols.length) return { side: 'left', col: leftCols[i] }
      }
    }
    for (const card of rightCards) {
      if (x < card.x || x > card.x + CARD_W) continue
      const top = bodyTopOf(card.y)
      if (y >= top && y <= top + card.viewH) {
        const i = Math.floor((y - top + card.scrollTop) / ROW_H)
        if (i >= 0 && i < card.cols.length) return { side: 'right', auxId: card.aux.id, col: card.cols[i] }
      }
    }
    return null
  }

  // ── 拖拽连线 ──
  const onRowPointerDown = (e: React.PointerEvent, side: Side, col: string, auxId?: string) => {
    if (!onConnect || !col) return
    e.preventDefault()
    e.stopPropagation()
    const svg = svgRef.current
    if (svg) { try { svg.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
    const p = toSvg(e.clientX, e.clientY)
    const next: DragState = { side, auxId, col, x: p.x, y: p.y, over: null }
    dragRef.current = next
    setDrag(next)
  }

  // ── 拖动卡片（表头按住）──
  const onCardHeaderPointerDown = (e: React.PointerEvent, id: string, cardX: number, cardY: number) => {
    e.preventDefault()
    e.stopPropagation()
    const svg = svgRef.current
    if (svg) { try { svg.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
    const p = toSvg(e.clientX, e.clientY)
    const next: MoveState = { id, offsetX: p.x - cardX, offsetY: p.y - cardY }
    moveRef.current = next
    setMove(next)
  }

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const mv = moveRef.current
    if (mv) {
      const p = toSvg(e.clientX, e.clientY)
      setPos(s => ({
        ...s,
        [mv.id]: {
          x: clamp(p.x - mv.offsetX, 0, CANVAS_W - CARD_W),
          y: clamp(p.y - mv.offsetY, 0, DRAG_MAX),
        },
      }))
      return
    }
    const cur = dragRef.current
    if (!cur) return
    const p = toSvg(e.clientX, e.clientY)
    const hit = hitTest(p.x, p.y)
    const over = hit && hit.side !== cur.side ? hit : null
    const next: DragState = { ...cur, x: p.x, y: p.y, over }
    dragRef.current = next
    setDrag(next)
  }

  const onSvgPointerUp = (e: React.PointerEvent) => {
    if (moveRef.current) {
      moveRef.current = null
      setMove(null)
      return
    }
    const cur = dragRef.current
    if (!cur) return
    const p = toSvg(e.clientX, e.clientY)
    const hit = hitTest(p.x, p.y)
    if (hit && hit.side !== cur.side && onConnect) {
      if (cur.side === 'left' && hit.side === 'right' && hit.auxId) {
        onConnect(hit.auxId, cur.col, hit.col)
      } else if (cur.side === 'right' && hit.side === 'left' && cur.auxId) {
        onConnect(cur.auxId, hit.col, cur.col)
      }
    }
    dragRef.current = null
    setDrag(null)
  }

  const onSvgPointerCancel = () => {
    dragRef.current = null
    moveRef.current = null
    setDrag(null)
    setMove(null)
  }

  // 拖拽起点（字段行出线端）
  let dragFrom: { x1: number; y1: number } | null = null
  if (drag) {
    if (drag.side === 'left') {
      const li = leftIndexMap.get(drag.col)
      if (li !== undefined) {
        dragFrom = { x1: leftX + CARD_W, y1: rowYOf(leftY, li, leftScrollTop) }
      }
    } else {
      const card = rightCards.find(c => c.aux.id === drag.auxId)
      const ri = card ? card.cols.indexOf(drag.col) : -1
      if (card && ri >= 0) dragFrom = { x1: card.x, y1: rowYOf(card.y, ri, card.scrollTop) }
    }
  }
  const dragTargetActive = !!drag?.over

  const openEdit = (auxId: string, pairIndex: number) => {
    const aux = auxTables.find(a => a.id === auxId)
    const pair = aux?.matchPairs[pairIndex]
    setDraftOrderCol(pair?.orderCol || '')
    setDraftAuxCol(pair?.auxCol || '')
    setEditing({ auxId, pairIndex })
  }

  const confirmEdit = () => {
    if (!editing) return
    onChangeMatchPair(editing.auxId, editing.pairIndex, 'orderCol', draftOrderCol)
    onChangeMatchPair(editing.auxId, editing.pairIndex, 'auxCol', draftAuxCol)
    setEditing(null)
  }

  const confirmRemove = () => {
    if (!editing || !onRemoveMatchPair) return
    onRemoveMatchPair(editing.auxId, editing.pairIndex)
    setEditing(null)
  }

  if (auxTables.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
        <p className="text-xs text-black">{emptyText}</p>
      </div>
    )
  }

  const rowCursor = onConnect ? 'grab' : 'default'
  const headerCursor = (id: string) => (move?.id === id ? 'grabbing' : 'move')

  /** 卡片表头（可拖动） */
  const renderHeader = (
    id: string, x: number, y: number, title: string, right: React.ReactNode,
  ) => (
    <g
      style={{ cursor: headerCursor(id) }}
      onPointerDown={e => onCardHeaderPointerDown(e, id, x, y)}
    >
      <path d={headerPath(x, y, CARD_W)} fill="#f9fafb" />
      <text x={x + 12} y={y + HDR_H / 2} dominantBaseline="central" fontSize={13} fontWeight={600} fill="#000000">{title}</text>
      {right}
    </g>
  )

  /** 单行字段 */
  const renderRow = (
    side: Side, auxId: string | undefined, col: string, i: number,
    cardX: number, cardY: number, scrollTop: number, isKey: boolean, isSource: boolean, isTarget: boolean,
  ) => {
    const y = rowYOf(cardY, i, scrollTop)
    return (
      <g key={col} style={{ cursor: rowCursor }} onPointerDown={e => onRowPointerDown(e, side, col, auxId)}>
        {isKey && <rect x={cardX + 4} y={y - ROW_H / 2} width={CARD_W - 8} height={ROW_H} rx={4} fill={KEY_FILL} />}
        {isSource && <rect x={cardX + 4} y={y - ROW_H / 2} width={CARD_W - 8} height={ROW_H} rx={4} fill="none" stroke={LINE_COLOR} strokeWidth={1.5} strokeDasharray="4 3" />}
        {isTarget && <rect x={cardX + 4} y={y - ROW_H / 2} width={CARD_W - 8} height={ROW_H} rx={4} fill={HOVER_FILL} stroke={CONNECT_COLOR} strokeWidth={1.5} />}
        <text x={cardX + 14} y={y} dominantBaseline="central" fontSize={12} fontWeight={isKey ? 700 : 400} fill="#000000">{col}</text>
      </g>
    )
  }

  /** 卡片底部「展开/折叠本表字段」条 */
  const renderFooter = (id: string, x: number, cardY: number, viewH: number, total: number, expanded: boolean) => {
    const fy = bodyTopOf(cardY) + viewH
    return (
      <g
        key={`foot-${id}`}
        style={{ cursor: 'pointer' }}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          setCardExpand(s => ({ ...s, [id]: !s[id] }))
        }}
      >
        <path d={footerPath(x, fy, CARD_W, FOOT_H)} fill="#f3f4f6" stroke="#e5e7eb" strokeWidth={1} />
        <text x={x + CARD_W / 2} y={fy + FOOT_H / 2} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={500} fill="#1d4ed8">
          {expanded ? v.footerCollapse : v.footerExpand(total)}
        </text>
      </g>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <span className="text-sm font-semibold text-black">{toolbarTitle}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label={v.zoomTitle}>
            <button
              type="button"
              onClick={() => setZoom(z => clamp(+((z - ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="缩小"
              title="缩小"
              className="w-7 h-7 flex items-center justify-center text-sm text-black border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
            >
              －
            </button>
            <span className="w-12 text-center text-xs text-black tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => clamp(+((z + ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="放大"
              title="放大"
              className="w-7 h-7 flex items-center justify-center text-sm text-black border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              className="px-2 h-7 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
            >
              {v.zoomReset}
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-black cursor-pointer select-none" title={v.expandAllTitle}>
            <input type="checkbox" className="w-4 h-4" checked={expandAll} onChange={e => setExpandAll(e.target.checked)} />
            {v.expandAllLabel}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-black cursor-pointer select-none" title={v.hideUnusedTitle}>
            <input type="checkbox" className="w-4 h-4" checked={hideUnused} onChange={e => setHideUnused(e.target.checked)} />
            {v.hideUnusedLabel}
          </label>
          <div className="relative w-56">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={v.searchPlaceholder}
              aria-label={v.searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-sm text-black border border-gray-200 rounded-md focus-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={v.searchClear}
                title={v.searchClear}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-black hover:bg-gray-100 rounded focus-ring"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {q && (
        <p className="text-xs text-black mb-2" aria-live="polite">
          {matchCount > 0 ? v.matchCount(matchCount) : v.noMatchFields}
        </p>
      )}

      <div className="relative border-2 border-gray-200 rounded-lg overflow-auto bg-white" style={{ maxHeight: 620 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
          style={{ width: `${zoom * 100}%`, height: 'auto', display: 'block', touchAction: 'none' }}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerCancel={onSvgPointerCancel}
        >
          <defs>
            <clipPath id={`${uid}-clip-left`}>
              <rect x={leftX} y={bodyTopOf(leftY)} width={CARD_W} height={leftViewH} />
            </clipPath>
            {rightCards.map(card => (
              <clipPath key={card.aux.id} id={`${uid}-clip-${card.aux.id}`}>
                <rect x={card.x} y={bodyTopOf(card.y)} width={CARD_W} height={card.viewH} />
              </clipPath>
            ))}
          </defs>

          {/* ── 左：合并表 ── */}
          <rect x={leftX} y={leftY} width={CARD_W} height={leftH} rx={10} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1} />
          {renderHeader('left', leftX, leftY, leftTitle, (
            <text x={leftX + CARD_W - 12} y={leftY + HDR_H / 2} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#000000">{`${keyCols.size}/${mergedColumns.length}`}</text>
          ))}

          {/* 本表字段搜索 */}
          <foreignObject x={leftX + 8} y={leftY + HDR_H + 3} width={CARD_W - 16} height={SEARCH_H - 6}>
            <input
              type="text"
              style={cardSearchStyle}
              value={cardQuery.left || ''}
              onChange={e => setCardQuery(s => ({ ...s, left: e.target.value }))}
              placeholder={v.cardSearchPlaceholder}
            />
          </foreignObject>

          <g clipPath={`url(#${uid}-clip-left)`}>
            {leftCols.length === 0 ? (
              <text x={leftX + 14} y={rowYOf(leftY, 0, 0)} dominantBaseline="central" fontSize={12} fill="#000000">
                {leftQ ? v.noMatchField : (hideUnused ? v.noUsedFieldsLeft(leftFieldLabel) : v.noColumnsOf(leftFieldLabel))}
              </text>
            ) : (
              leftCols.map((col, i) => renderRow(
                'left', undefined, col, i, leftX, leftY, leftScrollTop,
                keyCols.has(col),
                drag?.side === 'left' && drag.col === col,
                drag?.over?.side === 'left' && drag.over.col === col,
              ))
            )}
          </g>
          <CardScrollbar x={leftX} bodyTop={bodyTopOf(leftY)} viewH={leftViewH} contentH={leftContentH} scrollTop={leftScrollTop} />
          {hasFootLeft && renderFooter('left', leftX, leftY, leftViewH, leftCols.length, leftExpanded)}

          {/* ── 右：辅助表 ── */}
          {rightCards.map(card => (
            <g key={card.aux.id}>
              <rect x={card.x} y={card.y} width={CARD_W} height={card.cardH} rx={10} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1} />
              {renderHeader(card.aux.id, card.x, card.y, card.aux.name, (
                <foreignObject x={card.x + CARD_W - 100} y={card.y + 5} width={88} height={HDR_H - 10}>
                  <select
                    value={card.aux.how}
                    title={v.joinType}
                    disabled={!onChangeJoinType}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={e => onChangeJoinType?.(card.aux.id, e.target.value as 'left' | 'inner' | 'right')}
                    style={joinSelectStyle}
                  >
                    {JOIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </foreignObject>
              ))}

              {/* 本表字段搜索 */}
              <foreignObject x={card.x + 8} y={card.y + HDR_H + 3} width={CARD_W - 16} height={SEARCH_H - 6}>
                <input
                  type="text"
                  style={cardSearchStyle}
                  value={cardQuery[card.aux.id] || ''}
                  onChange={e => setCardQuery(s => ({ ...s, [card.aux.id]: e.target.value }))}
                  placeholder={v.cardSearchPlaceholder}
                />
              </foreignObject>

              <g clipPath={`url(#${uid}-clip-${card.aux.id})`}>
                {card.cols.length === 0 ? (
                  <text x={card.x + 14} y={rowYOf(card.y, 0, 0)} dominantBaseline="central" fontSize={12} fill="#000000">
                    {card.cq ? v.noMatchField : (hideUnused ? v.noUsedFieldsRight : v.noColumns)}
                  </text>
                ) : (
                  card.cols.map((col, i) => renderRow(
                    'right', card.aux.id, col, i, card.x, card.y, card.scrollTop,
                    card.aux.matchPairs.some(p => p.auxCol === col),
                    drag?.side === 'right' && drag.auxId === card.aux.id && drag.col === col,
                    drag?.over?.side === 'right' && drag.over.auxId === card.aux.id && drag.over.col === col,
                  ))
                )}
              </g>
              <CardScrollbar x={card.x} bodyTop={bodyTopOf(card.y)} viewH={card.viewH} contentH={card.contentH} scrollTop={card.scrollTop} />
              {card.hasFoot && renderFooter(card.aux.id, card.x, card.y, card.viewH, card.cols.length, card.expanded)}
            </g>
          ))}

          {/* ── 关联连线（画在卡片之上，端点圆点不被遮挡）── */}
          {lines.map(l => (
            <g key={l.key}>
              <path d={curve(l.x1, l.y1, l.x2, l.y2)} fill="none" stroke={l.dim ? DIM_LINE : LINE_COLOR} strokeWidth={1.8} strokeDasharray={l.dim ? '5 4' : undefined} strokeLinecap="round" />
              <path
                d={curve(l.x1, l.y1, l.x2, l.y2)}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => openEdit(l.auxId, l.pairIndex)}
              />
              <circle cx={l.x1} cy={l.y1} r={3.5} fill={l.dim ? DIM_LINE : LINE_COLOR} stroke="#ffffff" strokeWidth={1.5} />
              <circle cx={l.x2} cy={l.y2} r={3.5} fill={l.dim ? DIM_LINE : LINE_COLOR} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          ))}

          {/* ── 拖拽中的临时连线 ── */}
          {dragFrom && drag && (
            <path
              d={curve(dragFrom.x1, dragFrom.y1, drag.x, drag.y)}
              fill="none"
              stroke={dragTargetActive ? CONNECT_COLOR : LINE_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* ── 图例 ── */}
          <circle cx={LEFT_X + 4} cy={legendY} r={4} fill={LINE_COLOR} />
          <text x={LEFT_X + 16} y={legendY} dominantBaseline="central" fontSize={12} fill="#000000">{v.legendKey}</text>
          <text x={CANVAS_W - PAD} y={legendY} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#000000">
            {v.legendHint}
          </text>
        </svg>
      </div>

      {/* ── 修改关联关系面板 ── */}
      {editing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20" onClick={() => setEditing(null)}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={v.editPairTitle}
            tabIndex={-1}
            className="bg-white rounded-xl shadow-2xl w-80 focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 rounded-t-xl">
              <span className="text-sm font-semibold text-black">{v.editPairTitle}</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-black mb-1">{v.editLeftField(leftFieldLabel)}</label>
                <SearchableSelect
                  value={draftOrderCol}
                  options={mergedColumns}
                  onChange={setDraftOrderCol}
                  placeholder={v.editFieldPlaceholder}
                  ariaLabel={v.editLeftField(leftFieldLabel)}
                />
              </div>
              <div className="text-center text-xs text-black" aria-hidden="true">＝</div>
              <div>
                <label className="block text-xs text-black mb-1">{v.editAuxField(editingAux?.name)}</label>
                <SearchableSelect
                  value={draftAuxCol}
                  options={editingAuxCols}
                  onChange={setDraftAuxCol}
                  placeholder={v.editFieldPlaceholder}
                  ariaLabel={v.editAuxField(editingAux?.name)}
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between rounded-b-xl">
              {onRemoveMatchPair ? (
                <button
                  onClick={confirmRemove}
                  className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 focus-ring"
                >
                  {v.removePair}
                </button>
              ) : <span />}
              <div className="flex space-x-2">
                <button
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 text-sm text-black border border-gray-200 rounded hover:bg-gray-50 focus-ring"
                >
                  {v.cancel}
                </button>
                <button
                  onClick={confirmEdit}
                  className="btn-press px-3 py-1.5 text-sm font-medium text-white bg-primary-800 rounded hover:bg-primary-700 focus-ring"
                >
                  {v.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeftJoinModelView