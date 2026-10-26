/**
 * 回拉的力道和速度（2026-10-27 使用者：盤面「還在挖」第 3 項）。
 *
 * 一串數字（某一顆的隔期／值、隔期和、總和…）衝到歷史高處（≥ p90）或低處（≤ p10）算「出去一趟」，
 * 之後第一次回到中位數（高處回到 ≤ p50、低處回到 ≥ p50）算「拉回」。
 * - 速度：出去那期到拉回那期隔幾期
 * - 力道：出去的下一期變了多少，以及那一期拉回了「到中位數的距離」的幾成
 * 一趟還沒拉回前又碰到高處，算同一趟。最後一趟還沒拉回 = 目前還在外面。
 */
import { spread, type Spread } from './position'

export type Side = 'high' | 'low'

export interface Trip {
  side: Side
  /** 出去那期的索引 */
  start: number
  /** 拉回那期的索引；還沒拉回為 null */
  end: number | null
  startValue: number
  /** 出去的下一期數字（還沒開為 null） */
  nextValue: number | null
}

/** 拉回幾期的分組：1、2、3、4~5、6~9、10 以上 */
export const RETURN_GROUPS = [
  { label: '1 期', min: 1, max: 1 },
  { label: '2 期', min: 2, max: 2 },
  { label: '3 期', min: 3, max: 3 },
  { label: '4~5', min: 4, max: 5 },
  { label: '6~9', min: 6, max: 9 },
  { label: '10+', min: 10, max: Number.POSITIVE_INFINITY }
] as const

export function returnGroup(len: number): number {
  return RETURN_GROUPS.findIndex(g => len >= g.min && len <= g.max)
}

export function trips(values: readonly (number | null)[], band: Spread): Trip[] {
  const out: Trip[] = []
  if (band.p90 <= band.p50 && band.p10 >= band.p50) return out
  let open: Trip | null = null
  values.forEach((v, i) => {
    if (v == null) return
    if (open) {
      const back = open.side === 'high' ? v <= band.p50 : v >= band.p50
      if (!back) return
      open.end = i
      open = null
      // 拉回的這一期本身可能就衝到另一端（例：高處直接掉到 0），接著算新的一趟
    }
    const side: Side | null = band.p90 > band.p50 && v >= band.p90 ? 'high' : band.p10 < band.p50 && v <= band.p10 ? 'low' : null
    if (!side) return
    open = { side, start: i, end: null, startValue: v, nextValue: values[i + 1] ?? null }
    out.push(open)
  })
  return out
}

export interface SideStats {
  /** 以前拉回的趟數 */
  count: number
  /** 拉回期數落在 RETURN_GROUPS 各組的趟數 */
  groups: number[]
  /** 拉回期數的中位數 */
  medianLen: number | null
  /** 下一期平均變多少（高處多半是負的） */
  avgNextMove: number | null
  /** 下一期拉回了到中位數距離的幾成（平均，0～1 以上，超過 1 = 一次衝過頭） */
  avgNextShare: number | null
}

function sideStats(all: Trip[], side: Side, band: Spread): SideStats {
  const done = all.filter(t => t.side === side && t.end != null)
  const lens = done.map(t => t.end! - t.start).sort((a, b) => a - b)
  const groups = RETURN_GROUPS.map(() => 0)
  for (const l of lens) groups[returnGroup(l)]! += 1
  const moved = all.filter(t => t.side === side && t.nextValue != null && t.startValue !== band.p50)
  const moves = moved.map(t => t.nextValue! - t.startValue)
  const shares = moved.map(t => (t.startValue - t.nextValue!) / (t.startValue - band.p50))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return { count: done.length, groups, medianLen: lens.length ? lens[Math.floor((lens.length - 1) / 2)]! : null, avgNextMove: avg(moves), avgNextShare: avg(shares) }
}

export interface Ongoing {
  side: Side
  start: number
  /** 出去之後已經過了幾期（出去那期 = 0） */
  elapsed: number
  /** 以前同一邊、撐過這麼多期還沒拉回的趟數 */
  survived: number
  /** 那些趟再過幾期拉回（RETURN_GROUPS 分組） */
  remaining: number[]
}

export interface Pullback {
  band: Spread
  current: number | null
  /** 目前數字在歷史裡排第幾個百分位（0～100，小於它的比例） */
  rank: number | null
  trips: Trip[]
  high: SideStats
  low: SideStats
  ongoing: Ongoing | null
}

export function pullback(values: readonly (number | null)[]): Pullback | null {
  const known = values.filter((v): v is number => v != null)
  const band = spread(known)
  if (!band) return null
  const all = trips(values, band)
  const last = values.length - 1
  const current = values[last] ?? null
  const rank = current == null ? null : Math.round((known.filter(v => v < current).length / known.length) * 100)
  const tail = all.at(-1)
  let ongoing: Ongoing | null = null
  if (tail && tail.end == null) {
    const elapsed = last - tail.start
    const past = all.filter(t => t.side === tail.side && t.end != null && t.end - t.start > elapsed)
    const remaining = RETURN_GROUPS.map(() => 0)
    for (const t of past) remaining[returnGroup(t.end! - t.start - elapsed)]! += 1
    ongoing = { side: tail.side, start: tail.start, elapsed, survived: past.length, remaining }
  }
  return { band, current, rank, trips: all, high: sideStats(all, 'high', band), low: sideStats(all, 'low', band), ongoing }
}
