/**
 * /scan 共用：同尾對事件（同一期 2 顆以上同尾 → 下一期連莊同號 / 不連莊 / 沒開，沒開再看下下期）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { tailPairEvents, type ScanDraw } from '../scan'

function draw(i: number, nums: number[]): ScanDraw {
  return { issue: String(100 + i), date: '', nums, gaps: [0, 0, 0, 0, 0], values: [0, 0, 0, 0, 0], xs: [5, 5, 5, 5, 5], ys: [1, 1, 1, 1, 1] }
}

describe('同尾對事件（第 4 點）', () => {
  const mk = draw

  it('同尾 ≥2 顆：下一期連莊同號 / 不連莊 / 都沒有時看下下期', () => {
    const draws = [
      mk(0, [1, 11, 22, 33, 35]), // 尾1：01、11
      mk(1, [11, 21, 23, 34, 36]), // 下一期：11 連莊、21 不連莊 → both；同時本期尾1：11、21
      mk(2, [2, 3, 4, 5, 6]), // 尾1 沒開
      mk(3, [31, 7, 8, 9, 10]) // 下下期開 31
    ]
    const ev = tailPairEvents(draws, [0, 1, 2, 3], 3)
    const e0 = ev.find(e => e.s === 0)!
    assert.equal(e0.tail, 1)
    assert.deepEqual(e0.nums, [1, 11])
    assert.equal(e0.next, 'both')
    const e1 = ev.find(e => e.s === 1)!
    assert.equal(e1.next, 'none')
    assert.equal(e1.skipHit, true)
  })

  it('下一期還沒開的同尾事件，結果是 null（不猜）', () => {
    const draws = [mk(0, [1, 11, 22, 33, 35])]
    const ev = tailPairEvents(draws, [0], 0)
    assert.equal(ev[0]!.next, null)
    assert.equal(ev[0]!.skipHit, null)
  })
})
