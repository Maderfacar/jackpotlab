/**
 * /scan 八點的「歷史挑」（2026-10-11 使用者拍板：八點都要有，跟「你的看法」並排比）。
 *
 * 統一做法：
 *   1. 看第 s 期開完是什麼狀況（key）
 *   2. 查第 s 期以前，同樣狀況出現時，下一期每一種結果各佔多少，和平常比
 *   3. 挑「比平常多最多」的結果去猜；同樣狀況少於 MIN_N 次不猜
 * 只用已經知道下一期結果的期數（第 q 期的結果要到第 q+1 期開出才記進表），不偷看未來。
 * 回傳格式與 evaluatePoints 相同（lit / target / hit / base），統計與畫面可以共用。
 */
import { WARMUP } from '../scan'
import { numbersWhere, type GuessEvent, type NumberInfo } from './board-prob'
import {
  buildInfos, POINT_KEYS, TAIL_GAP_CAP, tailRatio, VALUE_LEVELS, valueLevel,
  type PointEval, type PointKey
} from './evaluate'
import { gapSumOf, hasTail, lowCount, pairTails, type Row } from './rows'

/** 同樣狀況至少出現幾次才拿來挑 */
export const MIN_N = 30
const VALUE_GAP_CAP = 10

const NONE: PointEval = { lit: false, strong: false, target: '', hit: null, base: null }
const pad2 = (n: number) => String(n).padStart(2, '0')

interface Cell {
  n: number
  c: number[]
  /** 每個結果「本來該有」的機率加總（平常比例因對象而異時用，例：特定尾數、特定號碼） */
  b: number[]
}

/** 狀況 → 下一期結果 的次數表；global = 不分狀況的平常 */
class CondTable {
  private cells = new Map<string, Cell>()
  private gN = 0
  private gC: number[]
  constructor(private size: number) {
    this.gC = new Array<number>(size).fill(0)
  }

  add(key: string, outcome: number, baseProbs?: number[]): void {
    let cell = this.cells.get(key)
    if (!cell) {
      cell = { n: 0, c: new Array<number>(this.size).fill(0), b: new Array<number>(this.size).fill(0) }
      this.cells.set(key, cell)
    }
    cell.n++
    if (outcome >= 0) cell.c[outcome]!++
    if (baseProbs) baseProbs.forEach((p, i) => (cell!.b[i]! += p))
    this.gN++
    if (outcome >= 0) this.gC[outcome]!++
  }

  /** 這個狀況下，結果 o 的比例與平常（own = 用該狀況自己的「本來該有」；否則用不分狀況的平常） */
  rate(key: string, o: number, own = false): { rate: number, base: number, n: number } | null {
    const cell = this.cells.get(key)
    if (!cell || cell.n < MIN_N || !this.gN) return null
    return { rate: cell.c[o]! / cell.n, base: own ? cell.b[o]! / cell.n : this.gC[o]! / this.gN, n: cell.n }
  }
}

interface Choice {
  target: string
  base: number
  diff: number
  check: (next: Row) => boolean
  event: GuessEvent
}
const better = (a: Choice | null, b: Choice | null): Choice | null => (!b || (a && a.diff >= b.diff) ? a : b)

function hyperAny(k: number): number {
  let none = 1
  for (let i = 0; i < 5; i++) none *= (39 - k - i) / (39 - i)
  return 1 - none
}

// ---------- 每一點的「狀況」與「結果」 ----------

const LOW_LABELS = ['0～1 顆', '2 顆', '3 顆', '4 顆', '5 顆']
const lowOutcome = (r: Row) => Math.max(0, lowCount(r) - 1)
/** ② 的結果跟「這期的方向」比：反過來 / 繼續同方向 / 一樣（和「你的看法」的平常是同一把尺） */
const relDir = (cur: number, next: number) => (next === -cur ? 0 : next === cur ? 1 : 2)
const GAP_BUCKETS = ['0～5', '6～9', '10～19', '20 以上']
const gapBucket = (g: number | null) => (g == null ? 3 : g <= 5 ? 0 : g <= 9 ? 1 : g <= 19 ? 2 : 3)

