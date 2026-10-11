/**
 * 「我的查找」（/scan）共用：逐期資料型別、暖機期數、同尾對事件。
 * 2026-10-11 /scan 整頁重做成八點（shared/lotto/scan/points），舊七點的查找函式已移除。
 */

export interface ScanDraw {
  issue: string
  date: string
  /** 五顆主號（升序） */
  nums: number[]
  /** 每顆的隔期 / 值 / 位置 x / 位置 y（順序對應 nums；暖機中或超出表格為 null） */
  gaps: (number | null)[]
  values: (number | null)[]
  xs: (number | null)[]
  ys: (number | null)[]
}

export const isComplete = (d: ScanDraw): boolean => d.gaps.every(g => g != null) && d.values.every(v => v != null)
export const gapSum = (d: ScanDraw): number => d.gaps.reduce<number>((a, g) => a + (g ?? 0), 0)
export const valueSum = (d: ScanDraw): number => d.values.reduce<number>((a, v) => a + (v ?? 0), 0)
export const tailsOf = (nums: number[]): number[] => [...new Set(nums.map(n => n % 10))].sort((a, b) => a - b)

/** 暖機期數：前 n 期隔期表還沒填滿、數字系統性偏小，統計時剔除（與 API fieldGuide.warmup 相同） */
export const WARMUP = 60

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
