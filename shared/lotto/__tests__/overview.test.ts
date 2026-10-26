/**
 * 一頁總覽的計算（shared/lotto/overview/*）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { buildCoords, gapShape, hasConsecutive, hasSameTail, thirdShape, zoneShape, type OverviewDraw } from '../overview/coords'
import { bucketOf, positionStats, positionValues, similar, spread } from '../overview/position'
import { byTimes, combos, follows, groupRepeats, latestOverlap, perYear } from '../overview/numbers'
import { currentRun, ladder, runStats, waits } from '../overview/streak'

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
