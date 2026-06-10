/**
 * 「獎號關聯：位置」x-y 計算回歸測試。
 *
 * Bug 描述：同一期撈中多顆且都落在同一個 slot 時，第 2 顆以後的 `x`（原始剩餘數）
 *   會被本批已撈中的號扣減，連帶 `y` 也跑掉。
 *   例：slot prizes = [01,02,03,04,05]，新獎號含 04 與 05：
 *     04 應該回 5-4、05 應該回 5-5；
 *     bug 版本會回 04 = 5-4、05 = 4-4。
 *
 * 修法：用 row.prizes 原始陣列計算 x 與 y，不受本批已被 filter 出去的影響。
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { createInitialState, processDraw, type AnalysisDrawInput } from '../analysis'

describe('analysis: 獎號關聯位置 x-y', () => {
  it('同期撈中同 slot 多顆：x 用原始剩餘數，y 用原始序位', () => {
    // 步驟：先灌一期讓 slot 0 持有 [01,02,03,04,05]，再開下一期 [04,05,10,20,30] 撈中 04、05
    let state = createInitialState('lotto539', 60)
    const initial: AnalysisDrawInput = {
      drawTerm: 1,
      drawDate: '2026-06-01',
      prizes: [1, 2, 3, 4, 5]
    }
    state = processDraw(state, initial)

    const next: AnalysisDrawInput = {
      drawTerm: 2,
      drawDate: '2026-06-02',
      prizes: [4, 5, 10, 20, 30]
    }
    state = processDraw(state, next)

    const latest = state.history[state.history.length - 1]!
    const positions = (latest.positions ?? '').split(',')
    // newPrizes 進 processDraw 前會 sort 升序：[4, 5, 10, 20, 30]
    // 04 與 05 落在原 slot 0（5 顆 prizes [1..5]）；10, 20, 30 找不到任何 slot → ''
    const [p04, p05, p10, p20, p30] = positions
    assert.equal(p04, '5-4', '04 應為 5-4（原 5 顆裡的第 4 位）')
    assert.equal(p05, '5-5', '05 應為 5-5（原 5 顆裡的第 5 位）—— bug 版本會錯成 4-4')
    assert.equal(p10, '', '10 不在任何 slot 內')
    assert.equal(p20, '')
    assert.equal(p30, '')
  })

  it('同期撈中同 slot 兩顆且不相鄰：x 與 y 仍照原始序位', () => {
    // slot 0 = [10, 20, 30, 40, 50]，撈中 10 與 30
    let state = createInitialState('lotto539', 60)
    state = processDraw(state, { drawTerm: 1, drawDate: '2026-06-01', prizes: [10, 20, 30, 40, 50] })
    state = processDraw(state, { drawTerm: 2, drawDate: '2026-06-02', prizes: [10, 30, 7, 22, 28] })

    const latest = state.history[state.history.length - 1]!
    const positions = (latest.positions ?? '').split(',')
    // sort 後 newPrizes = [7, 10, 22, 28, 30]
    const [p07, p10, p22, p28, p30] = positions
    assert.equal(p07, '')
    assert.equal(p10, '5-1', '10 為原始 5 顆裡的第 1 位')
    assert.equal(p22, '')
    assert.equal(p28, '')
    assert.equal(p30, '5-3', '30 為原始 5 顆裡的第 3 位（bug 版本會錯成 4-2）')
  })
})
