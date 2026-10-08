/**
 * 「我的查找」（/scan）計算：使用者每期開獎後的查找方向（2026-10-08 拍板）。
 *
 * 全部是「已開出資料」的查找與次數統計，不做預測：
 *   - 只用選定期（t）以前的資料；需要「下一期」的統計只取下一期也已開出的那幾對。
 *   - 每個比例都同時給「條件成立後」與「平常」（不加條件）及次數 n，樣本少由頁面標示。
 * 規則定義：大/小 = 比上一期大/小、一樣 = 平；第 3 點的位置 = 第幾顆球（號碼小→大）；
 *   y 間隔 = 兩次出現相隔的期數；同尾 = 同一期 2 顆以上個位數相同；20 以上 = 整段加總。
 */
import type { BoardState } from './board-states'

export interface ScanDraw {
  issue: string
  date: string
  /** 五顆主號（升序） */
  nums: number[]
  /** 每顆的隔期 / 值 / 位置 x / 位置 y（順序對應 nums；暖機中為 null） */
  gaps: (number | null)[]
  values: (number | null)[]
  xs: (number | null)[]
  ys: (number | null)[]
}

export interface Rate {
  hit: number
  n: number
}

export type Dir = '大' | '小' | '平'

export const SMALL_SAMPLE = 30

// ---------- 基本 ----------

export const isComplete = (d: ScanDraw): boolean => d.gaps.every(g => g != null) && d.values.every(v => v != null)
export const gapsOf = (d: ScanDraw): number[] => d.gaps.map(g => g ?? 0)
export const valuesOf = (d: ScanDraw): number[] => d.values.map(v => v ?? 0)
export const gapSum = (d: ScanDraw): number => gapsOf(d).reduce((a, b) => a + b, 0)
export const valueSum = (d: ScanDraw): number => valuesOf(d).reduce((a, b) => a + b, 0)
export const tailsOf = (nums: number[]): number[] => [...new Set(nums.map(n => n % 10))].sort((a, b) => a - b)
export const sharedTails = (a: number[], b: number[]): number[] => {
  const tb = new Set(b.map(n => n % 10))
  return tailsOf(a).filter(d => tb.has(d))
}

export function dirOf(prev: number, cur: number): Dir {
  if (cur > prev) return '大'
  if (cur < prev) return '小'
  return '平'
}

/** 暖機期數：前 n 期隔期表還沒填滿、數字系統性偏小，統計時剔除（與 API fieldGuide.warmup 相同） */
export const WARMUP = 60

/** 選定期 t 以前（含）、資料完整的期數索引；size = 只看最近幾期（null = 全部）；minIndex = 剔除暖機 */
export function windowIndices(draws: ScanDraw[], t: number, size: number | null, minIndex = 0): number[] {
  const out: number[] = []
  for (let s = minIndex; s <= t && s < draws.length; s++) {
    if (size != null && s <= t - size) continue
    if (isComplete(draws[s]!)) out.push(s)
  }
  return out
}

/** 範圍內期數的查表集合（同一個 idx 陣列只建一次） */
const setCache = new WeakMap<number[], Set<number>>()
function rangeSet(idx: number[]): Set<number> {
  let set = setCache.get(idx)
  if (!set) {
    set = new Set(idx)
    setCache.set(idx, set)
  }
  return set
}

/** 條件成立後 vs 平常：成對 (s, s+1)，s 在範圍內、s+1 ≤ t（下一期已開出） */
export function conditional(
  idx: number[],
  t: number,
  cond: (s: number) => boolean,
  outcome: (next: number) => boolean
): { cond: Rate, base: Rate } {
  const inRange = rangeSet(idx)
  const res = { cond: { hit: 0, n: 0 }, base: { hit: 0, n: 0 } }
  for (const s of idx) {
    if (s + 1 > t || !inRange.has(s + 1)) continue
    const o = outcome(s + 1)
    res.base.n++
    if (o) res.base.hit++
    if (cond(s)) {
      res.cond.n++
      if (o) res.cond.hit++
    }
  }
  return res
}

/** 從 t 往回數，連續幾期 pred 成立 */
export function trailingCount(idx: number[], t: number, pred: (s: number) => boolean): number {
  const inRange = rangeSet(idx)
  let k = 0
  for (let s = t; inRange.has(s) && pred(s); s--) k++
  return k
}

