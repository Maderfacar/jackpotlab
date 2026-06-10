import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { replayHistory } from '../replay'
import type { BrainDraw, SignalDef } from '../types'

describe('replay.replayHistory', () => {
  it('嚴禁偷看未來：signal.evaluate 只看到 T 之前的歷史', () => {
    const drawsAsc: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [1, 2, 3, 4, 5] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [6, 7, 8, 9, 10] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [11, 12, 13, 14, 15] },
      { drawTerm: 4, drawDate: '2026-06-04', numbers: [16, 17, 18, 19, 20] }
    ]

    const seen: Array<{ predictingTerm: number, historyTerms: number[] }> = []

    const spy: SignalDef = {
      id: 'spy',
      nameZh: 'spy',
      description: '',
      appliesTo: ['all'],
      evaluate: ({ history }) => {
        // 不要在這裡讀任何「未來」資訊；只記錄 evaluate 那一刻看得到什麼
        seen.push({
          predictingTerm: -1, // 由外面對照
          historyTerms: history.map(d => d.drawTerm)
        })
        return { fires: false, picks: [] }
      }
    }

    replayHistory('lotto539', drawsAsc, [spy])

    // 對 4 期就 evaluate 4 次
    assert.equal(seen.length, 4)
    // T=1 時 history 是空、T=2 時 history=[1]、T=3 時 history=[1,2]、T=4 時 history=[1,2,3]
    assert.deepEqual(seen[0]!.historyTerms, [])
    assert.deepEqual(seen[1]!.historyTerms, [1])
    assert.deepEqual(seen[2]!.historyTerms, [1, 2])
    assert.deepEqual(seen[3]!.historyTerms, [1, 2, 3])
  })

  it('fires=true 才計入 scorecard、conditionMetButEmpty 不計', () => {
    const drawsAsc: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [1, 2, 3, 4, 5] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [6, 7, 8, 9, 10] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [1, 11, 12, 13, 14] }
    ]

    // 每次都「條件成立但 picks 空」→ replay 不該計入
    const phantomSignal: SignalDef = {
      id: 'phantom',
      nameZh: 'phantom',
      description: '',
      appliesTo: ['all'],
      evaluate: () => ({
        fires: false,
        picks: [],
        conditionMetButEmpty: true,
        emptyGroupLabels: ['somewhere']
      })
    }

    // 永遠推 [1]，T=3 命中
    const constSignal: SignalDef = {
      id: 'const1',
      nameZh: 'const1',
      description: '',
      appliesTo: ['all'],
      evaluate: ({ history }) => {
        if (history.length === 0) return { fires: false, picks: [] }
        return { fires: true, picks: [1] }
      }
    }

    const state = replayHistory('lotto539', drawsAsc, [phantomSignal, constSignal])

    // phantom 0 fires
    assert.equal(state.scorecards.phantom?.totalFires, 0)
    assert.equal(state.scorecards.phantom?.totalHits, 0)

    // const1: T=2 firing predicting T=2 (history=[T1]) → 預測 [1]、T=2 開 [6,7,8,9,10] → 0 hit
    //         T=3 firing predicting T=3 (history=[T1,T2]) → 預測 [1]、T=3 開 [1,...] → 1 hit
    // 注意 T=1 history 空，evaluate 沒 fire
    assert.equal(state.scorecards.const1?.totalFires, 2)
    assert.equal(state.scorecards.const1?.totalPicks, 2)
    assert.equal(state.scorecards.const1?.totalHits, 1)
    assert.deepEqual(state.scorecards.const1?.firingTerms, [2, 3])
  })

  it('replay 沒訊號時也不崩，回基本 BrainState', () => {
    const state = replayHistory('lotto539', [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [1, 2, 3, 4, 5] }
    ], [])
    assert.equal(state.v, 3)
    assert.equal(state.gameId, 'lotto539')
    assert.equal(state.lastProcessedTerm, 1)
    assert.deepEqual(state.scorecards, {})
    assert.deepEqual(state.alerts, [])
  })
})
