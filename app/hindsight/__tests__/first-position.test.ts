import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import type { AnalysisPeriod, AnalysisState } from '../../utils/analysis'
import { firstPositionSignal } from '../signals/first-position'
import type { BrainDraw, SignalEvalParams } from '../types'

function slot(period: number, prizes: number[]): AnalysisPeriod {
  return {
    period,
    issue: '',
    date: '',
    dateDay: null,
    prizes,
    record: '',
    hasEverMatched: false
  }
}

function mkParams(
  gameId: GameId,
  history: BrainDraw[],
  periods: AnalysisPeriod[]
): SignalEvalParams {
  const analysisState: AnalysisState = {
    v: 4,
    gameId,
    n: periods.length,
    lastProcessedTerm: null,
    periods,
    history: []
  }
  return { gameId, history, analysisState, todayDate: '2026-06-09' }
}

describe('signal: first_position (bingo)', () => {
  it('正常案例：最新 + 隔期 1-3 共 4 個 first', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-08', numbers: [40, 41, 42] },
      { drawTerm: 2, drawDate: '2026-06-09', numbers: [10, 20, 30] }
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, [10, 20, 30]),
      slot(1, [15, 25, 35]),
      slot(2, [5, 50, 60]),
      slot(3, [12, 22, 32])
    ]
    const out = firstPositionSignal.evaluate(mkParams('bingo_bingo', history, periods))
    assert.equal(out.fires, true)
    // 最新 first=10（不在 history[-2]=[40,41,42] → 保留），slot[1].prizes[0]=15、slot[2]=5、slot[3]=12
    assert.deepEqual(out.picks, [5, 10, 12, 15])
  })

  it('最新 first 連莊 → 扣除', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-08', numbers: [10, 41, 42] }, // 含 10
      { drawTerm: 2, drawDate: '2026-06-09', numbers: [10, 20, 30] }
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, [10, 20, 30]),
      slot(1, [15, 25, 35]),
      slot(2, [5, 50, 60]),
      slot(3, [12, 22, 32])
    ]
    const out = firstPositionSignal.evaluate(mkParams('bingo_bingo', history, periods))
    assert.equal(out.fires, true)
    // 10 因連莊被扣除，剩 [5, 12, 15]
    assert.deepEqual(out.picks, [5, 12, 15])
  })

  it('部分隔期 slot 空 → 跳過', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-08', numbers: [40, 41, 42] },
      { drawTerm: 2, drawDate: '2026-06-09', numbers: [10, 20, 30] }
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, [10, 20, 30]),
      slot(1, []), // 空
      slot(2, [5, 50, 60]),
      slot(3, []) // 空
    ]
    const out = firstPositionSignal.evaluate(mkParams('bingo_bingo', history, periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [5, 10])
  })

  it('非賓果 → 永遠不亮', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-09', numbers: [10, 20, 30] }
    ]
    const periods: AnalysisPeriod[] = [slot(0, [10]), slot(1, [15]), slot(2, [5]), slot(3, [12])]
    const out = firstPositionSignal.evaluate(mkParams('lotto539', history, periods))
    assert.equal(out.fires, false)
  })

  it('history 空 → 不亮', () => {
    const periods: AnalysisPeriod[] = [slot(0, []), slot(1, []), slot(2, []), slot(3, [])]
    const out = firstPositionSignal.evaluate(mkParams('bingo_bingo', [], periods))
    assert.equal(out.fires, false)
  })
})
