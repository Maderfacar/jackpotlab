/**
 * 時間分段：找「比例突然改變、而且改了以後一直維持」的日期（2026-11-09 使用者：當成換機台、改程式、換營運商的可疑線索）。
 *
 * 做法（我補的設定，頁面上都寫明）：
 *   - 每一項指標（某位置 0～9 的比例、第幾新的比例、相鄰兩位相同、四碼樣子、三星和四星同晚的關係…）各自看。
 *   - 每個月第一期當候選切點，比較切點前 WINDOW 期和後 WINDOW 期的比例差多少（差異分數）。
 *     前後各比 WINDOW 期，只變一下又回來的不會被算進去。
 *   - 同一項指標把整段歷史的順序打亂 SHUFFLES 次，每次都算一遍「最大差異分數」；
 *     實際的分數比打亂後的每一次都大，才算可疑。
 *   - 不同指標在 GROUP_GAP 期以內的可疑點併成同一個可疑日期。
 */
import { WARMUP, shapeOf, type DrawStep } from './state'
import type { DigitPlainDraw } from '../digit-history'

export const WINDOW = 600
export const SHUFFLES = 30
export const GROUP_GAP = 120

interface Indicator {
  key: string
  label: string
  cats: string[]
  /** 每期的類別（-1 = 不算） */
  values: Int8Array
}

export interface Flag {
  key: string
  label: string
  t: number
  date: string
  /** 實際分數 ÷ 打亂後最大分數；大於 1 才會被列出 */
  strength: number
  /** 變最多的那一類 */
  cat: string
  before: number
  after: number
}

export interface SuspectDate {
  t: number
  date: string
  flags: Flag[]
}

export interface SegmentResult {
  indicators: { key: string, label: string }[]
  suspects: SuspectDate[]
}

function indicatorsOf(steps: DrawStep[], d3: DigitPlainDraw[]): Indicator[] {
  const n = steps.length
  const make = (key: string, label: string, cats: string[], f: (s: DrawStep, t: number) => number): Indicator => {
    const values = new Int8Array(n).fill(-1)
    for (let t = WARMUP; t < n; t++) values[t] = f(steps[t]!, t)
    return { key, label, cats, values }
  }
  const P = ['千位', '百位', '十位', '個位']
  const digitCats = Array.from({ length: 10 }, (_, k) => `數字 ${k}`)
  const rankCats = Array.from({ length: 10 }, (_, k) => `第 ${k} 新`)
  const by3 = new Map(d3.map(d => [d.issue, d.digits]))
  const out: Indicator[] = [
    ...P.map((p, i) => make(`d-${i}`, `四星${p}開出的數字`, digitCats, s => s.digits[i]!)),
    ...P.map((p, i) => make(`r-${i}`, `四星${p}開到第幾新`, rankCats, s => s.pos[i]!.rank)),
    ...[0, 1, 2].map(i => make(`adj-${i}`, `四星${P[i]}和${P[i + 1]}一樣`, ['不一樣', '一樣'], s => (s.digits[i] === s.digits[i + 1] ? 1 : 0))),
    make('shape', '四星四碼樣子', ['四個都不同', '一對', '兩對／三條／四條'], (s) => {
      const sh = shapeOf(s.digits)
      return sh === 'distinct' ? 0 : sh === 'pair' ? 1 : 2
    })
  ]
  if (by3.size) {
    const P3 = ['百位', '十位', '個位']
    out.push(...P3.map((p, i) => make(`d3-${i}`, `三星${p}開出的數字`, digitCats, (s) => {
      const x = by3.get(s.issue)
      return x ? x[i]! : -1
    })))
    out.push(make('m34', '三星和四星同晚：後三碼同位置一樣幾位', ['0 位', '1 位', '2 位以上'], (s) => {
      const x = by3.get(s.issue)
      if (!x) return -1
      const same = [0, 1, 2].filter(i => x[i] === s.digits[i + 1]).length
      return Math.min(same, 2)
    }))
  }
  return out
}

