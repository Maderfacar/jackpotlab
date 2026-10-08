/**
 * /scan 整理層冒煙測試：用隨機開獎跑完整流程，檢查數字彼此對得起來（不檢查統計結論）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { computeFeatures } from '../../patterns/features'
import { computeBoardStates } from '../board-states'
import type { ScanDraw } from '../scan'
import { buildScanView } from '../view'

function makeDraws(count: number): ScanDraw[] {
  let seed = 42
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const raw = Array.from({ length: count }, () => {
    const set = new Set<number>()
    while (set.size < 5) set.add(1 + Math.floor(rnd() * 39))
    return [...set].sort((a, b) => a - b)
  })
  const feats = computeFeatures(raw, 60)
  return raw.map((nums, i) => ({ issue: String(1000 + i), date: '2026-01-01', nums, ...{ gaps: feats[i]!.gaps, values: feats[i]!.values, xs: feats[i]!.xs, ys: feats[i]!.ys } }))
}

describe('buildScanView', () => {
  const draws = makeDraws(300)
  const states = computeBoardStates(draws.map(d => d.nums), 60)

  it('最新一期：盤面四段加總 ≤ 39，條件成立的次數不超過平常', () => {
    const view = buildScanView(draws, states, 299, null, 20)
    const total = view.board.buckets.reduce((a, b) => a + b.count, 0)
    assert.ok(total <= 39 && total >= 30)
    assert.equal(view.next, null)
    for (const r of view.extras) assert.ok(r.rate.cond.n <= r.rate.base.n)
    assert.ok(view.valueSum.under10.base.n > 0)
  })

  it('回看過去某期：只用那期以前的資料，下一期存在', () => {
    const view = buildScanView(draws, states, 200, 100, 20)
    assert.ok(view.idx.every(s => s <= 200 && s > 100 && s >= 60))
    assert.ok(buildScanView(draws, states, 299, null, 20).idx[0]! >= 60)
    assert.equal(view.next?.issue, '1201')
    assert.ok(view.tails.pairs.recent.every(e => e.s <= 200))
  })
})
