/**
 * 碰數 / 投入 / 收益（2026-10-10 使用者拍板：地下算法，每碰最低 1 元，賠率可改、中獎另退本金）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { BoardState } from '../../scan/board-states'
import { addPeriod, emptyAcc, passHistory } from '../backtest'
import type { Condition } from '../conditions'
import { comb, DEFAULT_PONG, hitRange, hitsProb, pongCount, returnRate, scenarios, settle, toColumns } from '../pong'

describe('碰數', () => {
  it('連碰 = C(n, 星)：20 顆 → 190 / 1,140 / 4,845 碰', () => {
    const cols = toColumns({ ...DEFAULT_PONG, mode: 'chain', nums: Array.from({ length: 20 }, (_, i) => i + 1) })
    assert.deepEqual([2, 3, 4].map(s => pongCount(cols, s)), [190, 1140, 4845])
  })

  it('立柱：同柱不互碰，A{01,02} B{10,11,12} C{20,21} → 二星 16、三星 12、四星 0', () => {
    const cols = [[1, 2], [10, 11, 12], [20, 21]]
    assert.deepEqual([2, 3, 4].map(s => pongCount(cols, s)), [16, 12, 0])
  })

  it('立柱空柱不算；連碰重複號碼只算一次', () => {
    assert.equal(pongCount([[1, 2], [], [3]], 2), 2)
    assert.equal(toColumns({ ...DEFAULT_PONG, mode: 'chain', nums: [3, 3, 5] }).length, 2)
  })
})

describe('開獎結算', () => {
  const cols = [[1, 2], [10, 11, 12], [20, 21]]

  it('開出 01、11、21 → 二星 3 碰、三星 1 碰', () => {
    const r = settle(cols, [1, 11, 21, 30, 39], { ...DEFAULT_PONG, stake: [1, 1, 1] })
    assert.deepEqual(r.stars.map(x => x.hits), [3, 1, 0])
    assert.equal(r.drawnIn, 3)
  })

  it('開出 01、02、11 → 二星只中 2 碰（同柱 01-02 不算）', () => {
    const r = settle(cols, [1, 2, 11, 30, 39], { ...DEFAULT_PONG, stake: [1, 0, 0] })
    assert.equal(r.stars[0]!.hits, 2)
  })

  it('另退本金：每中一碰拿回 (賠率 + 1) × 每碰金額；不另退 = 賠率 × 每碰金額', () => {
    const chain = toColumns({ ...DEFAULT_PONG, mode: 'chain', nums: Array.from({ length: 20 }, (_, i) => i + 1) })
    const drawn = [1, 2, 3, 30, 31]
    const on = settle(chain, drawn, { ...DEFAULT_PONG, stake: [1, 1, 0], returnStake: true })
    assert.deepEqual(on.stars.map(x => [x.cost, x.hits, x.payout, x.net]), [[190, 3, 213, 23], [1140, 1, 801, -339], [0, 0, 0, 0]])
    const off = settle(chain, drawn, { ...DEFAULT_PONG, stake: [2, 0, 0], returnStake: false })
    assert.deepEqual([off.stars[0]!.cost, off.stars[0]!.payout], [380, 420])
    assert.equal(on.total.net, 23 - 339)
  })
})

describe('情境與機率', () => {
  it('超幾何：20 顆裡開出 k 顆的機率加總 = 1；中 3 顆 = 194,940 / 575,757', () => {
    const ps = [0, 1, 2, 3, 4, 5].map(k => hitsProb(20, k))
    assert.ok(Math.abs(ps.reduce((a, b) => a + b, 0) - 1) < 1e-12)
    assert.ok(Math.abs(ps[3]! - 194940 / 575757) < 1e-12)
    assert.equal(comb(39, 5), 575757)
  })

  it('連碰開出 k 顆的碰數固定 = C(k, 星)', () => {
    const chain = Array.from({ length: 20 }, (_, i) => [i + 1])
    assert.deepEqual(hitRange(chain, 4, 2), { min: 6, max: 6 })
    assert.deepEqual(hitRange(chain, 5, 4), { min: 5, max: 5 })
  })

  it('立柱開出 k 顆時碰數看落在哪幾柱：A2 B3 C2 開 3 顆 → 二星 0～3（3 顆都在 B = 0 碰）、三星 0～1', () => {
    const cols = [[1, 2], [10, 11, 12], [20, 21]]
    assert.deepEqual(hitRange(cols, 3, 2), { min: 0, max: 3 })
    assert.deepEqual(hitRange(cols, 3, 3), { min: 0, max: 1 })
    // 只有 2 柱時開 3 顆一定是 2+1
    assert.deepEqual(hitRange([[1, 2], [3, 4]], 3, 2), { min: 2, max: 2 })
    // 放不下 k 顆 = null
    assert.equal(hitRange([[1, 2]], 3, 2), null)
  })

  it('長期平均拿回率：二星 71 × 10/741', () => {
    assert.ok(Math.abs(returnRate(2, DEFAULT_PONG) - 71 * 10 / 741) < 1e-12)
    assert.ok(Math.abs(returnRate(4, { ...DEFAULT_PONG, returnStake: false }) - 12500 * 5 / 82251) < 1e-12)
  })
})

describe('scenarios', () => {
  it('20 顆連碰、每碰 1 元、另退本金：中 3 顆 → 二星 +23、三星 −339、四星 −4,845', () => {
    const chain = Array.from({ length: 20 }, (_, i) => [i + 1])
    const sc = scenarios(chain, { ...DEFAULT_PONG, stake: [1, 1, 1] })
    assert.equal(sc.length, 6)
    const k3 = sc[3]!
    assert.deepEqual(k3.stars.map(x => [x.hitsMin, x.netMin, x.netMax]), [[3, 23, 23], [1, -339, -339], [0, -4845, -4845]])
    assert.equal(k3.totalMin, 23 - 339 - 4845)
    assert.ok(Math.abs(k3.prob - 194940 / 575757) < 1e-12)
  })

  it('立柱總淨賺賠照同一種落法算（不是各星最少相加）', () => {
    const cols = [[1, 2], [10, 11, 12], [20, 21]]
    const k3 = scenarios(cols, { ...DEFAULT_PONG, stake: [1, 1, 0] }).find(x => x.k === 3)!
    // 落法 [3]：二星 0、三星 0 → −16 −12；[2,1]：二星 2 → 142−16、三星 0；[1,1,1]：二星 3、三星 1
    assert.equal(k3.totalMin, -28)
    assert.equal(k3.totalMax, 3 * 71 - 16 + 801 - 12)
  })
})

describe('回測 addPeriod', () => {
  it('沒勾條件 = 盤面上全部號碼都是橘色；連碰結算、隨機期望加總 = 期數', () => {
    const slots: number[][] = Array.from({ length: 60 }, () => [])
    slots[0] = [1, 2, 3, 4, 5]
    slots[1] = [6, 7, 8]
    const state: BoardState = { slots, values: new Array<number>(60).fill(0) }
    const st = { ...DEFAULT_PONG, stake: [1, 0, 0] }
    const acc = addPeriod(emptyAcc(), [], state, [1, 2, 3, 4, 5], [1, 6, 20, 30, 39], st)
    assert.equal(acc.periods, 1)
    assert.equal(acc.poolSum, 8)
    assert.deepEqual(acc.kDist, [0, 0, 1, 0, 0, 0])
    assert.deepEqual([acc.cost[0], acc.payout[0]], [28, 71])
    assert.ok(Math.abs(acc.kExpected.reduce((a, b) => a + b, 0) - 1) < 1e-12)
    const twice = addPeriod(acc, [], state, [1, 2, 3, 4, 5], [10, 11, 12, 13, 14], st)
    assert.deepEqual([twice.periods, twice.cost[0], twice.payout[0], twice.kDist[0]], [2, 56, 71, 1])
  })
})

describe('歷史全過 passHistory', () => {
  it('每期把下一期實際開出的 5 顆套條件；不在盤面上的期別不算', () => {
    const slots: number[][] = Array.from({ length: 60 }, () => [])
    slots[0] = [1, 2, 3, 4, 5]
    slots[1] = [6, 7, 8, 9, 10]
    const state: BoardState = { slots, values: new Array<number>(60).fill(0) }
    const draws = [[11, 12, 13, 14, 15], [1, 2, 3, 6, 7], [1, 2, 3, 4, 5], [1, 2, 3, 4, 30]]
    const states = [state, state, state, state]
    const even2: Condition = { id: 'e', kind: 'evenCount', enabled: true, p: [2, 2] }
    // s=0 → 下一期 1 2 3 6 7（雙數 2、6 = 2 顆 ✓）；s=1 → 1 2 3 4 5（雙數 2 顆 ✓）；s=2 → 含 30 不在盤面，不算
    const r = passHistory([even2], states, draws, 0)
    assert.deepEqual([r.n, r.hit, r.hitAt], [2, 2, [1, 2]])
    const r2 = passHistory([{ ...even2, p: [3, 5] }], states, draws, 0)
    assert.deepEqual([r2.n, r2.hit], [2, 0])
  })
})
