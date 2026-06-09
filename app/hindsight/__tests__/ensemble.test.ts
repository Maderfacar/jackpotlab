import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { baselineHitRate, N0 } from '../config'
import { rankNumbersForNextDraw } from '../ensemble'
import { smoothedHitRate } from '../scorecard'
import type { SignalFiringRecord, SignalScorecard } from '../types'

function makeScorecard(signalId: string, hits: number, picks: number): SignalScorecard {
  return {
    signalId,
    totalFires: 10,
    totalHits: hits,
    totalPicks: picks,
    recentFirings: [],
    firingTerms: [],
    coFiringCounts: {}
  }
}

describe('ensemble.rankNumbersForNextDraw', () => {
  it('票數加總正確：兩支訊號各推不同號碼 → 各自獨立 score', () => {
    const baseline = baselineHitRate('lotto539')
    const scA = makeScorecard('A', 100, 200)
    const scB = makeScorecard('B', 30, 60)
    const wA = smoothedHitRate(scA, baseline, N0)
    const wB = smoothedHitRate(scB, baseline, N0)
    assert.notEqual(wA, wB) // 兩支訊號權重不同

    const firings: Record<string, SignalFiringRecord> = {
      A: { drawTerm: 1, drawDate: '', picks: [3, 7] },
      B: { drawTerm: 1, drawDate: '', picks: [5] }
    }
    const ranked = rankNumbersForNextDraw(firings, { A: scA, B: scB }, 'lotto539')
    assert.equal(ranked.length, 3)

    const n3 = ranked.find(r => r.number === 3)!
    const n7 = ranked.find(r => r.number === 7)!
    const n5 = ranked.find(r => r.number === 5)!
    assert.equal(n3.score, wA)
    assert.equal(n7.score, wA)
    assert.equal(n5.score, wB)
    assert.deepEqual(n3.supportingSignals, ['A'])
    assert.deepEqual(n5.supportingSignals, ['B'])
  })

  it('同號被兩支訊號推 → score = wA + wB、supportingSignals 兩個都列', () => {
    const baseline = baselineHitRate('lotto539')
    const scA = makeScorecard('A', 100, 200) // 強訊號
    const scB = makeScorecard('B', 5, 100) // 弱訊號
    const wA = smoothedHitRate(scA, baseline, N0)
    const wB = smoothedHitRate(scB, baseline, N0)

    const firings: Record<string, SignalFiringRecord> = {
      A: { drawTerm: 1, drawDate: '', picks: [3, 7] },
      B: { drawTerm: 1, drawDate: '', picks: [3, 12] }
    }
    const ranked = rankNumbersForNextDraw(firings, { A: scA, B: scB }, 'lotto539')
    const n3 = ranked.find(r => r.number === 3)!

    // 浮點數可能微差，用 toFixed 比較
    assert.ok(Math.abs(n3.score - (wA + wB)) < 1e-12)
    assert.equal(n3.supportingSignals.length, 2)
    assert.ok(n3.supportingSignals.includes('A'))
    assert.ok(n3.supportingSignals.includes('B'))

    // 共推 3 應該排第一（score 最高）
    assert.equal(ranked[0]!.number, 3)
  })

  it('scorecards 缺漏時 fallback 用 baseline（不噴錯）', () => {
    const firings: Record<string, SignalFiringRecord> = {
      A: { drawTerm: 1, drawDate: '', picks: [3] }
    }
    const ranked = rankNumbersForNextDraw(firings, {}, 'lotto539')
    assert.equal(ranked.length, 1)
    // 完全沒成績單 → smoothedHitRate = baseline
    assert.equal(ranked[0]!.score, baselineHitRate('lotto539'))
  })
})