/** 最近 k 期（s-k+1..s）全部成立；範圍外視為不成立 */
export function lastK(idx: number[], s: number, k: number, pred: (q: number) => boolean): boolean {
  const inRange = rangeSet(idx)
  for (let q = s; q > s - k; q--) {
    if (!inRange.has(q) || !pred(q)) return false
  }
  return true
}

// ---------- 隔期狀態 ----------

export const BUCKETS = [
  { key: 'b05', label: '0～5', min: 0, max: 5 },
  { key: 'b69', label: '6～9', min: 6, max: 9 },
  { key: 'b1019', label: '10～19', min: 10, max: 19 },
  { key: 'b20', label: '20 以上', min: 20, max: Number.POSITIVE_INFINITY }
] as const

export interface SlotView {
  gap: number
  value: number
  nums: number[]
}
export interface BucketView {
  key: string
  label: string
  count: number
  slots: SlotView[]
}

export function boardBuckets(state: BoardState): BucketView[] {
  return BUCKETS.map((b) => {
    const slots: SlotView[] = []
    state.slots.forEach((nums, gap) => {
      if (nums.length > 0 && gap >= b.min && gap <= b.max) slots.push({ gap, value: state.values[gap] ?? 0, nums })
    })
    return { key: b.key, label: b.label, count: slots.reduce((a, s) => a + s.nums.length, 0), slots }
  })
}

export interface GapConfig {
  /** 隔期 0~5 */
  low: number
  /** 隔期 6~9 */
  mid: number
  /** 隔期 10 以上 */
  high: number
}
/** 使用者說的「絕大多數」：0~5 有 2~3、6~9 有 1~2、10 以上 0~1 */
export const CONFIG_NORM = { low: [2, 3], mid: [1, 2], high: [0, 1] } as const

export function gapConfig(gaps: number[]): GapConfig {
  return {
    low: gaps.filter(g => g <= 5).length,
    mid: gaps.filter(g => g >= 6 && g <= 9).length,
    high: gaps.filter(g => g >= 10).length
  }
}

export function configChecks(c: GapConfig): { low: boolean, mid: boolean, high: boolean } {
  const within = (v: number, [a, b]: readonly [number, number]) => v >= a && v <= b
  return { low: within(c.low, CONFIG_NORM.low), mid: within(c.mid, CONFIG_NORM.mid), high: within(c.high, CONFIG_NORM.high) }
}

/** 盤面上隔期 ≥ minGap 的號碼合計 k 顆時（k 以 6 封頂），下一期有沒有開出隔期 ≥ minGap */
export function farCountTable(
  states: BoardState[],
  draws: ScanDraw[],
  idx: number[],
  t: number,
  minGap = 20
): { count: number, n: number, hit: number }[] {
  const rows = new Map<number, { n: number, hit: number }>()
  const inRange = rangeSet(idx)
  for (const s of idx) {
    if (s + 1 > t || !inRange.has(s + 1)) continue
    const st = states[s]
    if (!st) continue
    const c = Math.min(6, st.slots.reduce((a, nums, gap) => a + (gap >= minGap ? nums.length : 0), 0))
    const row = rows.get(c) ?? { n: 0, hit: 0 }
    const hit = gapsOf(draws[s + 1]!).some(g => g >= minGap)
    rows.set(c, { n: row.n + 1, hit: row.hit + (hit ? 1 : 0) })
  }
  return [...rows.entries()].map(([count, r]) => ({ count, ...r })).sort((a, b) => a.count - b.count)
}

export interface ValueItem {
  s: number
  issue: string
  num: number
  value: number
}
/** 近 size 期開出的每顆值，大到小（同值時較新的在前） */
export function recentValues(draws: ScanDraw[], idx: number[], t: number, size: number): ValueItem[] {
  const out: ValueItem[] = []
  for (const s of idx) {
    if (s > t || s <= t - size) continue
    const d = draws[s]!
    d.nums.forEach((num, i) => out.push({ s, issue: d.issue, num, value: d.values[i] ?? 0 }))
  }
  return out.sort((a, b) => b.value - a.value || b.s - a.s)
}

// ---------- 第 1 點：方向 ----------

