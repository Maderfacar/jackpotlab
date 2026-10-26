/**
 * 一頁總覽的計算（shared/lotto/overview/*）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { buildCoords, gapShape, hasConsecutive, hasSameTail, thirdShape, zoneShape, type OverviewDraw } from '../overview/coords'
import { bucketOf, positionStats, positionValues, similar, spread } from '../overview/position'
import { byTimes, combos, follows, groupRepeats, latestOverlap, perYear } from '../overview/numbers'
import { currentRun, ladder, runStats, waits } from '../overview/streak'
import { ballClass, crossTable, runLengths, sameSituation } from '../overview/cross'
import { pullback, returnGroup, trips } from '../overview/pullback'
import { exceptionSplit, precursors, rateOf } from '../overview/precursor'

const draw = (i: number, nums: number[], date = `2020-01-${String(i + 1).padStart(2, '0')}`): OverviewDraw => ({ issue: String(i + 1), date, nums })

describe('座標', () => {
  it('隔期格局、區段、連號、同尾', () => {
    assert.equal(gapShape([0, 3, 6, 9, 12]), '2·2·1')
    assert.equal(gapShape([10, 20, 30, 40, 50]), '0·0·5')
    assert.equal(zoneShape([1, 9, 10, 29, 39]), '2·1·1·1')
    assert.equal(thirdShape([13, 14, 26, 27, 39]), '1·2·2')
    assert.equal(hasConsecutive([3, 8, 14, 15, 30]), true)
    assert.equal(hasConsecutive([3, 8, 16, 20, 30]), false)
    assert.equal(hasSameTail([5, 25, 7, 18, 39]), true)
    assert.equal(hasSameTail([1, 12, 23, 34, 5]), false)
  })

  it('單雙、大小三段、連莊、總和方向', () => {
    const draws = [draw(0, [1, 3, 5, 20, 22]), draw(1, [2, 4, 5, 21, 23]), draw(2, [2, 4, 6, 8, 10])]
    const c = Object.fromEntries(buildCoords(draws).map(s => [s.def.id, s.seq]))
    assert.deepEqual(c.oddEven, ['3單', '3單', '5雙'])
    assert.deepEqual(c.bigSmall, ['3·2·0', '3·2·0', '5·0·0'])
    assert.deepEqual(c.repeat, [null, '連莊1', '連莊2+'])
    assert.deepEqual(c.total, [null, '升', '降'])
  })
})

describe('連 N 期', () => {
  const seq = ['A', 'B', 'B', 'A', 'B', 'B', 'B', 'C', 'B', 'B']

  it('目前連幾期、以前連到這麼長幾次', () => {
    const run = currentRun(seq)!
    assert.deepEqual(run, { state: 'B', length: 2 })
    // 以前 B 的段（不含索引 8～9 這段）：長 2、長 3 → 都連到 ≥2，最長 3（結束在索引 6）
    assert.deepEqual(runStats(seq, run), { reached: 2, runs: 2, max: 3, maxEnd: 6 })
    assert.deepEqual(runStats(['A', 'A', 'A', 'B', 'A'], { state: 'A', length: 1 }), { reached: 1, runs: 1, max: 3, maxEnd: 2 })
  })

  it('樓梯：一路往上對到沒出現過為止，之後第 1～3 期只算已開出的', () => {
    const steps = ladder(seq)
    // 最近 3 期 C、B、B 以前沒出現過 → 停在第 3 階
    assert.deepEqual(steps.map(s => [s.k, s.hits]), [[1, [1, 2, 4, 5, 6, 8]], [2, [2, 5, 6]], [3, []]])
    const k2 = steps[1]!
    // 索引 2 → A、B、B；5 → B、C、B；6 → C、B、B
    assert.deepEqual(k2.next[0], { A: 1, B: 1, C: 1 })
    assert.deepEqual(k2.next[1], { B: 2, C: 1 })
    assert.deepEqual(k2.nextCount, [3, 3, 3])
    // 索引 8 之後只開了 1 期
    assert.deepEqual(steps[0]!.nextCount, [6, 5, 5])
    assert.deepEqual(steps[2]!.pattern, ['C', 'B', 'B'])
  })

  it('有 null 就停在那一階', () => {
    assert.deepEqual(ladder([null, 'A', 'A']).map(s => s.k), [1, 2])
    assert.equal(currentRun(['A', null]), null)
  })

  it('等多久：已等、平均間隔、最久、以前等到這麼久幾次', () => {
    const [a, c] = waits(seq, ['A', 'C'])
    assert.deepEqual(a, { state: 'A', count: 2, waited: 6, avgGap: 3, maxGap: 3, reachedNow: 0, gaps: 1 })
    assert.deepEqual(c, { state: 'C', count: 1, waited: 2, avgGap: null, maxGap: 0, reachedNow: 0, gaps: 0 })
    const [b] = waits(['B', 'x', 'x', 'B', 'x', 'B', 'x', 'x'], ['B'])
    assert.deepEqual(b, { state: 'B', count: 3, waited: 2, avgGap: 2.5, maxGap: 3, reachedNow: 2, gaps: 2 })
  })
})

describe('號碼之間', () => {
  const draws = [
    draw(0, [1, 2, 3, 4, 5], '2019-05-01'),
    draw(1, [6, 7, 8, 9, 10], '2019-05-02'),
    draw(2, [1, 2, 3, 4, 6], '2020-05-03'),
    draw(3, [1, 2, 3, 4, 5], '2020-05-04'),
    draw(4, [1, 2, 3, 11, 12], '2020-05-05')
  ]

  it('完整重覆與 4 碼重覆', () => {
    assert.deepEqual(groupRepeats(draws, 5), [{ nums: [1, 2, 3, 4, 5], at: [0, 3] }])
    const four = byTimes(groupRepeats(draws, 4))
    assert.deepEqual(four[0], { nums: [1, 2, 3, 4], at: [0, 2, 3] })
    assert.equal(combos([5, 1, 3], 2).length, 3)
  })

  it('最新一期最多同幾顆', () => {
    assert.deepEqual(latestOverlap(draws), { most: 3, at: [3, 2, 0] })
  })

  it('牽引與逐年', () => {
    const [f] = follows(draws, [1])
    assert.equal(f!.times, 3)
    assert.deepEqual(f!.top.slice(0, 2), [{ num: 1, count: 2 }, { num: 2, count: 2 }])
    assert.deepEqual(perYear(draws, [0, 2, 3]), { 2019: 1, 2020: 2 })
  })
})

describe('位置波段', () => {
  it('分檔：隔期 0~5／6~9／10+，值 0／1~2／3~5／6~9／10+', () => {
    assert.deepEqual([0, 5, 6, 9, 10, 40].map(v => bucketOf('gap', v)), [0, 0, 1, 1, 2, 2])
    assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10].map(v => bucketOf('value', v)), [0, 1, 1, 2, 2, 3, 3, 4])
  })

  it('每個位置取對應那一顆；五顆不齊為 null', () => {
    const feats = [
      { gaps: [null, null, null, null, null], values: [], xs: [], ys: [] },
      { gaps: [1, 2, 3, 4, 5], values: [0, 1, 2, 3, 4], xs: [], ys: [] }
    ]
    assert.deepEqual(positionValues(feats, 'gap')[2], [null, 3])
    assert.deepEqual(positionValues(feats, 'value')[4], [null, 4])
  })

  it('平均含最新一期；分布取近似分位數', () => {
    const vals = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const st = positionStats(vals)
    assert.equal(st.current, 15)
    assert.deepEqual(st.avgs, [13, 10.5, 8])
    assert.deepEqual(spread([5, 1, 3]), { p10: 1, p25: 3, p50: 3, p75: 5, p90: 5 })
  })

  it('相似波形：最近 L 期檔位一樣，之後 1～3 期只算已開出的', () => {
    // 檔位：0 0 1 0 0 1 0 0
    const vals = [1, 2, 7, 3, 4, 8, 0, 5]
    const s = similar(vals, 'gap', 2)!
    assert.deepEqual(s.pattern, [0, 0])
    assert.deepEqual(s.hits, [1, 4])
    assert.deepEqual(s.nextBuckets, [0, 2, 0])
    assert.equal(s.nextCount, 2)
    assert.deepEqual(s.fan[0], spread([7, 8]))
    assert.deepEqual(s.fan[2], spread([4, 5]))
    assert.equal(similar([null, 1], 'gap', 2), null)
  })
})

describe('交叉', () => {
  it('每期往前連幾期；以前一樣的盤面（連到 ≥ N 期，不含最新一期）與它們的下一期', () => {
    const seq = ['A', 'A', 'B', 'A', 'A', 'A', null, 'A', 'A']
    assert.deepEqual(runLengths(seq), [1, 2, 1, 1, 2, 3, 0, 1, 2])
    assert.deepEqual(sameSituation(seq, 'A', 2), [1, 4, 5])
    assert.deepEqual(sameSituation(seq, 'A', 2, 1), [2, 5, 6])
  })

  it('每顆球用兩種分法歸類；有一顆分不出類的期整期不算', () => {
    const nums = [[1, 3, 14, 27, 30], [2, 4, 6, 8, 10]]
    const feats = [
      { gaps: [0, 6, 12, 1, 2], values: [], xs: [], ys: [1, 2, 3, 4, 5] },
      { gaps: [0, null, 1, 2, 3], values: [], xs: [], ys: [] }
    ]
    assert.equal(ballClass('y', 30, feats[0]!, 4), 3)
    assert.equal(ballClass('head', 30, feats[0]!, 4), 3)
    const t = crossTable(nums, feats, [0, 1], 'oddEven', 'gap')
    assert.equal(t.draws, 1)
    // 單：1(隔0)、3(隔6)、27(隔1) → 0~5 兩顆、6~9 一顆；雙：14(隔12)、30(隔2)
    assert.deepEqual(t.cells, [[2, 1, 0], [1, 0, 1]])
    assert.deepEqual(crossTable(nums, feats, [0, 1], 'oddEven', 'third'), { cells: [[2, 0, 1], [5, 1, 1]], draws: 2 })
  })
})

describe('回拉', () => {
  it('衝到高處（≥ p90）到回到中位數隔幾期；還在外面的算目前這趟', () => {
    const band = { p10: 1, p25: 2, p50: 3, p75: 5, p90: 8 }
    // 索引 2 衝到 9 → 索引 4 回到 3（2 期）；索引 6 掉到 0 → 索引 7 回到 4（1 期）；索引 9 衝到 10 還沒回
    const vals = [3, 4, 9, 8, 3, 2, 0, 4, 3, 10, 6]
    const ts = trips(vals, band)
    assert.deepEqual(ts.map(t => [t.side, t.start, t.end, t.nextValue]), [['high', 2, 4, 8], ['low', 6, 7, 4], ['high', 9, null, 6]])
    // 高處直接掉到低處：同一期結束上一趟、開始新的一趟
    assert.deepEqual(trips([3, 9, 0, 3], band).map(t => [t.side, t.start, t.end]), [['high', 1, 2], ['low', 2, 3]])
    assert.equal(returnGroup(2), 1)
    assert.equal(returnGroup(7), 4)
  })

  it('速度、力道、撐過幾期還沒回的那些趟後來再幾期回', () => {
    // 中位數 3、p90 = 9：索引 10（2 期回）、13（1 期回）、15（3 期回）、19（還在外面 1 期）
    const vals = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 9, 9, 3, 9, 3, 9, 9, 9, 3, 9, 9]
    const pb = pullback(vals)!
    assert.deepEqual(pb.band, spread(vals))
    assert.equal(pb.high.count, 3)
    assert.deepEqual(pb.high.groups, [1, 1, 1, 0, 0, 0])
    assert.equal(pb.high.medianLen, 2)
    assert.deepEqual(pb.ongoing, { side: 'high', start: 19, elapsed: 1, survived: 2, remaining: [1, 1, 0, 0, 0, 0] })
    // 21 期裡 13 期是 3（小於 9）
    assert.equal(pb.rank, 62)
  })
})

describe('例外前兆', () => {
  it('常見 = 多到少累加到 ≥ 60%，其餘是例外', () => {
    const seq = ['A', 'A', 'A', 'B', 'B', 'C', 'A', 'B', 'C', 'D']
    assert.deepEqual(exceptionSplit(seq), { common: ['A', 'B'], rare: ['C', 'D'], rareShare: 0.30000000000000004 })
    assert.equal(exceptionSplit(['A', 'A']), null)
  })

  it('前一期是某個狀態時，下一期出例外的次數', () => {
    const def = { id: 't', name: 't', hint: '', states: [], tone: () => ({ side: 0 as const, strength: 0 }) }
    const target = { def, seq: ['A', 'X', 'A', 'A', 'X', 'A'] }
    const other = { def: { ...def, id: 'o' }, seq: ['p', 'q', 'p', 'q', 'p', 'q'] }
    const res = precursors(target, { common: ['A'], rare: ['X'], rareShare: 2 / 6 }, [other])
    assert.deepEqual(res.base, { n: 5, e: 2 })
    const row = (s: string) => res.rows.find(r => r.state === s)
    assert.deepEqual([row('p')!.n, row('p')!.e, row('q')!.n, row('q')!.e], [3, 1, 2, 1])
    assert.equal(rateOf(row('q')!), 0.5)
  })
})
