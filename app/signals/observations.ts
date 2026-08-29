/**
 * 觀察卡（走勢／頻率型）計算。
 *
 * 與條件燈（rules.ts）不同：觀察卡沒有亮燈與命中判定，只把載入視窗內的
 * 分布、間隔、走勢如實攤開。所有數字都對當前視窗即時計算，不寫死。
 *
 * 六張卡（2026-08-29 使用者指定）：
 *   1. 單雙數分布與走勢
 *   2. 獎號總和（實際開出號碼加總）分布與走勢
 *   3. 尾數：與上期完全無重覆尾的間隔；恰兩顆同尾後下一期的同尾追蹤
 *   4. 隔期分桶（0-5 / 6-10 / 11+）
 *   5. 數值 0～5 出現頻率
 *   6. 數值0 的出現規律
 */

import type { SignalRow } from './types'

const RECENT_STRIP = 20

// ---------- 共用 ----------

export interface DistEntry {
  label: string
  count: number
  pct: number
}

export interface RecentPoint {
  issue: string
  date: string
  text: string
}

function pctOf(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

/** 相鄰方向序列：1 升 / -1 降 / 0 平 */
function directionsOf(vals: number[]): number[] {
  const dirs: number[] = []
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i]! - vals[i - 1]!
    dirs.push(d > 0 ? 1 : d < 0 ? -1 : 0)
  }
  return dirs
}

/** 交替率：相鄰兩步皆非平時，反向的比例 */
function alternationOf(dirs: number[]): { flips: number, pairs: number } {
  let flips = 0
  let pairs = 0
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] === 0 || dirs[i - 1] === 0) continue
    pairs++
    if (dirs[i] !== dirs[i - 1]) flips++
  }
  return { flips, pairs }
}

/** 同向連續步數 run 分布（0 視為中斷） */
function runDistOf(dirs: number[]): DistEntry[] {
  const runs: number[] = []
  let cur = 0
  let curDir = 0
  for (const d of dirs) {
    if (d === 0) {
      if (cur > 0) runs.push(cur)
      cur = 0
      curDir = 0
      continue
    }
    if (d === curDir) {
      cur++
    } else {
      if (cur > 0) runs.push(cur)
      cur = 1
      curDir = d
    }
  }
  if (cur > 0) runs.push(cur)
  const byLen = new Map<number, number>()
  for (const r of runs) byLen.set(r, (byLen.get(r) ?? 0) + 1)
  return [...byLen.keys()].sort((a, b) => a - b).map(len => ({
    label: len === 1 ? '1 步（隔期就反轉）' : `${len} 步（連續 ${len + 1} 期同向）`,
    count: byLen.get(len)!,
    pct: pctOf(byLen.get(len)!, runs.length)
  }))
}

/** 事件 index 序列 → 間隔統計 */
function intervalStats(indices: number[]): { mean: number | null, max: number | null } {
  if (indices.length < 2) return { mean: null, max: null }
  const gaps: number[] = []
  for (let i = 1; i < indices.length; i++) gaps.push(indices[i]! - indices[i - 1]!)
  return {
    mean: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    max: Math.max(...gaps)
  }
}

// ---------- 1. 單雙數 ----------

export interface OddEvenStats {
  dist: DistEntry[]
  alternation: { flips: number, pairs: number }
  recent: RecentPoint[]
}

export function buildOddEven(rows: SignalRow[]): OddEvenStats {
  const oddCounts = rows.map(r => r.prizes.filter(n => n % 2 === 1).length)
  const byCount = new Map<number, number>()
  for (const c of oddCounts) byCount.set(c, (byCount.get(c) ?? 0) + 1)
  const dist: DistEntry[] = []
  for (let c = 0; c <= 5; c++) {
    dist.push({ label: `${c} 單 ${5 - c} 雙`, count: byCount.get(c) ?? 0, pct: pctOf(byCount.get(c) ?? 0, rows.length) })
  }
  return {
    dist,
    alternation: alternationOf(directionsOf(oddCounts)),
    recent: rows.slice(-RECENT_STRIP).map((r, k, arr) => ({
      issue: r.issue,
      date: r.date,
      text: `${oddCounts[rows.length - arr.length + k]}單`
    }))
  }
}

// ---------- 2. 獎號總和 ----------

export interface PrizeSumStats {
  mean: number
  median: number
  min: number
  max: number
  p10: number
  p90: number
  alternation: { flips: number, pairs: number }
  runDist: DistEntry[]
  recent: RecentPoint[]
}

