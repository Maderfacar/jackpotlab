import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import type { AnalysisPeriod, AnalysisState, HistoryEntry } from '../../utils/analysis'
import { coldNumberSignal } from '../signals/cold-number'
import type { SignalEvalParams } from '../types'

function slot(period: number, record: string, prizes: number[] = []): AnalysisPeriod {
  return {
    period,
    issue: '',
    date: '',
    dateDay: null,
    prizes,
    record,
    hasEverMatched: false
  }
}

function mkParams(
  gameId: GameId,
  valuesRows: string[],
  periods: AnalysisPeriod[]
): SignalEvalParams {
  // valuesRows: 由舊到新（最新放最後）
  const history: HistoryEntry[] = valuesRows.map((vs, i) => ({
    issue: String(i + 1),
    date: '2026-06-01',
    prizes: '',
    tails: [],
    values: vs
  }))
  const analysisState: AnalysisState = {
    v: 3,
    gameId,
    n: periods.length,
    lastProcessedTerm: null,
    periods,
    history
  }
  return { gameId, history: [], analysisState, todayDate: '2026-06-09' }
}

describe('signal: cold_number', () => {
  it('某位置連續 2 期 < 10 + 有 slot 最左值 > 10 → 亮燈、推冷號', () => {
    // values 位置 0 連續 2 期 < 10：兩期都是 3, 5
    const valuesRows = [
      '8,12,5,8,20',
      '3,12,5,8,20',
      '5,11,4,9,21'
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, '0,1,2'),
      slot(1, '11,2,3', [7, 18]), // leftVal=11 > 10 → 推
      slot(2, '15,5,6', [22]) // leftVal=15 > 10 → 推
    ]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [7, 18, 22])
    assert.equal(out.pickGroups?.length, 2)
  })

  it('觸發條件不成立（沒有任何位置連續 2 期 < 10）→ 不亮', () => {
    const valuesRows = [
      '15,12,11,18,20',
      '13,15,14,19,21'
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, '15,5,6', [22])
    ]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, false)
  })

  it('觸發成立、但所有 slot 最左值 ≤ 10 → fires=false', () => {
    const valuesRows = [
      '3,8,5,8,9',
      '5,4,6,9,7'
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, '5,1,2', [11]),
      slot(1, '10,2,3', [22]) // leftVal=10，嚴格 > 10 不成立
    ]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, false)
  })

  it('賓果不適用 → 永遠不亮', () => {
    const valuesRows = [
      '3,5,7,8,9',
      '2,4,6,8,9'
    ]
    const periods: AnalysisPeriod[] = [slot(0, '15,2,3', [22])]
    const out = coldNumberSignal.evaluate(mkParams('bingo_bingo', valuesRows, periods))
    assert.equal(out.fires, false)
  })

  it('history < 2 期 → 不亮', () => {
    const out = coldNumberSignal.evaluate(mkParams('lotto539', ['3,5,7,8,9'], [slot(0, '15,2', [22])]))
    assert.equal(out.fires, false)
  })

  it('位置鎖定：相同位置 2 期都 < 10 才算（其他位置雜訊不算）', () => {
    // 位置 0：8, 12（第二期不 < 10）；位置 2：5, 4（兩期都 < 10 → 觸發）
    const valuesRows = [
      '8,15,5,11,20',
      '12,16,4,12,21'
    ]
    const periods: AnalysisPeriod[] = [slot(0, '11,2,3', [7])]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [7])
  })
})
