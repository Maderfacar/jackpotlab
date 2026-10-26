/**
 * 一頁總覽：號碼之間（2026-10-27 對話中問過的完整重覆、4 碼重覆，以及建議的「牽引」）。
 */
import type { OverviewDraw } from './coords'

const keyOf = (nums: number[]) => [...nums].sort((a, b) => a - b).join(',')

/** 從 5 顆裡選 k 顆的所有組合（升序） */
export function combos(nums: number[], k: number): number[][] {
  const s = [...nums].sort((a, b) => a - b)
  const out: number[][] = []
  const pick = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push(acc)
      return
    }
    for (let i = start; i < s.length; i++) pick(i + 1, [...acc, s[i]!])
  }
  pick(0, [])
  return out
}

export interface Repeat {
  nums: number[]
  /** 開出的期索引（舊 → 新） */
  at: number[]
}

/** k 顆一起開出的組合，出現 ≥ minTimes 期的（k = 5 就是整組完全重覆） */
export function groupRepeats(draws: OverviewDraw[], k: number, minTimes = 2): Repeat[] {
  const m = new Map<string, number[]>()
  draws.forEach((d, i) => {
    for (const c of k === 5 ? [d.nums] : combos(d.nums, k)) {
      const key = keyOf(c)
      const list = m.get(key)
      if (list) list.push(i)
      else m.set(key, [i])
    }
  })
  return [...m.entries()]
    .filter(([, at]) => at.length >= minTimes)
    .map(([key, at]) => ({ nums: key.split(',').map(Number), at }))
}

/** 次數多的在前，一樣多的最近開過的在前 */
export function byTimes(list: Repeat[]): Repeat[] {
  return [...list].sort((a, b) => b.at.length - a.at.length || b.at.at(-1)! - a.at.at(-1)!)
}

export interface Overlap {
  /** 最多同幾顆 */
  most: number
  /** 同那麼多顆的期索引（新 → 舊） */
  at: number[]
}

/** 最新一期跟以前每一期比，最多同幾顆 */
export function latestOverlap(draws: OverviewDraw[]): Overlap {
  const last = draws.at(-1)
  if (!last) return { most: 0, at: [] }
  const set = new Set(last.nums)
  let most = 0
  let at: number[] = []
  for (let i = draws.length - 2; i >= 0; i--) {
    const c = draws[i]!.nums.filter(n => set.has(n)).length
    if (c > most) {
      most = c
      at = [i]
    } else if (c === most) {
      at.push(i)
    }
  }
  return { most, at }
}

export interface Follow {
  num: number
  /** 這顆以前開出過幾期（有下一期的） */
  times: number
  /** 下一期最常跟著出現的號碼與次數 */
  top: { num: number, count: number }[]
}

/** 牽引：某顆號碼開出後，下一期哪些號碼最常出現 */
export function follows(draws: OverviewDraw[], nums: number[], topN = 5): Follow[] {
  return nums.map((num) => {
    const counts = new Map<number, number>()
    let times = 0
    for (let i = 0; i < draws.length - 1; i++) {
      if (!draws[i]!.nums.includes(num)) continue
      times += 1
      for (const n of draws[i + 1]!.nums) counts.set(n, (counts.get(n) ?? 0) + 1)
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, topN)
      .map(([n, count]) => ({ num: n, count }))
    return { num, times, top }
  })
}

/** 每年幾次（用期索引對到開獎日的年份） */
export function perYear(draws: OverviewDraw[], indices: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of indices) {
    const y = draws[i]!.date.slice(0, 4)
    out[y] = (out[y] ?? 0) + 1
  }
  return out
}