export function buildPrizeSum(rows: SignalRow[]): PrizeSumStats {
  const sums = rows.map(r => r.prizes.reduce((a, b) => a + b, 0))
  const sorted = [...sums].sort((a, b) => a - b)
  const dirs = directionsOf(sums)
  return {
    mean: sums.reduce((a, b) => a + b, 0) / sums.length,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    p10: sorted[Math.floor(sorted.length * 0.1)] ?? 0,
    p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
    alternation: alternationOf(dirs),
    runDist: runDistOf(dirs),
    recent: rows.slice(-RECENT_STRIP).map((r, k, arr) => ({
      issue: r.issue,
      date: r.date,
      text: String(sums[rows.length - arr.length + k])
    }))
  }
}

// ---------- 3. 尾數 ----------

export type TailPairNext = 'pair-carry' | 'pair-fresh' | 'single' | 'none' | 'pending'

export interface TailPairEvent {
  issue: string
  date: string
  tail: number
  nums: number[]
  nextIssue: string | null
  next: TailPairNext
}

export interface TailStats {
  /** 與上一期完全無重覆尾數的事件 */
  noRepeatCount: number
  noRepeatRate: number
  noRepeatIntervalMean: number | null
  noRepeatIntervalMax: number | null
  lastNoRepeat: { issue: string, date: string } | null
  sinceLastNoRepeat: number | null
  /** 恰兩顆同尾事件（≥3 顆同尾不計） */
  pairEvents: TailPairEvent[]
  pairJudged: number
  pairNextPairCarry: number
  pairNextPairFresh: number
  pairNextSingle: number
  pairNextNone: number
}

function tailOf(n: number): number {
  return n % 10
}

export function buildTails(rows: SignalRow[]): TailStats {
  // (a) 與上期完全無重覆尾
  const noRepeatIdx: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const prev = new Set(rows[i - 1]!.prizes.map(tailOf))
    const cur = rows[i]!.prizes.map(tailOf)
    if (cur.every(t => !prev.has(t))) noRepeatIdx.push(i)
  }
  const noRepeatInt = intervalStats(noRepeatIdx)
  const lastIdx = noRepeatIdx.at(-1)

  // (b) 恰兩顆同尾 → 下一期追蹤
  const pairEvents: TailPairEvent[] = []
  for (let i = 0; i < rows.length; i++) {
    const byTail = new Map<number, number[]>()
    for (const n of rows[i]!.prizes) {
      const t = tailOf(n)
      if (!byTail.has(t)) byTail.set(t, [])
      byTail.get(t)!.push(n)
    }
    for (const [tail, nums] of byTail) {
      if (nums.length !== 2) continue
      let next: TailPairNext = 'pending'
      let nextIssue: string | null = null
      const nextRow = rows[i + 1]
      if (nextRow) {
        nextIssue = nextRow.issue
        const nextSame = nextRow.prizes.filter(n => tailOf(n) === tail)
        if (nextSame.length >= 2) {
          next = nextSame.some(n => nums.includes(n)) ? 'pair-carry' : 'pair-fresh'
        } else if (nextSame.length === 1) {
          next = 'single'
        } else {
          next = 'none'
        }
      }
      pairEvents.push({ issue: rows[i]!.issue, date: rows[i]!.date, tail, nums, nextIssue, next })
    }
  }
  const judged = pairEvents.filter(e => e.next !== 'pending')

  return {
    noRepeatCount: noRepeatIdx.length,
    noRepeatRate: pctOf(noRepeatIdx.length, Math.max(1, rows.length - 1)),
    noRepeatIntervalMean: noRepeatInt.mean,
    noRepeatIntervalMax: noRepeatInt.max,
    lastNoRepeat: lastIdx != null ? { issue: rows[lastIdx]!.issue, date: rows[lastIdx]!.date } : null,
    sinceLastNoRepeat: lastIdx != null ? rows.length - 1 - lastIdx : null,
    pairEvents,
    pairJudged: judged.length,
    pairNextPairCarry: judged.filter(e => e.next === 'pair-carry').length,
    pairNextPairFresh: judged.filter(e => e.next === 'pair-fresh').length,
    pairNextSingle: judged.filter(e => e.next === 'single').length,
    pairNextNone: judged.filter(e => e.next === 'none').length
  }
}

// ---------- 4. 隔期分桶 ----------

export interface GapBucketStats {
  /** 全視窗顆數占比 */
  totalDist: DistEntry[]
  /** 每期平均顆數 */
  perPeriodAvg: { low: number, mid: number, high: number }
  /** 每期組成型態（低-中-高）分布，取前 6 */
  topPatterns: DistEntry[]
  recent: RecentPoint[]
}

const GAP_LOW_MAX = 5
const GAP_MID_MAX = 10

function bucketsOf(r: SignalRow): { low: number, mid: number, high: number } {
  let low = 0
  let mid = 0
  let high = 0
  for (const g of r.gaps) {
    if (g <= GAP_LOW_MAX) low++
    else if (g <= GAP_MID_MAX) mid++
    else high++
  }
  return { low, mid, high }
}

