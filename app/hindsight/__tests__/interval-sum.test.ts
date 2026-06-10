import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import type { AnalysisState, HistoryEntry } from '../../utils/analysis'
import { intervalSumSignal } from '../signals/interval-sum'
import type { SignalEvalParams } from '../types'

function mkParams(gameId: GameId, sums: Array<number | ''>): SignalEvalParams {
  const history: HistoryEntry[] = sums.map((s, i) => ({
    issue: String(i + 1),
    date: '2026-06-01',
    prizes: '',
    tails: [],
    sum: s
  }))
  const analysisState: AnalysisState = {
    v: 4,
    gameId,
    n: 1,
    lastProcessedTerm: null,
    periods: [],
    history
  }
  return { gameId, history: [], analysisState, todayDate: '2026-06-09' }
}

describe('signal: interval_sum', () => {
  it('連續變大 ≥ 2 transitions → 亮燈、emptyGroupLabels 顯示鏈', () => {
    const out = intervalSumSignal.evaluate(mkParams('lotto539', [100, 110, 120, 130]))
    assert.equal(out.fires, true) // 觀察型亮燈 → fires=true 累積 totalFires
    assert.deepEqual(out.picks, [])
    assert.equal(out.conditionMetButEmpty, true)
    const label = out.emptyGroupLabels?.[0] ?? ''
    assert.match(label, /已連續變大 3 期/)
    assert.match(label, /100→110→120→130/)
  })

  it('連續變小 ≥ 2 transitions → 亮燈、變小', () => {
    const out = intervalSumSignal.evaluate(mkParams('lotto539', [200, 190, 180]))
    assert.equal(out.fires, true)
    assert.equal(out.conditionMetButEmpty, true)
    const label = out.emptyGroupLabels?.[0] ?? ''
    assert.match(label, /已連續變小 2 期/)
    assert.match(label, /200→190→180/)
  })

  it('只有 1 transition（方向改變）→ 不亮', () => {
    // 100 → 110 → 105：第二個 transition 反向，從尾端鏈長 = 1
    const out = intervalSumSignal.evaluate(mkParams('lotto539', [100, 110, 105]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('資料不足（< 3 期）→ 不亮', () => {
    const out = intervalSumSignal.evaluate(mkParams('lotto539', [100, 110]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('賓果不適用 → 永遠不亮', () => {
    const out = intervalSumSignal.evaluate(mkParams('bingo_bingo', [100, 110, 120, 130]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('包含 sum=空字串 → 忽略空值繼續抓有效 sum', () => {
    const out = intervalSumSignal.evaluate(mkParams('lotto539', ['', 100, 110, 120]))
    assert.equal(out.fires, true)
    assert.equal(out.conditionMetButEmpty, true)
    const label = out.emptyGroupLabels?.[0] ?? ''
    assert.match(label, /已連續變大 2 期/)
  })

  it('最末兩值相等 → 不亮（無方向）', () => {
    const out = intervalSumSignal.evaluate(mkParams('lotto539', [100, 110, 110]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })
})