/** 決定性的亂數（每次打開頁面結果都一樣） */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** 每個候選切點（壓縮後的位置）的差異分數 */
function scores(vals: Int8Array | number[], K: number, cands: number[]): Float64Array {
  const n = vals.length
  const pre = new Int32Array((n + 1) * K)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < K; k++) pre[(i + 1) * K + k] = pre[i * K + k]!
    pre[(i + 1) * K + vals[i]!]!++
  }
  const out = new Float64Array(cands.length)
  cands.forEach((c, j) => {
    let s = 0
    for (let k = 0; k < K; k++) {
      const a = pre[c * K + k]! - pre[(c - WINDOW) * K + k]!
      const b = pre[(c + WINDOW) * K + k]! - pre[c * K + k]!
      if (a + b > 0) s += (a - b) ** 2 / (a + b)
    }
    out[j] = s
  })
  return out
}

function flagsOf(ind: Indicator, steps: DrawStep[], seed: number): Flag[] {
  const ts: number[] = []
  const vals: number[] = []
  ind.values.forEach((v, t) => {
    if (v >= 0) {
      ts.push(t)
      vals.push(v)
    }
  })
  const K = ind.cats.length
  // 候選：每個月第一期，前後都要有 WINDOW 期
  const cands: number[] = []
  for (let i = WINDOW; i + WINDOW <= ts.length; i++) {
    if (steps[ts[i]!]!.date.slice(0, 7) !== steps[ts[i - 1]!]!.date.slice(0, 7)) cands.push(i)
  }
  if (!cands.length) return []
  const real = scores(vals, K, cands)
  const rand = rng(seed)
  let threshold = 0
  const shuffled = [...vals]
  for (let r = 0; r < SHUFFLES; r++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    threshold = Math.max(threshold, ...scores(shuffled, K, cands))
  }
  const flags: Flag[] = []
  cands.forEach((c, j) => {
    const s = real[j]!
    if (s <= threshold) return
    // 前後 WINDOW/2 期內最高的才算（同一次改變只留一個點）
    const peak = cands.every((c2, j2) => Math.abs(c2 - c) > WINDOW / 2 || real[j2]! <= s)
    if (!peak) return
    let best = 0
    let bestDiff = -1
    let before = 0
    let after = 0
    for (let k = 0; k < K; k++) {
      let a = 0
      let b = 0
      for (let i = c - WINDOW; i < c; i++) if (vals[i] === k) a++
      for (let i = c; i < c + WINDOW; i++) if (vals[i] === k) b++
      if (Math.abs(a - b) > bestDiff) {
        bestDiff = Math.abs(a - b)
        best = k
        before = a / WINDOW
        after = b / WINDOW
      }
    }
    const t = ts[c]!
    flags.push({ key: ind.key, label: ind.label, t, date: steps[t]!.date, strength: s / threshold, cat: ind.cats[best]!, before, after })
  })
  return flags
}

export function findSegments(steps: DrawStep[], d3: DigitPlainDraw[]): SegmentResult {
  const inds = indicatorsOf(steps, d3)
  const flags = inds.flatMap((ind, i) => flagsOf(ind, steps, 1000 + i)).sort((a, b) => a.t - b.t)
  const groups: Flag[][] = []
  for (const f of flags) {
    const g = groups.at(-1)
    if (g && f.t - g[0]!.t <= GROUP_GAP) g.push(f)
    else groups.push([f])
  }
  const suspects = groups.map((g) => {
    const top = g.reduce((a, b) => (b.strength > a.strength ? b : a))
    return { t: top.t, date: top.date, flags: [...g].sort((a, b) => b.strength - a.strength) }
  })
  return { indicators: inds.map(i => ({ key: i.key, label: i.label })), suspects }
}

/** 依可疑日期切段：[起, 迄)（t） */
export function segmentBounds(suspects: SuspectDate[], n: number): { from: number, to: number }[] {
  const cuts = suspects.map(s => s.t).filter(t => t > WARMUP && t < n)
  const edges = [WARMUP, ...cuts, n]
  return edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1]! }))
}
