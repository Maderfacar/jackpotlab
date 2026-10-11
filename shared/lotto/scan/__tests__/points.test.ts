/**
 * /scan 八點（2026-10-11 使用者拍板）測試：規則照使用者的定義
 * （0~5 徘徊 = 每期 3 或 4 顆；隔期和連續 = 跟前一期比同方向；梯型只算同方向；同尾 ≥2 顆…）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { mergeDraws, parseHistoryFile, type PlainDraw } from '../../history-file'
import { WARMUP } from '../scan'
import { chainCandidates, evaluatePoints, LOW_RUN, POINT_KEYS, stairs, tailRatio, tripleRepeats } from '../points/evaluate'
import { tailDetail } from '../points/details'
import { evaluateHistory, MIN_N } from '../points/history'
import { buildRows, lowCount, pairTails, type Row } from '../points/rows'
import { allTrueTable, intervalStats, ledger, pairMatrix, summarize } from '../points/stats'

function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}
function randomDraws(count: number, seed: number): PlainDraw[] {
  const rnd = lcg(seed)
  return Array.from({ length: count }, (_, i) => {
    const set = new Set<number>()
    while (set.size < 5) set.add(1 + Math.floor(rnd() * 39))
    return { issue: String(1000 + i), date: '2026-01-01', nums: [...set].sort((a, b) => a - b) }
  })
}
/** 直接指定每顆隔期 / 值 / y 的假資料列 */
function row(i: number, nums: number[], gaps: (number | null)[], ys: (number | null)[] = [1, 1, 1, 1, 1], values: (number | null)[] = [0, 0, 0, 0, 0]): Row {
  return { issue: String(i), date: '', nums, gaps, values, xs: ys.map(() => 5), ys }
}
const filler = (n: number): Row[] => Array.from({ length: n }, (_, i) => row(i, [1, 2, 3, 4, 5], [9, 9, 9, 9, 9]))

describe('第 7 點：連莊、梯型', () => {
  it('上一期 12、這一期 13 → 候選 14；這一期 11 → 候選 10', () => {
    assert.deepEqual(chainCandidates([12], [13]), [14])
    assert.deepEqual(chainCandidates([12], [11]), [10])
  })
  it('上一期、這一期都有 12 → 候選 12（連莊第三期）', () => {
    assert.deepEqual(chainCandidates([12, 30], [12, 1]), [12])
  })
  it('超出 1～39 的不算', () => {
    assert.deepEqual(chainCandidates([38], [39]), [])
    assert.deepEqual(chainCandidates([2], [1]), [])
  })
  it('走完的梯型只算同方向：12→13→14、14→13→12 算，12→13→12 不算', () => {
    assert.deepEqual(stairs([12], [13], [14]), [14])
    assert.deepEqual(stairs([14], [13], [12]), [12])
    assert.deepEqual(stairs([12], [13], [12]), [])
  })
  it('連莊三期：同一號三期都開', () => {
    assert.deepEqual(tripleRepeats([5, 9], [5, 20], [5, 9]), [5])
  })
})

