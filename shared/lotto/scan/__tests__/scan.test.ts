/**
 * 「我的查找」七點計算測試：規則照使用者 2026-10-08 拍板的定義
 * （大/小 = 比上一期大/小、一樣 = 平；位置 = 第幾顆球；y 間隔 = 期數差；同尾 ≥2 顆；整段加總）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { BoardState } from '../board-states'
import {
  boardBuckets,
  conditional,
  continueTable,
  dirOf,
  farCountTable,
  gapConfig,
  configChecks,
  recentValues,
  runStats,
  tailPairEvents,
  tailStreak,
  trailingCount,
  windowIndices,
  yIntervals,
  type ScanDraw
} from '../scan'

function draw(i: number, nums: number[], gaps: number[], values = [0, 0, 0, 0, 0], ys = [1, 1, 1, 1, 1]): ScanDraw {
  return { issue: String(100 + i), date: `2026-01-${String(i + 1).padStart(2, '0')}`, nums, gaps, values, xs: ys.map(() => 5), ys }
}
const blank = (i: number): ScanDraw => ({ issue: String(100 + i), date: '', nums: [1, 2, 3, 4, 5], gaps: [null, null, null, null, null], values: [null, null, null, null, null], xs: [null, null, null, null, null], ys: [null, null, null, null, null] })

describe('dirOf / runStats / continueTable（第 1 點：隔期和大小）', () => {
  it('比上一期大 = 大、小 = 小、一樣 = 平', () => {
    assert.equal(dirOf(30, 35), '大')
    assert.equal(dirOf(30, 20), '小')
    assert.equal(dirOf(30, 30), '平')
  })

  it('同方向連續長度：已結束的段才計入，最後一段是「目前」', () => {
    const r = runStats(['大', '小', '大', '大', '小', '小', '小', '大'])
    assert.deepEqual(r.lengths, { 1: 2, 2: 1, 3: 1 })
    assert.deepEqual(r.current, { dir: '大', len: 1 })
  })

  it('「平」會切斷連續，本身不算一段', () => {
    const r = runStats(['大', '大', '平', '大'])
    assert.deepEqual(r.lengths, { 2: 1 })
    assert.deepEqual(r.current, { dir: '大', len: 1 })
  })

  it('連 k 期同方向之後，下一期續同方向 / 換方向 / 平', () => {
    const t = continueTable(['大', '小', '小', '大', '大', '大', '小'], 3)
    // 連1：大→小(換)、小(第2個)→? 位置1 小 是連1 → 下一個小(同)；位置3 大 連1 → 大(同)
    const k1 = t.find(x => x.k === 1)!
    assert.deepEqual([k1.n, k1.same, k1.flip, k1.flat], [3, 2, 1, 0])
    const k2 = t.find(x => x.k === 2)!
    assert.deepEqual([k2.n, k2.same, k2.flip], [2, 1, 1])
    const k3 = t.find(x => x.k === 3)!
    assert.deepEqual([k3.n, k3.flip], [1, 1])
  })
})

describe('windowIndices / conditional', () => {
  const draws = [blank(0), blank(1), ...Array.from({ length: 8 }, (_, i) => draw(i + 2, [1, 2, 3, 4, 5], [i, 1, 1, 1, 1]))]

  it('只取資料完整、且在選定期以前的期數；可限定最近幾期', () => {
    assert.deepEqual(windowIndices(draws, 9, null), [2, 3, 4, 5, 6, 7, 8, 9])
    assert.deepEqual(windowIndices(draws, 6, null), [2, 3, 4, 5, 6])
    assert.deepEqual(windowIndices(draws, 9, 3), [7, 8, 9])
    assert.deepEqual(windowIndices(draws, 9, null, 5), [5, 6, 7, 8, 9])
  })

  it('條件成立後 vs 平常：只用選定期以前已知的下一期', () => {
    const idx = windowIndices(draws, 9, null)
    const r = conditional(idx, 9, s => draws[s]!.gaps[0]! % 2 === 0, s => draws[s]!.gaps[0]! >= 5)
    // 第 s 期第 1 顆隔期 = s-2；成對 (s, s+1) 為 s = 2..8 共 7 對
    assert.equal(r.base.n, 7)
    assert.equal(r.base.hit, 3) // s+1 = 7,8,9 → g = 5,6,7
    assert.equal(r.cond.n, 4) // s = 2,4,6,8 → g = 0,2,4,6
    assert.equal(r.cond.hit, 2) // s+1 = 7,9 → g = 5,7
  })

  it('trailingCount：從選定期往回數連續成立幾期', () => {
    const idx = windowIndices(draws, 9, null)
    assert.equal(trailingCount(idx, 9, s => draws[s]!.gaps[0]! >= 5), 3)
    assert.equal(trailingCount(idx, 9, s => draws[s]!.gaps[0]! >= 99), 0)
  })
})

describe('隔期狀態：boardBuckets / farCountTable / gapConfig', () => {
  const slots: number[][] = Array.from({ length: 60 }, () => [])
  slots[0] = [1, 2, 3, 4, 5]
  slots[7] = [6, 7]
  slots[14] = [8, 9]
  slots[34] = [10]
  slots[45] = [11]
  const values = Array.from({ length: 60 }, (_, i) => i * 2)
  const state: BoardState = { slots, values }

  it('四段整段加總，並列出每格的隔期 / 值 / 號碼', () => {
    const b = boardBuckets(state)
    assert.deepEqual(b.map(x => x.count), [5, 2, 2, 2])
    assert.deepEqual(b[3]!.slots, [{ gap: 34, value: 68, nums: [10] }, { gap: 45, value: 90, nums: [11] }])
  })

  it('五顆隔期配置：0~5 / 6~9 / 10 以上，各對照 2~3 / 1~2 / 0~1', () => {
    const c = gapConfig([0, 3, 7, 12, 25])
    assert.deepEqual(c, { low: 2, mid: 1, high: 2 })
    assert.deepEqual(configChecks(c), { low: true, mid: true, high: false })
  })

  it('20 以上合計 k 顆的盤面，下一期有沒有開出隔期 20 以上', () => {
    const states = [state, state, state]
    const draws = [draw(0, [1, 2, 3, 4, 5], [0, 0, 0, 0, 0]), draw(1, [10, 12, 13, 14, 15], [34, 1, 1, 1, 1]), draw(2, [1, 2, 3, 4, 5], [1, 1, 1, 1, 1])]
    const table = farCountTable(states, draws, [0, 1, 2], 2, 20)
    const row = table.find(r => r.count === 2)!
    assert.deepEqual([row.n, row.hit], [2, 1])
  })
})

describe('recentValues（20 以上的值 vs 近期開過的大值）', () => {
  it('近 N 期開出的每顆值，大到小', () => {
    const draws = [draw(0, [1, 2, 3, 4, 5], [0, 0, 0, 0, 0], [5, 50, 1, 0, 2]), draw(1, [6, 7, 8, 9, 10], [0, 0, 0, 0, 0], [9, 0, 70, 3, 1])]
    const last1 = recentValues(draws, [0, 1], 1, 1)
    assert.deepEqual(last1.slice(0, 2).map(x => [x.num, x.value]), [[8, 70], [6, 9]])
    assert.equal(recentValues(draws, [0, 1], 1, 2).length, 10)
    assert.equal(recentValues(draws, [0, 1], 1, 2)[1]!.value, 50)
  })
})

describe('yIntervals（第 4 點）', () => {
  const ysList = [[1, 2, 1, 1, 1], [1, 1, 1, 1, 1], [1, 2, 1, 1, 1], [1, 1, 1, 2, 1], [1, 1, 1, 1, 1]]
  const draws = ysList.map((ys, i) => draw(i, [1, 2, 3, 4, 5], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], ys))
  const idx = [0, 1, 2, 3, 4]

  it('按球位：出現次數、平均間隔、最長間隔、目前已隔', () => {
    assert.deepEqual(yIntervals(draws, idx, 4, 2, 1), { count: 2, mean: 2, max: 2, current: 2 })
  })

  it('整組：任一顆 y=k 就算出現一次', () => {
    assert.deepEqual(yIntervals(draws, idx, 4, 2, null), { count: 3, mean: 1.5, max: 2, current: 1 })
  })

  it('從沒出現：都是 null', () => {
    assert.deepEqual(yIntervals(draws, idx, 4, 5, null), { count: 0, mean: null, max: null, current: null })
  })
})

describe('尾數（第 5～7 點）', () => {
  const mk = (i: number, nums: number[]) => draw(i, nums, [0, 0, 0, 0, 0])

  it('連續幾期都和上一期有同尾', () => {
    const draws = [mk(0, [1, 2, 3, 4, 5]), mk(1, [11, 16, 17, 18, 19]), mk(2, [20, 26, 27, 28, 29]), mk(3, [30, 32, 33, 34, 35])]
    const r = tailStreak(draws, [0, 1, 2, 3], 3)
    assert.equal(r.current, 3)
  })

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
