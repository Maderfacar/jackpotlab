/**
 * 照盤面算機率（board-prob）：用「57 萬種組合逐一列舉」驗證每一種算法完全一樣。
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { computeBoardStates } from '../board-states'
import { boardInfo, eventHappened, hyper, numbersWhere, probability, type GuessEvent, type NumberInfo } from '../points/board-prob'
import { buildInfos, evaluatePoints, POINT_KEYS, withBoardProb } from '../points/evaluate'
import { evaluateHistory } from '../points/history'
import { buildRows } from '../points/rows'

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
/** 列舉全部 C(39,5) 組合，數出事件成立的比例 */
function brute(info: NumberInfo[], ev: GuessEvent): number {
  let hit = 0
  let all = 0
  const gs = (c: number[]) => c.reduce((a, n) => a + (info[n]!.gap ?? 0), 0)
  for (let a = 1; a <= 35; a++) for (let b = a + 1; b <= 36; b++) for (let c = b + 1; c <= 37; c++) for (let d = c + 1; d <= 38; d++) for (let e = d + 1; e <= 39; e++) {
    const combo = [a, b, c, d, e]
    all++
    let ok = false
    if (ev.kind === 'count') {
      const k = combo.filter(n => ev.nums.includes(n)).length
      ok = k >= ev.min && k <= ev.max
    } else if (ev.kind === 'pos') {
      ok = ev.nums.includes(combo[ev.pos]!)
    } else {
      const s = gs(combo)
      ok = ev.want === 'lt' ? s < ev.cur : ev.want === 'gt' ? s > ev.cur : s === ev.cur
    }
    if (ok) hit++
  }
  return hit / all
}

describe('照盤面算機率', () => {
  const states = computeBoardStates(randomDraws(300, 5), 60)
  const info = boardInfo(states.at(-1)!)

  it('盤面上每顆號碼最多出現在一格；y 從 1 起算', () => {
    const inBoard = numbersWhere(info, x => x.gap != null)
    assert.ok(inBoard.length >= 30)
    for (const n of inBoard) assert.ok(info[n]!.y! >= 1)
  })

  it('hyper：K 顆裡開出 0～5 顆的機率加起來 = 1', () => {
    for (const K of [0, 3, 13, 39]) {
      const s = [0, 1, 2, 3, 4, 5].reduce((a, x) => a + hyper(K, x), 0)
      assert.ok(Math.abs(s - 1) < 1e-12, `K=${K}`)
    }
  })

  it('三種算法都和逐一列舉 575,757 組合完全一樣', () => {
    const low = numbersWhere(info, x => x.gap != null && x.gap <= 5)
    const y1 = numbersWhere(info, x => x.y === 1)
    const cur = 30
    const events: GuessEvent[] = [
      { kind: 'count', nums: low, min: 0, max: 2 },
      { kind: 'count', nums: [1, 11, 21, 31], min: 1, max: 5 },
      { kind: 'pos', pos: 0, nums: y1 },
      { kind: 'pos', pos: 3, nums: y1 },
      { kind: 'gapsum', cur, want: 'lt' },
      { kind: 'gapsum', cur, want: 'eq' }
    ]
    for (const ev of events) {
      const exact = probability(info, ev)
      const b = brute(info, ev)
      assert.ok(Math.abs(exact - b) < 1e-9, `${JSON.stringify(ev).slice(0, 60)}：${exact} vs ${b}`)
    }
  })
})

describe('八點每次猜測換成盤面事件', () => {
  const draws = randomDraws(900, 17)
  const rows = buildRows(draws.map((nums, i) => ({ issue: String(i), date: '', nums })))
  const infos = buildInfos(rows)
  const mine = withBoardProb(evaluatePoints(rows, infos), infos)
  const hist = withBoardProb(evaluateHistory(rows, infos), infos)

  it('事件在下一期實際號碼上有沒有發生 = 原本判的說中／沒說中（你的看法、歷史挑都一樣）', () => {
    let checked = 0
    for (const [name, ev] of [['你的看法', mine], ['歷史挑', hist]] as const) {
      for (const k of POINT_KEYS) {
        ev[k].forEach((e, s) => {
          if (!e.lit || e.hit == null) return
          assert.ok(e.event, `${name} ${k} 第 ${s} 期沒有事件`)
          assert.equal(eventHappened(infos[s]!, e.event!, rows[s + 1]!.nums), e.hit, `${name} ${k} 第 ${s} 期 ${e.target}`)
          checked++
        })
      }
    }
    assert.ok(checked > 5000)
  })

  it('盤面機率都在 0～1 之間', () => {
    for (const ev of [mine, hist]) {
      for (const k of POINT_KEYS) for (const e of ev[k]) if (e.lit) assert.ok(e.bp != null && e.bp >= 0 && e.bp <= 1 + 1e-12, k)
    }
  })
})