describe('evaluatePoints', () => {
  it('前 WARMUP 期一律不亮', () => {
    const ev = evaluatePoints(buildRows(randomDraws(WARMUP + 10, 3)))
    for (const k of POINT_KEYS) assert.ok(ev[k].slice(0, WARMUP).every(e => !e.lit))
  })

  it('不偷看未來：截到第 s+1 期算出來的第 s 期亮燈，和用全部資料算的一樣', () => {
    const draws = randomDraws(400, 11)
    const full = evaluatePoints(buildRows(draws))
    for (const s of [120, 250, 398]) {
      const part = evaluatePoints(buildRows(draws.slice(0, s + 2)))
      for (const k of POINT_KEYS) {
        assert.equal(part[k][s]!.lit, full[k][s]!.lit, `${k} 第 ${s} 期亮燈`)
        assert.equal(part[k][s]!.target, full[k][s]!.target, `${k} 第 ${s} 期對象`)
        assert.equal(part[k][s]!.hit, full[k][s]!.hit, `${k} 第 ${s} 期成真`)
      }
    }
  })

  it('最後一期的成真是 null（下一期還沒開）', () => {
    const ev = evaluatePoints(buildRows(randomDraws(200, 5)))
    for (const k of POINT_KEYS) assert.equal(ev[k].at(-1)!.hit, null)
  })

  it(`第 1 點：0~5 連 ${LOW_RUN} 期都開 3 或 4 顆才亮；下一期 0~5 只開 0～2 顆 = 成真`, () => {
    const three = (i: number) => row(i, [1, 2, 3, 4, 5], [1, 2, 3, 9, 9])
    const rows = [...filler(WARMUP), ...Array.from({ length: LOW_RUN }, (_, i) => three(WARMUP + i)), row(99, [1, 2, 3, 4, 5], [1, 9, 9, 9, 9])]
    const ev = evaluatePoints(rows).low
    assert.equal(ev[WARMUP + LOW_RUN - 2]!.lit, false)
    assert.equal(ev[WARMUP + LOW_RUN - 1]!.lit, true)
    assert.equal(ev[WARMUP + LOW_RUN - 1]!.hit, true)
    assert.equal(lowCount(rows.at(-1)!), 1)
  })

  it('第 2 點：隔期和連 2 次變大才亮；下一期變小 = 成真，一樣大 = 沒成真', () => {
    const g = (sum: number): (number | null)[] => [sum, 0, 0, 0, 0]
    const base = filler(WARMUP).map((r, i) => ({ ...r, gaps: g(i % 2 ? 10 : 20) }))
    const rows = [...base, row(1, [1, 2, 3, 4, 5], g(21)), row(2, [1, 2, 3, 4, 5], g(30)), row(3, [1, 2, 3, 4, 5], g(40)), row(4, [1, 2, 3, 4, 5], g(35))]
    const ev = evaluatePoints(rows).gapsum
    assert.equal(ev[WARMUP]!.lit, false, '只變大 1 次')
    assert.equal(ev[WARMUP + 1]!.lit, true, '連 2 次變大')
    assert.equal(ev[WARMUP + 1]!.hit, false, '下一期還是變大')
    assert.equal(ev[WARMUP + 2]!.strong, true, '連 3 次 = 強')
    assert.equal(ev[WARMUP + 2]!.hit, true, '下一期變小')
  })

  it('第 4 點：有 2 顆同尾才亮；下一期開出該尾 = 成真', () => {
    const rows = [...filler(WARMUP), row(1, [3, 13, 20, 25, 30], [9, 9, 9, 9, 9]), row(2, [23, 1, 2, 4, 5], [9, 9, 9, 9, 9])]
    const ev = evaluatePoints(rows).pair
    assert.equal(ev[WARMUP]!.lit, true)
    assert.equal(ev[WARMUP]!.target, '尾0、尾3')
    assert.equal(ev[WARMUP]!.hit, true)
    assert.deepEqual(pairTails([3, 13, 20, 25, 30]), [0, 3])
  })

  it('第 6 點：同一顆連 2 期隔期 > 5 才亮；下一期這顆隔期 0～5 = 成真', () => {
    const rows = [...filler(WARMUP).map(r => ({ ...r, gaps: [1, 1, 1, 1, 1] })),
      row(1, [1, 2, 3, 4, 5], [1, 8, 1, 1, 1]),
      row(2, [1, 2, 3, 4, 5], [1, 7, 1, 1, 1]),
      row(3, [1, 2, 3, 4, 5], [1, 2, 1, 1, 1])]
    const ev = evaluatePoints(rows).pos
    assert.equal(ev[WARMUP]!.lit, false)
    assert.equal(ev[WARMUP + 1]!.lit, true)
    assert.equal(ev[WARMUP + 1]!.target, '第 2 顆')
    assert.equal(ev[WARMUP + 1]!.hit, true)
  })

  it('第 8 點「你的看法」還沒定 → 一律不亮', () => {
    const ev = evaluatePoints(buildRows(randomDraws(300, 9))).tail
    assert.ok(ev.every(e => !e.lit))
  })

  it('第 8 點歷史挑：成真 = 被排除的尾數下一期真的沒開', () => {
    const rows = buildRows(randomDraws(600, 9))
    const ev = evaluateHistory(rows).tail
    for (let s = WARMUP + 100; s < rows.length - 1; s++) {
      const e = ev[s]!
      if (!e.lit) continue
      const d = Number(e.target.replace('不開尾', ''))
      assert.equal(e.hit, !rows[s + 1]!.nums.some(n => n % 10 === d))
    }
  })
})

