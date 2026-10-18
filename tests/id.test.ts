import { describe, it, expect } from 'vitest'
import { newId } from '../src-electron/renderer/utils/id'

describe('newId', () => {
  it('默认不带前缀', () => {
    expect(newId()).toMatch(/^\d+-[a-z0-9]+$/)
  })

  it('带前缀时以「前缀-」开头', () => {
    expect(newId('proj')).toMatch(/^proj-\d+-[a-z0-9]+$/)
  })

  it('连续生成不重复', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })
})
