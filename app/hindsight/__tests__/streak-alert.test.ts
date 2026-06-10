import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import { createInitialState } from '../../utils/analysis'
import { streakAlertSignal } from '../signals/bingo-streak-alert'
import type { BrainDraw, SignalEvalParams } from '../types'

function mkParams(gameId: GameId, history: BrainDraw[]): SignalEvalParams {
  return {
    gameId,
    history,
    analysisState: createInitialState(gameId, 60),
    todayDate: '2026-06-09'
  }
}

function bingoDraw(term: number, nums: number[]): BrainDraw {
  return { drawTerm: term, drawDate: '2026-06-09', numbers: [...nums].sort((a, b) => a - b) }
}

describe('signal: streak_alert (bingo)', () => {
  it('連續 2 期 overlap < 5 → fires=true、推本期新號', () => {
    // N-2 = 1..20, N-1 跟 N-2 重 4 顆 (1..4)、N 跟 N-1 重 3 顆
    const N2 = bingoDraw(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    const N1 = bingoDraw(2, [1, 2, 3, 4, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])
    const N = bingoDraw(3, [1, 2, 3, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57])
    const out = streakAlertSignal.evaluate(mkParams('bingo_bingo', [N2, N1, N]))
    assert.equal(out.fires, true)
    // 本期新號 = N \ N1 = [41..57]
    assert.deepEqual(out.picks, [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57])
    assert.equal(out.conditionMetButEmpty, true)
  })

  it('其中一個 transition overlap >= 5 → fires=false', () => {
    const N2 = bingoDraw(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    const N1 = bingoDraw(2, [1, 2, 3, 4, 5, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]) // overlap 5
    const N = bingoDraw(3, [1, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59])
    const out = streakAlertSignal.evaluate(mkParams('bingo_bingo', [N2, N1, N]))
    assert.equal(out.fires, false)
    assert.deepEqual(out.picks, [])
  })

  it('history < 3 → fires=false', () => {
    const out = streakAlertSignal.evaluate(mkParams('bingo_bingo', []))
    assert.equal(out.fires, false)
  })

  it('非賓果 → 永遠不亮', () => {
    const N2 = bingoDraw(1, [1, 2, 3, 4, 5])
    const N1 = bingoDraw(2, [6, 7, 8, 9, 10])
    const N = bingoDraw(3, [11, 12, 13, 14, 15])
    const out = streakAlertSignal.evaluate(mkParams('lotto539', [N2, N1, N]))
    assert.equal(out.fires, false)
  })
})
