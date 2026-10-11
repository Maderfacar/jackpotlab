/**
 * /scan 八點的共用統計：亮燈後成真 vs 平常、亮燈條、相吸相斥、每期幾點成真、存摺、狀況的隔期。
 * 選定第 t 期時，只用「下一期也已開出（≤ t）」的期數算比例。
 */
import { WARMUP } from '../scan'
import { POINT_KEYS, type PointEval, type PointKey } from './evaluate'
import type { Row } from './rows'

export type Evals = Record<PointKey, PointEval[]>

export interface PointSummary {
  /** 亮燈過、而且下一期已開出的期數 */
  n: number
  hit: number
  /** 平常：照每一期盤面算出「本來該有」的機率，對同一批期數平均（沒有盤面機率時退回舊的 20 年平均） */
  base: number | null
}

/** 亮燈後成真 vs 平常：s 在 [WARMUP, t-1] */
export function summarize(ev: Evals, t: number): Record<PointKey, PointSummary> {
  const out = {} as Record<PointKey, PointSummary>
  for (const k of POINT_KEYS) {
    let n = 0
    let hit = 0
    let baseSum = 0
    let baseN = 0
    for (let s = WARMUP; s < t; s++) {
      const e = ev[k][s]!
      if (!e.lit || e.hit == null) continue
      n++
      if (e.hit) hit++
      const b = e.bp ?? e.base
      if (b != null) {
        baseSum += b
        baseN++
      }
    }
    out[k] = { n, hit, base: baseN ? baseSum / baseN : null }
  }
  return out
}

export interface StripCell {
  s: number
  issue: string
  lit: boolean
  /** 下一期成真（下一期在 t 之後或還沒開 = null） */
  hit: boolean | null
}

/** 亮燈條：最近 size 期 × 八點 */
export function strip(ev: Evals, rows: Row[], t: number, size: number): Record<PointKey, StripCell[]> {
  const from = Math.max(WARMUP, t - size + 1)
  const out = {} as Record<PointKey, StripCell[]>
  for (const k of POINT_KEYS) {
    out[k] = []
    for (let s = from; s <= t; s++) {
      const e = ev[k][s]!
      out[k].push({ s, issue: rows[s]!.issue, lit: e.lit, hit: s < t ? e.hit : null })
    }
  }
  return out
}

export interface PairCell {
  /** 兩點同一期都亮 */
  litBoth: number
  /** 照各自亮燈頻率，本來該一起亮幾次 */
  litExpected: number
  /** 兩點都亮、下一期已開出的期數 */
  n: number
  /** 其中兩點都成真 */
  hitBoth: number
  /** 照各自成真率，本來該一起成真幾次 */
  hitExpected: number
}

/** 相吸相斥：兩兩一組。實際 / 本來該有 > 1 = 相吸，< 1 = 相斥 */
export function pairMatrix(ev: Evals, t: number): PairCell[][] {
  const total = Math.max(0, t - WARMUP)
  const litN = POINT_KEYS.map(k => countRange(t, s => ev[k][s]!.lit))
  const sum = summarize(ev, t)
  const rate = POINT_KEYS.map(k => (sum[k].n ? sum[k].hit / sum[k].n : 0))
  return POINT_KEYS.map((ki, i) => POINT_KEYS.map((kj, j) => {
    let litBoth = 0
    let n = 0
    let hitBoth = 0
    for (let s = WARMUP; s < t; s++) {
      const a = ev[ki][s]!
      const b = ev[kj][s]!
      if (!a.lit || !b.lit) continue
      litBoth++
      if (a.hit == null || b.hit == null) continue
      n++
      if (a.hit && b.hit) hitBoth++
    }
    return {
      litBoth,
      litExpected: total ? (litN[i]! * litN[j]!) / total : 0,
      n,
      hitBoth,
      hitExpected: n * rate[i]! * rate[j]!
    }
  }))
}

function countRange(t: number, pred: (s: number) => boolean): number {
  let c = 0
  for (let s = WARMUP; s < t; s++) if (pred(s)) c++
  return c
}

export interface AllTrueRow {
  /** 同一期亮幾點 */
  lit: number
  /** 這種期數有幾期 */
  n: number
  /** 亮的全部成真 */
  allTrue: number
  /** 照各點成真率相乘，本來該全部成真的期數 */
  expected: number
  /** 成真點數分佈（index = 成真幾點） */
  hits: number[]
}

/** 同一期亮 k 點時，下一期成真幾點；全部成真的實際 vs 照相乘該有的 */
export function allTrueTable(ev: Evals, t: number): AllTrueRow[] {
  const sum = summarize(ev, t)
  const rate = Object.fromEntries(POINT_KEYS.map(k => [k, sum[k].n ? sum[k].hit / sum[k].n : 0])) as Record<PointKey, number>
  const rows: AllTrueRow[] = Array.from({ length: POINT_KEYS.length + 1 }, (_, lit) => ({ lit, n: 0, allTrue: 0, expected: 0, hits: new Array<number>(lit + 1).fill(0) }))
  for (let s = WARMUP; s < t; s++) {
    const lit = POINT_KEYS.filter(k => ev[k][s]!.lit)
    if (lit.some(k => ev[k][s]!.hit == null)) continue
    const row = rows[lit.length]!
    const h = lit.filter(k => ev[k][s]!.hit).length
    row.n++
    row.hits[h]!++
    if (h === lit.length) row.allTrue++
    row.expected += lit.reduce((p, k) => p * rate[k], 1)
  }
  return rows.filter(r => r.n > 0)
}

/** 存摺：最近 size 期，每期（實際 − 平常）一路累加；平常 = [WARMUP, t] 的平均 */
export function ledger(rows: Row[], t: number, size: number, f: (r: Row, s: number) => number): { mean: number, values: number[], points: { s: number, issue: string, total: number }[] } {
  let sum = 0
  let cnt = 0
  for (let s = WARMUP; s <= t; s++) {
    sum += f(rows[s]!, s)
    cnt++
  }
  const mean = cnt ? sum / cnt : 0
  const from = Math.max(WARMUP, t - size + 1)
  let total = 0
  const points: { s: number, issue: string, total: number }[] = []
  const values: number[] = []
  for (let s = from; s <= t; s++) {
    const v = f(rows[s]!, s)
    values.push(v)
    total += v - mean
    points.push({ s, issue: rows[s]!.issue, total })
  }
  return { mean, values, points }
}

export interface IntervalStats {
  /** 出現幾期 */
  count: number
  /** 平均隔幾期出現一次 */
  mean: number | null
  /** 最長隔過幾期 */
  max: number | null
  /** 現在已經隔幾期沒出現（上次出現距 t 幾期；從沒出現 = null） */
  current: number | null
}

/** 某種狀況的隔期（B）：s 在 [WARMUP, t] */
export function intervalStats(t: number, occ: (s: number) => boolean): IntervalStats {
  let last = -1
  let count = 0
  let gapSum = 0
  let gaps = 0
  let max: number | null = null
  for (let s = WARMUP; s <= t; s++) {
    if (!occ(s)) continue
    count++
    if (last >= 0) {
      const g = s - last
      gapSum += g
      gaps++
      max = max == null ? g : Math.max(max, g)
    }
    last = s
  }
  return { count, mean: gaps ? gapSum / gaps : null, max, current: last < 0 ? null : t - last }
}
