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
    v: 4,
    gameId,
    n: periods.length,
    lastProcessedTerm: null,
    periods,
    history
  }
  return { gameId, history: [], analysisState, todayDate: '2026-06-09' }
}

describe('signal: cold_number', () => {
  it('連續 2 期所有位置都 < 10 + 有 slot 最左值 > 10 → 亮燈、推冷號', () => {
    // 兩期所有位置都 < 10
    const valuesRows = [
      '8,5,3,2,9',
      '4,7,1,6,2'
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

  it('某期僅一個位置 ≥ 10（其餘 < 10）→ 該期不合格、不亮（2026-06-11 拍板「全部」）', () => {
    // 最新一期含 15 → 該期 rowQualifies=false → 鏈長 = 0 < 2
    const valuesRows = [
      '8,5,3,2,9',
      '4,15,1,6,2'
    ]
    const periods: AnalysisPeriod[] = [
      slot(0, '15,5,6', [22])
    ]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, false)
  })

  it('其中一期所有位置皆 ≥ 10 → 不亮', () => {
    const valuesRows = [
      '15,12,11,18,20', // 全部 ≥ 10，不合格
      '13,15,14,9,21' // 含 9 < 10、但其他 ≥ 10 → 仍不合格
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

  it('鏈在達成 2 期後仍可繼續延伸成 3 期', () => {
    // 三期皆全 < 10
    const valuesRows = [
      '8,5,3,2,9',
      '4,7,1,6,2',
      '3,8,5,1,9'
    ]
    const periods: AnalysisPeriod[] = [slot(0, '11,2,3', [7])]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [7])
    // label 應顯示連續 3 期
    assert.match(out.emptyGroupLabels?.[0] ?? '', /連續 3 期/)
  })

  it('連續 2 期合格但中段第 3 期含 ≥ 10 → 最新鏈長 = 2 仍亮（鏈往回掃斷在中段）', () => {
    // 期序由舊到新：第 1 期含 15 → 不合格；第 2、3 期全 < 10 → 從最新往回掃連續 2 期合格
    const valuesRows = [
      '15,2,3,4,5',
      '8,5,3,2,9',
      '4,7,1,6,2'
    ]
    const periods: AnalysisPeriod[] = [slot(0, '11,2,3', [7])]
    const out = coldNumberSignal.evaluate(mkParams('lotto539', valuesRows, periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [7])
  })
})
