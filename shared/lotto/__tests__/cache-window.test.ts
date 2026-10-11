/**
 * 分析 API 的快取秒數：每天 20:25～23:59（台北）開獎時段維持 5 分鐘，其餘時間快取到當天 20:25。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { analysisCacheSeconds } from '../cache-window'

// 台北時間 → Date（台北 = UTC+8，無日光節約）
const taipei = (s: string) => new Date(`${s}+08:00`)

describe('analysisCacheSeconds', () => {
  it('開獎時段（20:25～23:59）維持 5 分鐘', () => {
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T20:25:00')), 300)
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T20:40:00')), 300)
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T23:59:59')), 300)
  })

  it('其餘時間快取到當天 20:25', () => {
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T20:00:00')), 25 * 60)
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T00:00:00')), (20 * 60 + 25) * 60)
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T14:05:30')), (6 * 60 + 19) * 60 + 30)
  })

  it('週日也一樣處理（偶爾有週日開獎）', () => {
    assert.equal(analysisCacheSeconds(taipei('2026-10-11T10:00:00')), (10 * 60 + 25) * 60)
    assert.equal(analysisCacheSeconds(taipei('2026-10-11T21:00:00')), 300)
  })

  it('快到 20:25 時不低於 60 秒', () => {
    assert.equal(analysisCacheSeconds(taipei('2026-10-12T20:24:30')), 60)
  })
})
