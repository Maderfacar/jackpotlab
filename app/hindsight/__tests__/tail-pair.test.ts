import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import { createInitialState } from '../../utils/analysis'
import { tailPairSignal } from '../signals/tail-pair'
import type { BrainDraw, SignalEvalParams } from '../types'

function mkParams(gameId: GameId, history: BrainDraw[]): SignalEvalParams {
  return {
    gameId,
    history,
    analysisState: createInitialState(gameId, 60),
    todayDate: '2026-06-09'
  }
}

describe('signal: tail_pair', () => {
  it('最新一期有同尾 → 亮燈，並顯示同尾號清單與歷史紀錄', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [3, 11, 21, 28, 35] }, // 11,21 同尾 1
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [11, 5, 9, 14, 36] }, // 連莊（11 同號）
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [13, 23, 7, 28, 38] } // 13,23 同尾 3 — 最新
    ]
    const out = tailPairSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true) // 觀察型亮燈
    assert.deepEqual(out.picks, [])
    assert.equal(out.conditionMetButEmpty, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    assert.match(txt, /本期同尾號：13, 23/)
    assert.match(txt, /歷史紀錄/)
  })

  it('最新一期無同尾 → 不亮', () => {
    // 尾數全異：4,5,7,8,9
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [11, 21, 3, 28, 35] },
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [4, 5, 17, 18, 29] }
    ]
    const out = tailPairSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('不連莊同尾分類：next 有同尾、但號碼完全不同於 curr 的同尾號', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [11, 21, 3, 28, 35] }, // 同尾 1: {11, 21}
      { drawTerm: 2, drawDate: '2026-06-02', numbers: [13, 23, 5, 9, 36] }, // 同尾 3: {13, 23}，無 11/21 → 不連莊
      { drawTerm: 3, drawDate: '2026-06-03', numbers: [14, 24, 5, 9, 37] } // 最新有同尾，觸發亮燈
    ]
    const out = tailPairSignal.evaluate(mkParams('lotto539', history))
    assert.equal(out.fires, true)
    assert.equal(out.conditionMetButEmpty, true)
    const txt = (out.emptyGroupLabels ?? []).join(' | ')
    // history[0]→[1] 不連莊；history[1]→[2] 也不連莊（{13,23} vs {14,24}）→ 共 2 次
    assert.match(txt, /不連莊同尾 2 次/)
    assert.match(txt, /連莊同尾 0 次/)
  })

  it('賓果不適用 → 永遠不亮', () => {
    const history: BrainDraw[] = [
      { drawTerm: 1, drawDate: '2026-06-01', numbers: [13, 23, 33, 43, 53] }
    ]
    const out = tailPairSignal.evaluate(mkParams('bingo_bingo', history))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })

  it('history 為空 → 不亮', () => {
    const out = tailPairSignal.evaluate(mkParams('lotto539', []))
    assert.equal(out.fires, false)
    assert.equal(out.conditionMetButEmpty, undefined)
  })
})