describe('第 8 點歷史挑：排除尾數跟自己的平常比（2026-10-11 改）', () => {
  it('不會因為尾 0 只有 3 顆號碼就幾乎每期都挑尾 0', () => {
    const ev = evaluateHistory(buildRows(randomDraws(1500, 33))).tail
    const lit = ev.filter(e => e.lit)
    const zero = lit.filter(e => e.target === '不開尾0').length
    assert.ok(lit.length > 500)
    assert.ok(zero / lit.length < 0.5, `尾0 佔 ${zero}/${lit.length}`)
  })

  it('tailRatio：隔這麼久的開出比例 ÷ 自己平常；次數不夠回 null', () => {
    const cells = [{ n: 40, hit: 20 }, { n: 30, hit: 6 }, { n: 10, hit: 4 }, { n: 0, hit: 0 }, { n: 0, hit: 0 }, { n: 0, hit: 0 }]
    const r = tailRatio(cells, 1)!
    assert.equal(r.rate, 0.2)
    assert.equal(r.own, 30 / 80)
    assert.ok(Math.abs(r.ratio - 0.2 / (30 / 80)) < 1e-12)
    assert.equal(tailRatio(cells, 2), null)
  })

  it('燈號挑的尾數 = 細節卡粗體的排除尾數', () => {
    const rows = buildRows(randomDraws(800, 41))
    const ev = evaluateHistory(rows).tail
    for (const t of [300, 555, 799]) {
      const d = tailDetail(rows, t)
      if (ev[t]!.lit) assert.equal(ev[t]!.target, `不開尾${d.excluded}`)
    }
  })
})

describe('歷史挑（2026-10-11 使用者拍板：八點都要有，並排比）', () => {
  it('不偷看未來：截到第 s+1 期算的第 s 期，和用全部資料算的一樣', () => {
    const draws = randomDraws(700, 51)
    const full = evaluateHistory(buildRows(draws))
    for (const s of [200, 450, 698]) {
      const part = evaluateHistory(buildRows(draws.slice(0, s + 2)))
      for (const k of POINT_KEYS) {
        assert.deepEqual(part[k][s], full[k][s], `${k} 第 ${s} 期`)
      }
    }
  })

  it('前面同樣情況還不到 MIN_N 次時不猜', () => {
    const ev = evaluateHistory(buildRows(randomDraws(WARMUP + 20, 61)))
    for (const k of POINT_KEYS) assert.ok(ev[k].slice(WARMUP, WARMUP + 20).every(e => !e.lit), k)
    assert.equal(MIN_N, 30)
  })

  it('成真就是照它猜的那件事有沒有發生（②：反過來 / 繼續）', () => {
    const rows = buildRows(randomDraws(900, 71))
    const ev = evaluateHistory(rows).gapsum
    const gs = (r: Row) => r.gaps.reduce<number>((a, g) => a + (g ?? 0), 0)
    let checked = 0
    for (let s = 300; s < rows.length - 1; s++) {
      const e = ev[s]!
      if (!e.lit) continue
      const cur = Math.sign(gs(rows[s]!) - gs(rows[s - 1]!))
      const nxt = Math.sign(gs(rows[s + 1]!) - gs(rows[s]!))
      const want = e.target.includes('反過來') ? nxt === -cur : e.target.includes('繼續') ? nxt === cur : nxt === 0
      assert.equal(e.hit, want, `第 ${s} 期 ${e.target}`)
      checked++
    }
    assert.ok(checked > 100)
  })

  it('平常比例在 0～1 之間；猜中率統計格式與你的看法相同', () => {
    const ev = evaluateHistory(buildRows(randomDraws(800, 81)))
    for (const k of POINT_KEYS) {
      for (const e of ev[k]) if (e.lit) assert.ok(e.base != null && e.base >= 0 && e.base <= 1, k)
    }
  })
})

