import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import type { AnalysisState, HistoryEntry } from '../../utils/analysis'
import { positionDistributionSignal } from '../signals/position-distribution'
import type { SignalEvalParams } from '../types'

function mkParams(gameId: GameId, positionsRows: string[], n = 60): SignalEvalParams {
  const history: HistoryEntry[] = positionsRows.map((p, i) => ({
    issue: String(i + 1),
    date: '2026-06-01',
    prizes: '',
    tails: [],
    positions: p
  }))
  const analysisState: AnalysisState = {
    v: 4,
    gameId,
    n,
    lastProcessedTerm: null,
    periods: [],
    history
  }
  return { gameId, history: [], analysisState, todayDate: '2026-06-09' }
}

describe('signal: position_distribution', () => {
  it('有 positions → 亮燈、顯示本期 y 與近期分佈、observationData 提供 latestYs', () => {
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', [
      '5-1,4-3,3-2,2-1,1-1',
      '5-2,4-1,3-3,2-2,1-1'
    ], 60))
    assert.equal(out.fires, true) // 觀察型亮燈
    assert.deepEqual(out.picks, [])
    assert.equal(out.conditionMetButEmpty, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    assert.match(txt, /本期 y 組成：\[2, 1, 3, 2, 1\]/)
    assert.match(txt, /近 2 期分佈/)
    // row1 ys=[1,3,2,1,1]、row2 ys=[2,1,3,2,1] → 累積 y=1:5 / y=2:3 / y=3:2
    assert.match(txt, /y=1:5/)
    assert.match(txt, /y=2:3/)
    assert.match(txt, /y=3:2/)
    // 2026-06-11 拍板：observationData.latestYs 結構化資料供 UI 染色
    assert.deepEqual(out.observationData?.latestYs, [2, 1, 3, 2, 1])
  })

  it('觀察窗用 analysisState.n（2026-06-11 拍板：從固定 30 改成 N）', () => {
    // 送 5 期歷史、n=3 → 只看最新 3 期
    const positionsRows = [
      '5-1,4-1,3-1,2-1,1-1', // ys=[1,1,1,1,1]：n=3 視窗外
      '5-2,4-2,3-2,2-2,1-2', // ys=[2,2,2,2,2]：n=3 視窗外
      '5-1,4-1,3-1,2-1,1-1', // 視窗內
      '5-2,4-2,3-2,2-2,1-2', // 視窗內
      '5-3,4-3,3-3,2-3,1-3' // 視窗內 + 最新
    ]
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', positionsRows, 3))
    assert.equal(out.fires, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    // 視窗只含最後 3 期：y=1 各 5 顆、y=2 各 5 顆、y=3 各 5 顆 → y=1:5 / y=2:5 / y=3:5
    assert.match(txt, /近 3 期分佈/)
    assert.match(txt, /y=1:5/)
    assert.match(txt, /y=2:5/)
    assert.match(txt, /y=3:5/)
    assert.deepEqual(out.observationData?.latestYs, [3, 3, 3, 3, 3])
  })

  it('history 長度 < n → 視窗以實際長度為準', () => {
    const out = positionDistributionSignal.evaluate(mkParams('lotto539', [
      '5-1,4-3,3-2,2-1,1-1'
    ], 60))
    assert.equal(out.fires, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    assert.match(txt, /近 1 期分佈/)
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