const tailNums = (tails: number[]) => Array.from({ length: 39 }, (_, i) => i + 1).filter(n => tails.includes(n % 10))

export function evaluateHistory(rows: Row[], infos: NumberInfo[][] = buildInfos(rows)): Record<PointKey, PointEval[]> {
  const out = Object.fromEntries(POINT_KEYS.map(k => [k, [] as PointEval[]])) as Record<PointKey, PointEval[]>
  const S = rows.length

  // ---- 逐期需要的序列（只看到第 s 期）----
  const low = rows.map(lowCount)
  const run34 = new Array<number>(S).fill(0)
  const dir = new Array<number>(S).fill(0)
  const dirRun = new Array<number>(S).fill(0)
  for (let s = 0; s < S; s++) {
    run34[s] = low[s] === 3 || low[s] === 4 ? (s ? run34[s - 1]! : 0) + 1 : 0
    dir[s] = s ? Math.sign(gapSumOf(rows[s]!) - gapSumOf(rows[s - 1]!)) : 0
    dirRun[s] = dir[s] === 0 ? 0 : s && dir[s - 1] === dir[s] ? dirRun[s - 1]! + 1 : 1
  }
  const yRun = rows.map(() => [0, 0, 0, 0, 0])
  const gRun = rows.map(() => [0, 0, 0, 0, 0])
  for (let s = 0; s < S; s++) {
    for (let p = 0; p < 5; p++) {
      yRun[s]![p] = rows[s]!.ys[p] !== 1 ? (s ? yRun[s - 1]![p]! : 0) + 1 : 0
      const g = rows[s]!.gaps[p]
      gRun[s]![p] = g == null || g > 5 ? (s ? gRun[s - 1]![p]! : 0) + 1 : 0
    }
  }

  // ---- 次數表 ----
  const tLow = new CondTable(5)
  const tDir = new CondTable(3)
  const tVal = VALUE_LEVELS.map(() => new CondTable(2))
  const tPair = new CondTable(2)
  const tY = [0, 1, 2, 3, 4].map(() => new CondTable(5))
  const tPos = [0, 1, 2, 3, 4].map(() => new CondTable(4))
  const tChain = new CondTable(3)
  const tailCell = Array.from({ length: 10 }, () => Array.from({ length: TAIL_GAP_CAP + 1 }, () => ({ n: 0, hit: 0 })))

  // 狀況鍵（第 s 期開完）
  const valGap = VALUE_LEVELS.map(() => -1)
  const valGapAt: number[][] = []
  const tailLast = new Array<number>(10).fill(-1)
  const tailSeen = new Array<number>(10).fill(0)
  const pairEvents: { s: number, tails: number[] }[] = []

  const keyLow = (s: number) => `${low[s]}-${Math.min(run34[s]!, 5)}`
  const keyDir = (s: number) => String(Math.min(dirRun[s]!, 4))
  const keyY = (s: number, p: number) => `${Math.min(rows[s]!.ys[p] ?? 0, 5)}-${Math.min(yRun[s]![p]!, 3)}`
  const keyPos = (s: number, p: number) => `${gapBucket(rows[s]!.gaps[p] ?? null)}-${Math.min(gRun[s]![p]!, 3)}`
  const tailFreq = (d: number, s: number) => tailSeen[d]! / (s + 1)
  /** 第 s 期以前 10 期內的同尾對，下一期有帶出同尾的比例（下一期要 ≤ s） */
  function pairKey(s: number): string {
    let n = 0
    let hit = 0
    for (let i = pairEvents.length - 1; i >= 0; i--) {
      const e = pairEvents[i]!
      if (e.s >= s) continue
      if (e.s < s - 10) break
      n++
      if (e.tails.some(d => hasTail(rows[e.s + 1]!.nums, d))) hit++
    }
    if (!n) return 'none'
    return hit / n >= 0.5 ? 'high' : 'low'
  }
  const chainSets = (s: number) => {
    const prev = rows[s - 1]!.nums
    const cur = rows[s]!.nums
    const rep = cur.filter(n => prev.includes(n))
    const stair = new Set<number>()
    for (const x of prev) {
      for (const d of [1, -1]) {
        if (cur.includes(x + d) && x + 2 * d >= 1 && x + 2 * d <= 39) stair.add(x + 2 * d)
      }
    }
    return { rep, stair: [...stair].sort((a, b) => a - b), all: [...new Set([...rep, ...stair])].sort((a, b) => a - b) }
  }
  const pairBase = new Map<number, number[]>()
  const chainBase = new Map<number, number[]>()

  for (let s = 0; s < S; s++) {
    const r = rows[s]!
    const q = s - 1 // 第 q 期的狀況，結果是第 s 期 → 記進表
    if (q >= WARMUP) {
      tLow.add(keyLow(q), lowOutcome(r))
      if (dir[q] !== 0) tDir.add(keyDir(q), relDir(dir[q]!, Math.sign(gapSumOf(r) - gapSumOf(rows[q]!))))
      const levels = new Set(r.values.filter((v): v is number => v != null).map(valueLevel))
      valGapAt[q]!.forEach((g, L) => {
        if (g >= 0) tVal[L]!.add(String(Math.min(g, VALUE_GAP_CAP)), levels.has(L) ? 0 : 1)
      })
      for (let p = 0; p < 5; p++) {
        const y = r.ys[p]
        tY[p]!.add(keyY(q, p), y == null ? -1 : Math.min(y, 5) - 1)
        tPos[p]!.add(keyPos(q, p), gapBucket(r.gaps[p] ?? null))
      }
      const tails = pairTails(rows[q]!.nums)
      if (tails.length) tPair.add(pairKey(q), tails.some(d => hasTail(r.nums, d)) ? 0 : 1, pairBase.get(q))
      if (q >= 1) {
        const cs = chainSets(q)
        if (cs.all.length) {
          const o = cs.rep.some(n => r.nums.includes(n)) ? 0 : cs.stair.some(n => r.nums.includes(n)) ? 1 : 2
          tChain.add(`${cs.rep.length > 0}-${cs.stair.length > 0}`, o, chainBase.get(q))
        }
      }
    }
    // 尾數格子（與 ⑧ 你的看法同一套：用第 s 期之前的隔期，記第 s 期有沒有開）
    for (let d = 0; d < 10; d++) {
      const has = hasTail(r.nums, d)
      if (s >= WARMUP && tailLast[d]! >= 0) {
        const cell = tailCell[d]![Math.min(s - 1 - tailLast[d]!, TAIL_GAP_CAP)]!
        cell.n++
        if (has) cell.hit++
      }
      if (has) {
        tailLast[d] = s
        tailSeen[d]!++
      }
    }
    // 值的隔期（第 s 期開完）
    if (s >= 1) {
      const levels = new Set(r.values.filter((v): v is number => v != null).map(valueLevel))
      levels.forEach(L => (valGap[L] = s))
    }
    valGapAt[s] = valGap.map(last => (last < 0 ? -1 : s - last))
    const tailsNow = pairTails(r.nums)
    if (tailsNow.length) {
      pairEvents.push({ s, tails: tailsNow })
      const p = 1 - tailsNow.reduce((acc, d) => acc * (1 - tailFreq(d, s)), 1)
      pairBase.set(s, [p, 1 - p])
    }
    if (s >= 1) {
      const cs = chainSets(s)
      if (cs.all.length) chainBase.set(s, [hyperAny(cs.rep.length), hyperAny(cs.stair.length), 1 - hyperAny(cs.all.length)])
    }

    if (s < WARMUP) {
      POINT_KEYS.forEach(k => out[k].push(NONE))
      continue
    }
    const nx = rows[s + 1]
    const push = (k: PointKey, ch: Choice | null) => out[k].push(ch && ch.diff > 0
      ? { lit: true, strong: false, target: ch.target, hit: nx ? ch.check(nx) : null, base: ch.base, event: ch.event }
      : NONE)
    const info = infos[s]!
    // 這期盤面上，各群號碼（建一次，各點共用）
    const lowNums = numbersWhere(info, x => x.gap != null && x.gap <= 5)
    const byLevel = VALUE_LEVELS.map(() => [] as number[])
    const byY = [0, 1, 2, 3, 4].map(() => [] as number[])
    const byBucket = [0, 1, 2, 3].map(() => [] as number[])
    info.forEach((z, n) => {
      if (n < 1) return
      if (z.value != null) byLevel[valueLevel(z.value)]!.push(n)
      if (z.y != null) byY[Math.min(z.y, 5) - 1]!.push(n)
      byBucket[gapBucket(z.gap)]!.push(n)
    })

    // ① 0~5 開幾顆：狀況 = 這期開幾顆 × 已連幾期 3～4 顆
    {
      let best: Choice | null = null
      LOW_LABELS.forEach((label, o) => {
        const x = tLow.rate(keyLow(s), o)
        if (x) best = better(best, { target: `0~5 開 ${label}`, base: x.base, diff: x.rate - x.base, check: n => lowOutcome(n) === o, event: { kind: 'count', nums: lowNums, min: o === 0 ? 0 : o + 1, max: o + 1 } })
      })
      push('low', best)
    }
    // ② 隔期和：狀況 = 已連幾次同方向 → 下一期反過來 / 繼續同方向 / 一樣
    {
      let best: Choice | null = null
      const cur = dir[s]!
      if (cur !== 0) {
        const labels = [cur > 0 ? '變小（反過來）' : '變大（反過來）', cur > 0 ? '繼續變大' : '繼續變小', '一樣']
        labels.forEach((label, o) => {
          const x = tDir.rate(keyDir(s), o)
          if (x) best = better(best, { target: `隔期和${label}`, base: x.base, diff: x.rate - x.base, check: n => relDir(cur, Math.sign(gapSumOf(n) - gapSumOf(r))) === o, event: { kind: 'gapsum', cur: gapSumOf(r), want: o === 2 ? 'eq' : (o === 0) === (cur > 0) ? 'lt' : 'gt' } })
        })
      }
      push('gapsum', best)
    }
    // ③ 值：每個值現在隔幾期 → 歷史上隔這麼久時下一期開出的比例 vs 平常
    {
      let best: Choice | null = null
      VALUE_LEVELS.forEach((label, L) => {
        const g = valGapAt[s]![L]!
        if (g < 0) return
        const x = tVal[L]!.rate(String(Math.min(g, VALUE_GAP_CAP)), 0)
        if (x) best = better(best, { target: `開出值 ${label}`, base: x.base, diff: x.rate - x.base, check: n => n.values.some(v => v != null && valueLevel(v) === L), event: { kind: 'count', nums: byLevel[L]!, min: 1, max: 5 } })
      })
      push('value', best)
    }
    // ④ 同尾對：狀況 = 前 10 期的同尾對，下一期多半有／沒有帶出同尾
    {
      const tails = pairTails(r.nums)
      let best: Choice | null = null
      if (tails.length) {
        const name = tails.map(d => `尾${d}`).join('、')
        const want = (n: Row) => tails.some(d => hasTail(n.nums, d))
        const yes = tPair.rate(pairKey(s), 0, true)
        const no = tPair.rate(pairKey(s), 1, true)
        const tn = tailNums(tails)
        if (yes) best = better(best, { target: `再開出${name}`, base: pairBase.get(s)![0]!, diff: yes.rate - yes.base, check: want, event: { kind: 'count', nums: tn, min: 1, max: 5 } })
        if (no) best = better(best, { target: `不開${name}`, base: pairBase.get(s)![1]!, diff: no.rate - no.base, check: n => !want(n), event: { kind: 'count', nums: tn, min: 0, max: 0 } })
      }
      push('pair', best)
    }
    // ⑤ 位置 y：每顆 × 這期 y × 已連幾期 y≠1 → 下一期這顆 y 是多少
    {
      let best: Choice | null = null
      for (let p = 0; p < 5; p++) {
        for (let o = 0; o < 5; o++) {
          const x = tY[p]!.rate(keyY(s, p), o)
          if (x) best = better(best, { target: `第 ${p + 1} 顆 y=${o === 4 ? '5+' : o + 1}`, base: x.base, diff: x.rate - x.base, check: n => n.ys[p] != null && Math.min(n.ys[p]!, 5) - 1 === o, event: { kind: 'pos', pos: p, nums: byY[o]! } })
        }
      }
      push('y', best)
    }
    // ⑥ 球位隔期：每顆 × 這期隔期區段 × 已連幾期 > 5 → 下一期這顆從哪一段開出
    {
      let best: Choice | null = null
      for (let p = 0; p < 5; p++) {
        for (let o = 0; o < 4; o++) {
          const x = tPos[p]!.rate(keyPos(s, p), o)
          if (x) best = better(best, { target: `第 ${p + 1} 顆從隔期 ${GAP_BUCKETS[o]} 開出`, base: x.base, diff: x.rate - x.base, check: n => gapBucket(n.gaps[p] ?? null) === o, event: { kind: 'pos', pos: p, nums: byBucket[o]! } })
        }
      }
      push('pos', best)
    }
    // ⑦ 連莊・梯型：狀況 = 有沒有連莊候選、有沒有梯型候選 → 下一期哪一種會開
    {
      let best: Choice | null = null
      const cs = chainSets(s)
      if (cs.all.length) {
        const key = `${cs.rep.length > 0}-${cs.stair.length > 0}`
        const base = chainBase.get(s)!
        const opts: [number, string, (n: Row) => boolean, GuessEvent][] = [
          [0, `連開第 3 期（${cs.rep.map(pad2).join('、')}）`, n => cs.rep.some(x => n.nums.includes(x)), { kind: 'count', nums: cs.rep, min: 1, max: 5 }],
          [1, `梯子走到 ${cs.stair.map(pad2).join('、')}`, n => cs.stair.some(x => n.nums.includes(x)), { kind: 'count', nums: cs.stair, min: 1, max: 5 }],
          [2, `候選號都不開（${cs.all.map(pad2).join('、')}）`, n => !cs.all.some(x => n.nums.includes(x)), { kind: 'count', nums: cs.all, min: 0, max: 0 }]
        ]
        for (const [o, target, check, event] of opts) {
          if ((o === 0 && !cs.rep.length) || (o === 1 && !cs.stair.length)) continue
          const x = tChain.rate(key, o, true)
          if (x) best = better(best, { target, base: base[o]!, diff: x.rate - x.base, check, event })
        }
      }
      push('chain', best)
    }
    // ⑧ 尾數隔期：照目前隔期，下一期開出比例比它自己平常低最多的尾數 → 不開
    {
      let best: Choice | null = null
      let bestRatio = Number.POSITIVE_INFINITY
      for (let d = 0; d < 10; d++) {
        if (tailLast[d]! < 0) continue
        const x = tailRatio(tailCell[d]!, Math.min(s - tailLast[d]!, TAIL_GAP_CAP))
        if (!x || x.ratio >= bestRatio) continue
        bestRatio = x.ratio
        best = { target: `不開尾${d}`, base: 1 - x.own, diff: x.own - x.rate, check: n => !hasTail(n.nums, d), event: { kind: 'count', nums: tailNums([d]), min: 0, max: 0 } }
      }
      push('tail', best)
    }
  }
  return out
}
