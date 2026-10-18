/**
 * 唯一 id 生成（替代各处重复的 `Date.now() + Math.random().toString(36).substr(2,9)`）
 * 注：原实现使用了已废弃的 String.prototype.substr。
 */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 11)
  const base = `${Date.now()}-${rand}`
  return prefix ? `${prefix}-${base}` : base
}