export function runStats(dirs: Dir[]): { lengths: Record<number, number>, current: { dir: Dir, len: number } | null } {
  const lengths: Record<number, number> = {}
  let cur: Dir | null = null
  let len = 0
  for (const d of dirs) {
    if (d === cur) {
      len++
      continue
    }
    if (cur && cur !== '平') lengths[len] = (lengths[len] ?? 0) + 1
    cur = d
    len = 1
  }
  return { lengths, current: cur ? { dir: cur, len } : null }
}

/** 連 k 期同方向（以 maxK 封頂）之後，下一期續同方向 / 換方向 / 平 */
export function continueTable(dirs: Dir[], maxK = 4): { k: number, n: number, same: number, flip: number, flat: number }[] {
  const rows = Array.from({ length: maxK }, (_, i) => ({ k: i + 1, n: 0, same: 0, flip: 0, flat: 0 }))
  let k = 0
  for (let j = 0; j < dirs.length; j++) {
    const d = dirs[j]!
    k = d !== '平' && j > 0 && dirs[j - 1] === d ? k + 1 : 1
    if (d === '平' || j + 1 >= dirs.length) continue
    const row = rows[Math.min(k, maxK) - 1]!
    const next = dirs[j + 1]!
    row.n++
    if (next === '平') row.flat++
    else if (next === d) row.same++
    else row.flip++
  }
  return rows
}

// ---------- 第 4 點：y 間隔 ----------

export function yIntervals(
  draws: ScanDraw[],
  idx: number[],
  t: number,
  y: number,
  pos: number | null
): { count: number, mean: number | null, max: number | null, current: number | null } {
  const occ = idx.filter(s => s <= t && (pos == null ? draws[s]!.ys.includes(y) : draws[s]!.ys[pos] === y))
  const gaps = occ.slice(1).map((s, i) => s - occ[i]!)
  const last = occ.at(-1)
  return {
    count: occ.length,
    mean: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    max: gaps.length ? Math.max(...gaps) : null,
    current: last == null ? null : t - last
  }
}

// ---------- 第 5～7 點：尾數 ----------

/** 和上一期有同尾的連續期數（目前）與已結束的各段長度 */
export function tailStreak(draws: ScanDraw[], idx: number[], t: number): { current: number, lengths: number[] } {
  const shares = (s: number) => s > 0 && sharedTails(draws[s]!.nums, draws[s - 1]!.nums).length > 0
  const lengths: number[] = []
  let run = 0
  for (const s of idx) {
    if (s > t) break
    if (shares(s)) {
      run++
    } else {
      if (run > 0) lengths.push(run)
      run = 0
    }
  }
  return { current: run, lengths }
}

export type PairNext = 'repeat' | 'other' | 'both' | 'none'
export interface TailPairEvent {
  s: number
  tail: number
  nums: number[]
  /** 下一期：連莊同號 / 不連莊（同尾別的號）/ 兩種都有 / 沒開；下一期還沒開 = null */
  next: PairNext | null
  /** 下一期沒開時，下下期有沒有開出該尾；不適用或還沒開 = null */
  skipHit: boolean | null
}

export function tailPairEvents(draws: ScanDraw[], idx: number[], t: number): TailPairEvent[] {
  const out: TailPairEvent[] = []
  for (const s of idx) {
    if (s > t) break
    const byTail = new Map<number, number[]>()
    draws[s]!.nums.forEach(n => byTail.set(n % 10, [...(byTail.get(n % 10) ?? []), n]))
    for (const [tail, nums] of byTail) {
      if (nums.length < 2) continue
      const sorted = [...nums].sort((a, b) => a - b)
      let next: PairNext | null = null
      let skipHit: boolean | null = null
      if (s + 1 <= t && draws[s + 1]) {
        const n1 = draws[s + 1]!.nums.filter(n => n % 10 === tail)
        const rep = n1.some(n => sorted.includes(n))
        const oth = n1.some(n => !sorted.includes(n))
        next = rep && oth ? 'both' : rep ? 'repeat' : oth ? 'other' : 'none'
        if (next === 'none' && s + 2 <= t && draws[s + 2]) skipHit = draws[s + 2]!.nums.some(n => n % 10 === tail)
      }
      out.push({ s, tail, nums: sorted, next, skipHit })
    }
  }
  return out
}

/** 某尾數在 1~39 的全部號碼 */
export const numbersWithTail = (tail: number, max = 39): number[] =>
  Array.from({ length: max }, (_, i) => i + 1).filter(n => n % 10 === tail)
