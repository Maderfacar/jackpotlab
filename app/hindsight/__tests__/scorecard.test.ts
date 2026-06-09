import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { baselineHitRate, N0 } from '../config'
import {
  createEmptyScorecard,
  recentHitRate,
  smoothedHitRate,
  updateScorecard
} from '../scorecard'
import type { BrainDraw, SignalFiringRecord } from '../types'

describe('scorecard', () => {
  it('updateScorecard 數學正確：hits、totalPicks、firingTerms 都正確累加', () => {
    const sc0 = createEmptyScorecard('s1')
    const firing: SignalFiringRecord = {
      drawTerm: 100,
      drawDate: '2026-06-09',
      picks: [3, 7, 12, 21, 38]
    }
    const nextDraw: BrainDraw = {
      drawTerm: 100,
      drawDate: '2026-06-09',
      numbers: [7, 12, 25, 30, 38]
    }
    const sc1 = updateScorecard(sc0, firing, nextDraw)

    // 中 3 顆：7, 12, 38；推 5 顆
    assert.equal(sc1.totalFires, 1)
    assert.equal(sc1.totalHits, 3)
    assert.equal(sc1.totalPicks, 5)
    assert.deepEqual(sc1.firingTerms, [100])
    assert.equal(sc1.recentFirings.length, 1)
    assert.equal(sc1.recentFirings[0]!.hits, 3)
    assert.deepEqual(sc1.recentFirings[0]!.hitNumbers, [7, 12, 38])

    // immutable：原 sc0 沒被動到
    assert.equal(sc0.totalFires, 0)
    assert.equal(sc0.totalHits, 0)
    assert.deepEqual(sc0.firingTerms, [])

    // 再來一期，0 命中
    const firing2: SignalFiringRecord = {
      drawTerm: 101,
      drawDate: '2026-06-10',
      picks: [1, 2]
    }
    const nextDraw2: BrainDraw = {
      drawTerm: 101,
      drawDate: '2026-06-10',
      numbers: [5, 10, 15, 20, 25]
    }
    const sc2 = updateScorecard(sc1, firing2, nextDraw2)
    assert.equal(sc2.totalFires, 2)
    assert.equal(sc2.totalHits, 3)
    assert.equal(sc2.totalPicks, 7)
    assert.deepEqual(sc2.firingTerms, [100, 101])
  })

  it('smoothedHitRate 樣本不足時被拉回 baseline', () => {
    const baseline = baselineHitRate('lotto539') // 5/39 ≈ 0.128
    const sc0 = createEmptyScorecard('s1')

    // totalPicks=0 → 純 baseline
    assert.equal(smoothedHitRate(sc0, baseline, N0), baseline)

    // 假設訊號推了 5 顆、中 5 顆（100% hit rate）→ 但樣本 = 5 < N0
    // 預期被拉到接近 baseline，遠低於 1.0
    const fakeSc = {
      ...sc0,
      totalFires: 1,
      totalHits: 5,
      totalPicks: 5
    }
    const smoothed = smoothedHitRate(fakeSc, baseline, N0)
    // (5 + (5/39) * 30) / (5 + 30) = (5 + 3.846) / 35 ≈ 0.253
    const expected = (5 + baseline * N0) / (5 + N0)
    assert.equal(smoothed, expected)
    assert.ok(smoothed < 0.3, `smoothed ${smoothed} should be < 0.3 (pulled toward baseline)`)
    assert.ok(smoothed > baseline, `smoothed ${smoothed} should be > baseline ${baseline}`)
  })

  it('recentHitRate window 內回正確、樣本不足回 null', () => {
    const sc0 = createEmptyScorecard('s1')
    assert.equal(recentHitRate(sc0, 20), null)

    let sc = sc0
    for (let i = 0; i < 5; i++) {
      sc = updateScorecard(sc, {
        drawTerm: i,
        drawDate: '2026-06-09',
        picks: [1, 2]
      }, {
        drawTerm: i,
        drawDate: '2026-06-09',
        numbers: [1, 99]
      })
    }
    // 每期推 2 中 1 → recent = 5/10 = 0.5
    assert.equal(recentHitRate(sc, 10), 0.5)
    // window=3 也應該還是 3/6 = 0.5
    assert.equal(recentHitRate(sc, 3), 0.5)
  })
})
