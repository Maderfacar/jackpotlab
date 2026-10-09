/**
 * 組合篩選條件測試：每種條件照使用者口述的定義判斷（嚴格大於 / 小於、介於含兩端、同尾數尾數）。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { BoardState } from '../../scan/board-states'
import { checkCondition, DEFAULT_CONDITIONS, failedConditions, GROUPS, KIND_META, numberInfo, runFilter, sortByGroup, type Condition, type NumInfo } from '../conditions'

const ni = (n: number, gap: number, value: number, x: number, y: number): NumInfo => ({ n, gap, value, x, y })
const cond = (kind: Condition['kind'], p: number[], nums?: number[]): Condition => ({ id: kind, kind, enabled: true, p, nums })

// 第 115000244 期開完盤面上的實際 5 顆（驗證組合 ① 03 07 21 33 39）
const sample: NumInfo[] = [ni(3, 0, 1, 5, 1), ni(7, 0, 1, 5, 2), ni(21, 9, 11, 3, 1), ni(33, 2, 3, 4, 4), ni(39, 10, 0, 1, 1)]
const prev = [3, 7, 15, 17, 30]

describe('numberInfo', () => {
  it('每個號碼帶出所在格的隔期、值、x、y', () => {
    const slots: number[][] = Array.from({ length: 60 }, () => [])
    slots[2] = [25, 26, 29, 33]
    const state: BoardState = { slots, values: Array.from({ length: 60 }, (_, i) => (i === 2 ? 3 : 0)) }
    assert.deepEqual(numberInfo(state).get(33), ni(33, 2, 3, 4, 4))
    assert.equal(numberInfo(state).size, 4)
  })
})

describe('checkCondition', () => {
  const ok = (c: Condition) => checkCondition(c, sample, prev)

  it('隔期配置：0~5 / 6~9 / 10 以上 各幾顆', () => {
    assert.equal(ok(cond('config', [3, 1, 1])), true)
    assert.equal(ok(cond('config', [2, 2, 1])), false)
  })

  it('隔期和介於 a～b 含兩端', () => {
    assert.equal(ok(cond('gapSum', [21, 21])), true)
    assert.equal(ok(cond('gapSum', [11, 20])), false)
  })

  it('值大於 V 的有 a～b 顆（嚴格大於）', () => {
    assert.equal(ok(cond('valueAboveCount', [10, 1, 5])), true)
    assert.equal(ok(cond('valueAboveCount', [11, 1, 5])), false)
    assert.equal(ok(cond('valueAboveCount', [10, 0, 0])), false)
  })

  it('獎號總和介於 a～b（03+07+21+33+39 = 103）', () => {
    assert.equal(ok(cond('numSum', [103, 103])), true)
    assert.equal(ok(cond('numSum', [104, 185])), false)
  })

  it('最小號碼的 y、y=K 有 a～b 顆、不能有 y=K', () => {
    assert.equal(ok(cond('firstY', [1])), true)
    assert.equal(ok(cond('yCount', [1, 3, 5])), true)
    assert.equal(ok(cond('yCount', [1, 4, 5])), false)
    assert.equal(ok(cond('yCount', [1, 0, 2])), false)
    assert.equal(ok(cond('noY', [5])), true)
    assert.equal(ok(cond('noY', [4])), false)
  })

  it('尾數 D 的顆數介於、最小號碼小於（嚴格）', () => {
    assert.equal(ok(cond('tailCount', [7, 1, 1])), true)
    assert.equal(ok(cond('tailCount', [3, 3, 5])), false)
    assert.equal(ok(cond('minBelow', [4])), true)
    assert.equal(ok(cond('minBelow', [3])), false)
  })

  it('第 k 顆的隔期介於、號碼範圍至少 N 顆、區間分佈不能是', () => {
    assert.equal(ok(cond('posGap', [2, 0, 5])), true)
    assert.equal(ok(cond('posGap', [3, 0, 5])), false)
    assert.equal(ok(cond('rangeCount', [20, 29, 1, 5])), true)
    assert.equal(ok(cond('rangeCount', [20, 29, 2, 5])), false)
    // 使用者問的「1～9 一顆都不要」：填 0～0
    assert.equal(ok(cond('rangeCount', [1, 9, 0, 0])), false)
    assert.equal(ok(cond('rangeCount', [10, 19, 0, 0])), true)
    assert.equal(ok(cond('zoneNot', [2, 2, 1])), true)
    assert.equal(ok(cond('zoneNot', [2, 1, 2])), false)
  })

  it('1-9 / 10-19 / 20-29 / 30-39 各有 a～b 顆（樣本 2 / 0 / 1 / 2 顆）', () => {
    assert.equal(ok(cond('decadeCount', [2, 2, 0, 0, 1, 1, 2, 2])), true)
    assert.equal(ok(cond('decadeCount', [0, 5, 0, 5, 1, 5, 0, 5])), true)
    assert.equal(ok(cond('decadeCount', [0, 1, 0, 5, 0, 5, 0, 5])), false)
    assert.equal(ok(cond('decadeCount', [0, 5, 1, 5, 0, 5, 0, 5])), false)
  })

  it('第 1～5 顆各自的隔期 / 值 / y 介於 a～b（由小到大排）', () => {
    // 樣本隔期 0 0 9 2 10、值 1 1 11 3 0、y 1 2 1 4 1
    assert.equal(ok(cond('ballGap', [0, 0, 0, 0, 9, 9, 2, 2, 10, 10])), true)
    assert.equal(ok(cond('ballGap', [0, 5, 0, 5, 0, 5, 0, 59, 0, 59])), false)
    assert.equal(ok(cond('ballValue', [1, 1, 1, 1, 11, 11, 3, 3, 0, 0])), true)
    assert.equal(ok(cond('ballValue', [0, 999, 0, 999, 0, 999, 0, 999, 1, 999])), false)
    assert.equal(ok(cond('ballY', [1, 1, 2, 2, 1, 1, 4, 4, 1, 1])), true)
    assert.equal(ok(cond('ballY', [1, 5, 1, 5, 1, 5, 1, 3, 1, 5])), false)
  })

  it('和上一期同尾數「尾數」：03、07 對上期尾 3、7 → 2 個', () => {
    assert.equal(ok(cond('sameTailMax', [2])), true)
    assert.equal(ok(cond('sameTailMax', [1])), false)
    const twoFives = [ni(5, 1, 1, 5, 1), ni(15, 0, 1, 5, 3), ni(22, 15, 28, 2, 2), ni(36, 35, 249, 1, 1), ni(39, 10, 0, 1, 1)]
    assert.equal(checkCondition(cond('sameTailMax', [1]), twoFives, prev), true)
  })

  it('值 = K 的顆數介於、雙數至少 N 顆、排除號碼', () => {
    assert.equal(ok(cond('valueCount', [1, 2, 2])), true)
    assert.equal(ok(cond('valueCount', [0, 1, 2])), true)
    assert.equal(ok(cond('valueCount', [3, 2, 5])), false)
    assert.equal(ok(cond('evenCount', [0, 0])), true)
    assert.equal(ok(cond('evenCount', [1, 5])), false)
    assert.equal(ok(cond('exclude', [], [7])), false)
    assert.equal(ok(cond('exclude', [], [8])), true)
  })

  it('failedConditions 只列啟用中、沒通過的條件', () => {
    const conds = [cond('evenCount', [1, 5]), { ...cond('minBelow', [3]), enabled: false }, cond('noY', [5])]
    assert.deepEqual(failedConditions(conds, sample, prev).map(c => c.kind), ['evenCount'])
  })
})

describe('runFilter', () => {
  const info = new Map<number, NumInfo>(Array.from({ length: 39 }, (_, i) => {
    const n = i + 1
    return [n, ni(n, n % 12, n, 5, (n % 5) + 1)] as const
  }))

  it('沒有啟用任何條件 = 全部 575,757 組', () => {
    const r = runFilter(DEFAULT_CONDITIONS.map(c => ({ ...c, enabled: false })), info, prev, 10)
    assert.equal(r.total, 575757)
    assert.equal(r.truncated, true)
    assert.equal(r.counts[1], 73815)
  })

  it('排除 1~34 只剩 35~39 一組；每個號碼出現次數對得上', () => {
    const r = runFilter([cond('exclude', [], Array.from({ length: 34 }, (_, i) => i + 1))], info, prev)
    assert.equal(r.total, 1)
    assert.deepEqual(r.combos[0]!.map(x => x.n), [35, 36, 37, 38, 39])
    assert.equal(r.counts[36], 1)
    assert.equal(r.counts[34], 0)
  })

  it('清單照隔期和由小到大', () => {
    const r = runFilter([cond('exclude', [], Array.from({ length: 30 }, (_, i) => i + 1))], info, prev)
    const sums = r.combos.map(c => c.reduce((s, x) => s + x.gap, 0))
    assert.deepEqual(sums, [...sums].sort((a, b) => a - b))
    assert.equal(r.total, 126)
  })
})

describe('分類', () => {
  it('每種條件都有類別；預設條件依類別排好時順序不亂', () => {
    const groups = GROUPS.map(g => g.key)
    for (const c of DEFAULT_CONDITIONS) assert.ok(groups.includes(KIND_META[c.kind].group))
    const sorted = sortByGroup(DEFAULT_CONDITIONS)
    const idx = sorted.map(c => groups.indexOf(KIND_META[c.kind].group))
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
    assert.equal(sorted.length, DEFAULT_CONDITIONS.length)
  })
})
