import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import type { AnalysisState, HistoryEntry } from '../../utils/analysis'
import { positionDistributionSignal } from '../signals/position-distribution'
import type { SignalEvalParams } from '../types'

function mkParams(gameId: GameId, positionsRows: string[]): SignalEvalParams {
  const history: HistoryEntry[] = positionsRows.map((p, i) => ({
    issue: String(i + 1),
    date: '2026-06-01',
    prizes: '',
    tails: [],
    positions: p
  }))
  const analysisState: AnalysisState = {
    v: 3,
    gameId,
    n: 1,
    lastProcessedTerm: null,
    periods: [],
    history
  }
  return { gameId, history: [], analysisState, todayDate: '2026-06-09' }
}

describe('signal: position_distribution', () => {
  it('有 positions → 亮燈、顯示本期 y 與近期分佈', () => {
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', [
      '5-1,4-3,3-2,2-1,1-1',
      '5-2,4-1,3-3,2-2,1-1'
    ]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    assert.match(txt, /本期 y 組成：\[2, 1, 3, 2, 1\]/)
    assert.match(txt, /近 2 期分佈/)
    // row1 ys=[1,3,2,1,1]、row2 ys=[2,1,3,2,1] → 累積 y=1:5 / y=2:3 / y=3:2
    assert.match(txt, /y=1:5/)
    assert.match(txt, /y=2:3/)
    assert.match(txt, /y=3:2/)
  })

  it('positions 為空 → 不亮', () => {
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', ['']))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('history 為空 → 不亮', () => {
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', []))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('賓果不適用 → 永遠不亮', () => {
    const out = positionDistributionSignal.evaluate(mkParams('bingo_bingo', [
      '5-1,4-3,3-2,2-1,1-1'
    ]))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })
})
