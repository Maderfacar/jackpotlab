import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { AnalysisPeriod, AnalysisState } from '../../utils/analysis'
import { intervalMeanSignal } from '../signals/interval-mean'
import type { BrainDraw, SignalEvalParams } from '../types'

function emptySlot(period: number): AnalysisPeriod {
  return {
    period,
    issue: '',
    date: '',
    dateDay: null,
    prizes: [],
    record: '',
    hasEverMatched: false
  }
}

function state(periods: AnalysisPeriod[]): AnalysisState {
  return {
    v: 4,
    gameId: 'lotto539',
    n: periods.length,
    lastProcessedTerm: null,
    periods,
    history: []
  }
}

function params(periods: AnalysisPeriod[], history: BrainDraw[] = []): SignalEvalParams {
  return {
    gameId: 'lotto539',
    history,
    analysisState: state(periods),
    todayDate: '2026-06-09'
  }
}

describe('signal: interval_mean', () => {
  it('條件成立且有 prizes → fires=true、picks 正確、pickGroups 按 slot 分組', () => {
    // slot 0: record='5,3,2,1' → latest=5、mean=2.75 → 5>=2.75 條件成立、prizes=[10,15]
    // slot 1: record='1,3,5,7' → latest=1、mean=4 → 1<4 條件不成立
    // slot 2: record='4,2,4,2' → latest=4、mean=3 → 4>=3 條件成立、prizes=[20]
    const periods: AnalysisPeriod[] = [
      { ...emptySlot(0), record: '5,3,2,1', prizes: [10, 15] },
      { ...emptySlot(1), record: '1,3,5,7', prizes: [20, 25] },
      { ...emptySlot(2), record: '4,2,4,2', prizes: [20] }
    ]
    const out = intervalMeanSignal.evaluate(params(periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [10, 15, 20])
    assert.equal(out.pickGroups?.length, 2)
    assert.deepEqual(out.pickGroups?.[0], { label: '隔期 0', numbers: [10, 15] })
    assert.deepEqual(out.pickGroups?.[1], { label: '隔期 2', numbers: [20] })
    assert.ok(!out.conditionMetButEmpty)
  })

  it('沒有任何 slot 條件成立 → fires=false、picks=[]', () => {
    const periods: AnalysisPeriod[] = [
      { ...emptySlot(0), record: '1,5,5,5', prizes: [10] }, // latest=1、mean=4 → no
      { ...emptySlot(1), record: '0,4,8', prizes: [20] } // latest=0、mean=4 → no
    ]
    const out = intervalMeanSignal.evaluate(params(periods))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
    assert.ok(!out.pickGroups || out.pickGroups.length === 0)
    assert.ok(!out.conditionMetButEmpty)
  })

  it('邊界：所有條件成立 slot 都空 prizes → fires=false、conditionMetButEmpty=true、emptyGroupLabels 正確', () => {
    const periods: AnalysisPeriod[] = [
      { ...emptySlot(3), record: '5,3,2,1', prizes: [] }, // 條件成立但空
      { ...emptySlot(5), record: '4,2,4,2', prizes: [] } // 條件成立但空
    ]
    const out = intervalMeanSignal.evaluate(params(periods))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
    assert.equal(out.conditionMetButEmpty, true)
    assert.deepEqual(out.emptyGroupLabels, ['隔期 3', '隔期 5'])
  })

  it('邊界：>= 不是嚴格大於（latest == mean 也成立）', () => {
    // record='2,2,2,2' → latest=2、mean=2 → 2>=2 成立
    const periods: AnalysisPeriod[] = [
      { ...emptySlot(0), record: '2,2,2,2', prizes: [33] }
    ]
    const out = intervalMeanSignal.evaluate(params(periods))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [33])
  })

  it('record 為空字串的 slot 跳過、跨組去重後 picks 升序', () => {
    const periods: AnalysisPeriod[] = [
      { ...emptySlot(0), record: '', prizes: [99] }, // record 空 → 跳過
      { ...emptySlot(1), record: '5,1', prizes: [7, 12] }, // 5>=3 成立
      { ...emptySlot(2), record: '4,2', prizes: [12, 3] } // 4>=3 成立
    ]
    const out = intervalMeanSignal.evaluate(params(periods))
    assert.equal(out.fires, true)
    // 12 出現在兩組，最終 picks 去重升序
    assert.deepEqual(out.picks, [3, 7, 12])
    assert.equal(out.pickGroups?.length, 2)
  })
})
