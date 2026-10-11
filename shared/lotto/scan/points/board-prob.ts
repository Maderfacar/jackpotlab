/**
 * 照「該期盤面」精確算出下一期某件事發生的機率（2026-10-12 使用者：平常本來就應該以該期盤面來推導）。
 *
 * 前提：下一期 5 顆從 1～39 隨機開出（20 年驗證：照盤面算的機率與實際差距在 1～1.6 個百分點內）。
 * 每顆號碼如果下一期開出，它的隔期 / 值 / y 在開獎前就由盤面決定，所以每件事都能直接算，不用列舉組合。
 */
import type { BoardState } from '../board-states'

const TOTAL = 39
const PICK = 5

/** 盤面上每顆號碼「如果下一期開出」會帶的隔期、值、y；不在表格裡（超出 60 格）為 null */
export interface NumberInfo {
  gap: number | null
  value: number | null
  y: number | null
}

/** index = 號碼（1～39），0 不用 */
export function boardInfo(state: BoardState): NumberInfo[] {
  const out: NumberInfo[] = Array.from({ length: TOTAL + 1 }, () => ({ gap: null, value: null, y: null }))
  state.slots.forEach((nums, gap) => {
    nums.forEach((n, i) => {
      out[n] = { gap, value: state.values[gap] ?? 0, y: i + 1 }
    })
  })
  return out
}

/** 下一期要猜的事（只描述「哪一群號碼」，機率由盤面算） */
export type GuessEvent
  /** 開出的 5 顆裡，落在 nums 的顆數介於 min～max */
  = | { kind: 'count', nums: number[], min: number, max: number }
  /** 由小到大第 pos 顆（0 起算）是 nums 其中一顆 */
    | { kind: 'pos', pos: number, nums: number[] }
  /** 下一期隔期和 跟 cur 比：小 / 大 / 一樣 */
    | { kind: 'gapsum', cur: number, want: 'lt' | 'gt' | 'eq' }

/** 組合數 C(n, k) */
function C(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}
const ALL = C(TOTAL, PICK)

/** 一群 K 顆號碼，下一期剛好開出 x 顆的機率 */
export function hyper(K: number, x: number): number {
  return (C(K, x) * C(TOTAL - K, PICK - x)) / ALL
}

/** 第 pos 小（0 起算）剛好是號碼 n 的機率：前面 pos 顆比 n 小、後面比 n 大 */
function posProb(n: number, pos: number): number {
  return (C(n - 1, pos) * C(TOTAL - n, PICK - 1 - pos)) / ALL
}

/** 5 顆隔期加總的分佈（null 算 0，和網站的隔期和一樣）：dp[c][sum] = 選 c 顆、總和 sum 的組合數 */
function gapSumDist(info: NumberInfo[]): number[] {
  const weights = info.slice(1).map(x => x.gap ?? 0)
  const maxSum = [...weights].sort((a, b) => b - a).slice(0, PICK).reduce((a, b) => a + b, 0)
  const dp: Float64Array[] = Array.from({ length: PICK + 1 }, () => new Float64Array(maxSum + 1))
  dp[0]![0] = 1
  // 背包式累加：顆數由大到小、總和由大到小，同一顆號碼不會被用兩次
  for (const w of weights) {
    for (let c = PICK - 1; c >= 0; c--) {
      const from = dp[c]!
      const to = dp[c + 1]!
      for (let s = maxSum - w; s >= 0; s--) {
        const v = from[s]!
        if (v) to[s + w]! += v
      }
    }
  }
  return Array.from(dp[PICK]!, v => v / ALL)
}

/** 同一期盤面算過的隔期和分佈留著重用 */
const sumCache = new WeakMap<NumberInfo[], number[]>()

export function probability(info: NumberInfo[], ev: GuessEvent): number {
  if (ev.kind === 'count') {
    const K = new Set(ev.nums).size
    let p = 0
    for (let x = ev.min; x <= Math.min(ev.max, PICK); x++) p += hyper(K, x)
    return p
  }
  if (ev.kind === 'pos') {
    return [...new Set(ev.nums)].reduce((a, n) => a + posProb(n, ev.pos), 0)
  }
  let dist = sumCache.get(info)
  if (!dist) {
    dist = gapSumDist(info)
    sumCache.set(info, dist)
  }
  let p = 0
  dist.forEach((q, s) => {
    if ((ev.want === 'lt' && s < ev.cur) || (ev.want === 'gt' && s > ev.cur) || (ev.want === 'eq' && s === ev.cur)) p += q
  })
  return p
}

/** 方便：盤面上符合條件的號碼 */
export const numbersWhere = (info: NumberInfo[], pred: (x: NumberInfo, n: number) => boolean): number[] =>
  info.flatMap((x, n) => (n >= 1 && pred(x, n) ? [n] : []))

/** 這件事在實際開出的號碼上有沒有發生（用來核對：event 描述的必須和判定說中的是同一件事） */
export function eventHappened(info: NumberInfo[], ev: GuessEvent, drawn: number[]): boolean {
  const nums = [...drawn].sort((a, b) => a - b)
  if (ev.kind === 'count') {
    const k = nums.filter(n => ev.nums.includes(n)).length
    return k >= ev.min && k <= ev.max
  }
  if (ev.kind === 'pos') return ev.nums.includes(nums[ev.pos]!)
  const s = nums.reduce((a, n) => a + (info[n]!.gap ?? 0), 0)
  return ev.want === 'lt' ? s < ev.cur : ev.want === 'gt' ? s > ev.cur : s === ev.cur
}