describe('統計', () => {
  const rows = buildRows(randomDraws(500, 21))
  const ev = evaluatePoints(rows)
  const t = rows.length - 1

  it('亮燈後成真：只算下一期已開出的', () => {
    const sum = summarize(ev, t)
    for (const k of POINT_KEYS) {
      const manual = ev[k].slice(WARMUP, t).filter(e => e.lit && e.hit != null)
      assert.equal(sum[k].n, manual.length)
      assert.equal(sum[k].hit, manual.filter(e => e.hit).length)
    }
  })

  it('回看第 t 期：不含第 t 期之後的成真結果', () => {
    const mid = 300
    const sum = summarize(ev, mid)
    const manual = ev.pair.slice(WARMUP, mid).filter(e => e.lit && e.hit != null)
    assert.equal(sum.pair.n, manual.length)
  })

  it('相吸相斥表左右對稱，對角線 = 自己亮的次數', () => {
    const m = pairMatrix(ev, t)
    POINT_KEYS.forEach((k, i) => {
      assert.equal(m[i]![i]!.litBoth, ev[k].slice(WARMUP, t).filter(e => e.lit).length)
      POINT_KEYS.forEach((_, j) => assert.equal(m[i]![j]!.hitBoth, m[j]![i]!.hitBoth))
    })
  })

  it('同期亮幾點：各列期數加總 = 所有已知結果的期數', () => {
    const table = allTrueTable(ev, t)
    const n = table.reduce((a, r) => a + r.n, 0)
    assert.equal(n, t - WARMUP)
    table.forEach(r => assert.equal(r.hits.reduce((a, b) => a + b, 0), r.n))
  })

  it('存摺：最後一點 = 最近幾期（實際 − 平均）的總和', () => {
    const l = ledger(rows, t, 50, r => lowCount(r))
    const expect = l.values.reduce((a, v) => a + v - l.mean, 0)
    assert.ok(Math.abs(l.points.at(-1)!.total - expect) < 1e-9)
    assert.equal(l.points.length, 50)
  })

  it('狀況的隔期：平均間隔、最長、現在隔幾期', () => {
    const occ = new Set([WARMUP + 1, WARMUP + 4, WARMUP + 10])
    const st = intervalStats(WARMUP + 12, s => occ.has(s))
    assert.deepEqual(st, { count: 3, mean: 4.5, max: 6, current: 2 })
  })
})

describe('歷史存檔', () => {
  it('格式不對就丟錯，不默默略過', () => {
    assert.throws(() => parseHistoryFile({ game: 'lotto539', rows: [[1, '2026-01-01', [1, 2, 3]]] }))
    assert.throws(() => parseHistoryFile({ game: 'lotto539', rows: [[2, '2026-01-01', [1, 2, 3, 4, 5]], [1, '2026-01-02', [1, 2, 3, 4, 5]]] }))
  })
  it('號碼排序、期號轉字串', () => {
    const d = parseHistoryFile({ game: 'lotto539', rows: [[96000001, '2007-01-01', [38, 9, 27, 11, 28]]] })
    assert.deepEqual(d, [{ issue: '96000001', date: '2007-01-01', nums: [9, 11, 27, 28, 38] }])
  })
  it('合併新期數：只接檔案最後一期之後的、去重、由舊到新', () => {
    const h: PlainDraw[] = [{ issue: '10', date: '', nums: [1, 2, 3, 4, 5] }]
    const merged = mergeDraws(h, [
      { issue: '12', date: '', nums: [1, 2, 3, 4, 6] },
      { issue: '10', date: '', nums: [9, 9, 9, 9, 9] },
      { issue: '11', date: '', nums: [1, 2, 3, 4, 7] },
      { issue: '12', date: '', nums: [1, 2, 3, 4, 6] }
    ])
    assert.deepEqual(merged.map(d => d.issue), ['10', '11', '12'])
  })
})
