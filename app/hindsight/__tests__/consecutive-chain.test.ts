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
  it('上升對成立 → fires=true、推延續號 (+1)', () => {
    // 唯一 +1 對：11→12 → 推 13。其餘號碼間距 ≥ 2 不形成額外配對
    const history: BrainDraw[] = [
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [11, 5, 18, 28, 35] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [12, 7, 20, 22, 26] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [13])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '上升鏈 (+1)', numbers: [13] })
  })

  it('下降對成立 → fires=true、推延續號 (-1)', () => {
    // 唯一 -1 對：29→28 → 推 27
    const history: BrainDraw[] = [
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [29, 5, 18, 22, 33] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [28, 7, 11, 20, 25] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [27])
    assert.equal(out.pickGroups?.length, 1)
    assert.deepEqual(out.pickGroups?.[0], { label: '下降鏈 (-1)', numbers: [27] })
  })

  it('沒有任何連續對 → fires=false、picks=[]', () => {
    // 兩期所有號碼距離 ≥ 2 → 沒有 ±1 配對
    const history: BrainDraw[] = [
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [3, 10, 17, 24, 31] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [5, 13, 19, 27, 35] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('邊界：history < 2 期 → fires=false', () => {
    const out1 = consecutiveChainSignal.evaluate(mkParams('lotto539', [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [10, 20, 30, 35, 38] }
    ]))
    assert.equal(out1.fires, false)
    assert.deepEqual(out1.picks, [])

    const out0 = consecutiveChainSignal.evaluate(mkParams('lotto539', []))
    assert.equal(out0.fires, false)
    assert.deepEqual(out0.picks, [])
  })

  it('邊界：延續超出彩種範圍 → 過濾掉', () => {
    // 唯一 +1 對：38→39 → 延續推 40 超出 539 範圍 1-39 → 過濾
    const history: BrainDraw[] = [
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [38, 5, 11, 22, 25] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [39, 7, 14, 20, 28] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('appliesTo 不含 bingo_bingo（2026-06-11 拍板移除）', () => {
    // 訊號 3 不適用賓果。bingo_bingo 不應在 appliesTo 內。
    assert.equal(consecutiveChainSignal.appliesTo.includes('bingo_bingo'), false)
    assert.equal(consecutiveChainSignal.appliesTo.includes('lotto539'), true)
    assert.equal(consecutiveChainSignal.appliesTo.includes('lotto649'), true)
    assert.equal(consecutiveChainSignal.appliesTo.includes('super_lotto638'), true)
  })

  it('上升與下降可並存', () => {
    // +1: 6→7 推 8；-1: 29→28 推 27
    const history: BrainDraw[] = [
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [6, 10, 19, 29, 33] },
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [3, 7, 15, 21, 28] }
    ]
    const out = consecutiveChainSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.deepEqual(out.picks, [8, 27])
    assert.equal(out.pickGroups?.length, 2)
    assert.deepEqual(out.pickGroups?.[0], { label: '上升鏈 (+1)', numbers: [8] })
    assert.deepEqual(out.pickGroups?.[1], { label: '下降鏈 (-1)', numbers: [27] })
  })
})