export function buildGapBuckets(rows: SignalRow[]): GapBucketStats {
  const valid = rows.filter(r => r.valid)
  let low = 0
  let mid = 0
  let high = 0
  const patterns = new Map<string, number>()
  for (const r of valid) {
    const b = bucketsOf(r)
    low += b.low
    mid += b.mid
    high += b.high
    const key = `${b.low}-${b.mid}-${b.high}`
    patterns.set(key, (patterns.get(key) ?? 0) + 1)
  }
  const totalNums = valid.length * 5
  const topPatterns = [...patterns.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => ({ label: key, count, pct: pctOf(count, valid.length) }))
  return {
    totalDist: [
      { label: `0-${GAP_LOW_MAX}`, count: low, pct: pctOf(low, totalNums) },
      { label: `${GAP_LOW_MAX + 1}-${GAP_MID_MAX}`, count: mid, pct: pctOf(mid, totalNums) },
      { label: `${GAP_MID_MAX + 1}+`, count: high, pct: pctOf(high, totalNums) }
    ],
    perPeriodAvg: {
      low: valid.length > 0 ? low / valid.length : 0,
      mid: valid.length > 0 ? mid / valid.length : 0,
      high: valid.length > 0 ? high / valid.length : 0
    },
    topPatterns,
    recent: valid.slice(-RECENT_STRIP).map((r) => {
      const b = bucketsOf(r)
      return { issue: r.issue, date: r.date, text: `${b.low}-${b.mid}-${b.high}` }
    })
  }
}

// ---------- 5. 數值 0～5 頻率 ----------

export interface ValueFreqStats {
  totalNums: number
  freqs: DistEntry[]
}

export function buildValueFreq(rows: SignalRow[]): ValueFreqStats {
  const all = rows.filter(r => r.valid).flatMap(r => r.values)
  const freqs: DistEntry[] = []
  for (let v = 0; v <= 5; v++) {
    const count = all.filter(x => x === v).length
    freqs.push({ label: String(v), count, pct: pctOf(count, all.length) })
  }
  const over = all.filter(x => x > 5).length
  freqs.push({ label: '>5', count: over, pct: pctOf(over, all.length) })
  return { totalNums: all.length, freqs }
}

// ---------- 6. 數值0 規律 ----------

export interface ValueZeroStats {
  /** 期含至少一顆數值0 的比例 */
  periodsWithZeroRate: number
  periodsWithZero: number
  totalPeriods: number
  /** 每期數值0 顆數分布 */
  countDist: DistEntry[]
  /** 無數值0 的期之間隔 */
  noZeroCount: number
  noZeroIntervalMean: number | null
  noZeroIntervalMax: number | null
  lastNoZero: { issue: string, date: string } | null
  sinceLastNoZero: number | null
  /** 連續「有數值0」的最長連段與目前連段 */
  maxZeroStreak: number
  currentZeroStreak: number
  recent: RecentPoint[]
}

export function buildValueZero(rows: SignalRow[]): ValueZeroStats {
  const valid = rows.filter(r => r.valid)
  const zeroCounts = valid.map(r => r.values.filter(v => v === 0).length)
  const byCount = new Map<number, number>()
  for (const c of zeroCounts) byCount.set(c, (byCount.get(c) ?? 0) + 1)
  const countDist = [...byCount.keys()].sort((a, b) => a - b).map(c => ({
    label: `${c} 顆`,
    count: byCount.get(c)!,
    pct: pctOf(byCount.get(c)!, valid.length)
  }))

  const noZeroIdx: number[] = []
  zeroCounts.forEach((c, i) => {
    if (c === 0) noZeroIdx.push(i)
  })
  const noZeroInt = intervalStats(noZeroIdx)
  const lastIdx = noZeroIdx.at(-1)

  let maxStreak = 0
  let cur = 0
  for (const c of zeroCounts) {
    if (c > 0) {
      cur++
      maxStreak = Math.max(maxStreak, cur)
    } else {
      cur = 0
    }
  }

  return {
    periodsWithZeroRate: pctOf(zeroCounts.filter(c => c > 0).length, valid.length),
    periodsWithZero: zeroCounts.filter(c => c > 0).length,
    totalPeriods: valid.length,
    countDist,
    noZeroCount: noZeroIdx.length,
    noZeroIntervalMean: noZeroInt.mean,
    noZeroIntervalMax: noZeroInt.max,
    lastNoZero: lastIdx != null ? { issue: valid[lastIdx]!.issue, date: valid[lastIdx]!.date } : null,
    sinceLastNoZero: lastIdx != null ? valid.length - 1 - lastIdx : null,
    maxZeroStreak: maxStreak,
    currentZeroStreak: cur,
    recent: valid.slice(-RECENT_STRIP).map((r, k, arr) => ({
      issue: r.issue,
      date: r.date,
      text: `${zeroCounts[valid.length - arr.length + k]}顆0`
    }))
  }
}
