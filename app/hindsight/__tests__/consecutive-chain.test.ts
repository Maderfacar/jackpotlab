import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import { createInitialState } from '../../utils/analysis'
import { consecutiveChainSignal } from '../signals/consecutive-chain'
import type { BrainDraw, SignalEvalParams } from '../types'

function mkParams(gameId: GameId, history: BrainDraw[]): SignalEvalParams {
  return {
    gameId,
    history,
    analysisState: createInitialState(gameId, 60),
    todayDate: '2026-06-09'
  }
}

describe('signal: consecutive_chain', () => {
  it('上升鏈成立 → fires=true、picks 是延續號（+1）', () => {
    // N-2: [10, ...]、N-1: [11, ...]、N: [12, ...] → 鏈 [10,11,12]、下一個推 13
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [10, 20, 21, 30, 35] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [11, 22, 23, 33, 37] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [12, 24, 25, 34, 38] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [13])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '上升鏈 (+1)', numbers: [13] })
  })

  it('下降鏈成立 → fires=true、picks 是延續號（-1）', () => {
    // N-2: [30, ...]、N-1: [29, ...]、N: [28, ...] → 鏈 [30,29,28]、下一個推 27
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [30, 5, 6, 7, 8] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [29, 10, 11, 12, 13] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [28, 15, 16, 17, 18] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [27])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '下降鏈 (-1)', numbers: [27] })
  })

  it('沒有任何鏈 → fires=false、picks=[]', () => {
    // 三期都沒有 +1 或 -1 連接
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [1, 5, 10, 20, 35] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [3, 8, 15, 25, 37] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [7, 13, 18, 29, 39] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('邊界：history < 3 期 → fires=false', () => {
    const history2: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [10, 20, 30, 35, 38] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [11, 21, 31, 35, 39] }
    ]
    const out2 = consecutiveChainSignal.evaluate(mkParams('lotto539', history2))
    assert.equal(out2.fires, false)
    assert.deepEqual(out2.picks, [])

    const out0 = consecutiveChainSignal.evaluate(mkParams('lotto539', []))
    assert.equal(out0.fires, false)
    assert.deepEqual(out0.picks, [])
  })

  it('邊界：上升鏈延續超出範圍 → 過濾掉', () => {
    // 539 範圍 1-39。N-2 含 37、N-1 含 38、N 含 39 → 延續推 40 超出 → 過濾掉
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [37, 10, 11, 12, 13] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [38, 15, 16, 17, 18] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [39, 20, 21, 22, 23] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('上升鏈與下降鏈可並存', () => {
    // 上升: 5→6→7 推 8；下降: 30→29→28 推 27
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [5, 30, 12, 15, 35] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [6, 29, 14, 17, 37] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [7, 28, 16, 19, 38] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [8, 27])
    assert.equal(out.pickGroups?.length, 2)
    assert.deepEqual(out.pickGroups?.[0], { label: '上升鏈 (+1)', numbers: [8] })
    assert.deepEqual(out.pickGroups?.[1], { label: '下降鏈 (-1)', numbers: [27] })
  })

  it('N-1→N 有連續對但 N-2→N-1 接不上 → 不成鏈', () => {
    // N-1: [11,...]、N: [12,...] → ascPairsN 有 {11→12}
    // 但 N-2 完全沒有 10（也沒有別的可接到 N-1 的數）→ 鏈接不上
    // 為避免意外形成鏈，N-2 全部選與 N-1/N 完全錯開的數
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [3, 4, 7, 8, 9] }, // 完全孤立
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [11, 20, 25, 30, 35] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [12, 22, 27, 32, 37] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })
})
