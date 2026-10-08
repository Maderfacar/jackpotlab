/**
 * 「我的查找」盤面重建測試：每期開完後的隔期狀態（各 slot 剩餘號碼＋值）
 * 必須與 computeFeatures（網站獎號關聯同一套算法）逐顆一致。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { computeFeatures } from '../../patterns/features'
import { computeBoardStates } from '../board-states'

function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function randomDraws(count: number, seed: number): number[][] {
  const rnd = lcg(seed)
  return Array.from({ length: count }, () => {
    const set = new Set<number>()
    while (set.size < 5) set.add(1 + Math.floor(rnd() * 39))
    return [...set].sort((a, b) => a - b)
  })
}

describe('computeBoardStates', () => {
  it('每期一個盤面，slot 數 = n', () => {
    const states = computeBoardStates(randomDraws(10, 1), 60)
    assert.equal(states.length, 10)
    assert.equal(states[0]!.slots.length, 60)
    assert.equal(states[0]!.values.length, 60)
  })

  it('第一期開完：只放在最舊的 slot，值全為 0（與 539.htm 原始行為相同）', () => {
    const states = computeBoardStates([[1, 2, 3, 4, 5]], 60)
    assert.deepEqual(states[0]!.slots[59], [1, 2, 3, 4, 5])
    assert.ok(states[0]!.slots.slice(0, 59).every(s => s.length === 0))
    assert.ok(states[0]!.values.every(v => v === 0))
  })

  it('下一期每顆號碼的隔期 / 值 / 位置，都能在上一期開完的盤面找到且一致', () => {
    const draws = randomDraws(400, 7)
    const states = computeBoardStates(draws, 60)
    const feats = computeFeatures(draws, 60)
    let checked = 0
    for (let t = 1; t < draws.length; t++) {
      const prev = states[t - 1]!
      const f = feats[t]!
      draws[t]!.forEach((num, i) => {
        const g = f.gaps[i]
        if (g == null) return
        const slot = prev.slots[g]!
        assert.ok(slot.includes(num), `第 ${t} 期 ${num} 應在 slot ${g}`)
        assert.equal(prev.values[g], f.values[i], `第 ${t} 期 ${num} 的值`)
        assert.equal(slot.length, f.xs[i], `第 ${t} 期 ${num} 的 x`)
        assert.equal(slot.indexOf(num) + 1, f.ys[i], `第 ${t} 期 ${num} 的 y`)
        checked++
      })
    }
    assert.ok(checked > 1500)
  })

  it('開完的那一期放在 slot 0，且已開出的號碼從其他 slot 移除', () => {
    const states = computeBoardStates([[1, 2, 3, 4, 5], [5, 6, 7, 8, 9], [1, 6, 10, 11, 12]], 60)
    const last = states[2]!
    assert.deepEqual(last.slots[0], [1, 6, 10, 11, 12])
    assert.deepEqual(last.slots[1], [5, 7, 8, 9])
    assert.ok(last.slots.every((s, i) => i === 0 || (!s.includes(1) && !s.includes(6))))
  })

  it('盤面是快照：之後的期數不會改到之前的盤面', () => {
    const states = computeBoardStates([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [1, 11, 12, 13, 14]], 60)
    assert.deepEqual(states[1]!.slots[0], [6, 7, 8, 9, 10])
    assert.deepEqual(states[1]!.slots[59], [])
  })
})
