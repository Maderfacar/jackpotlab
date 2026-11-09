/**
 * 歷史分佈：每個位置開到第幾新、開出的數字、開出時的隔期；後兩碼／後三碼開出時的隔期；開獎星期的變化。
 */
import { DIGITS, WARMUP, type DrawStep } from './state'

export interface Segment { from: number, to: number }

export const segmentLabel = (steps: DrawStep[], s: Segment): string => `${steps[s.from]!.date} ～ ${steps[s.to - 1]!.date}`

/** [位置] 每段 0～9 的比例（kind = 'rank' 第幾新、'digit' 開出的數字） */
export function shareBySegment(steps: DrawStep[], segs: Segment[], kind: 'rank' | 'digit'): { n: number, shares: number[] }[][] {
  return Array.from({ length: DIGITS }, (_, p) => segs.map(({ from, to }) => {
    const c = new Array<number>(10).fill(0)
    for (let t = from; t < to; t++) {
      const h = steps[t]!.pos[p]!
      c[kind === 'rank' ? h.rank : h.digit]!++
    }
    const n = to - from
    return { n, shares: c.map(x => (n ? x / n : 0)) }
  }))
}

export interface GapRow { gap: string, count: number, share: number, cum: number }

const CUM_STOP = 0.99

/** 開出時隔期的分佈：每個數值一行，累積到 99% 之後併成「x 以上」一行（我補的） */
export function gapTable(gaps: number[]): GapRow[] {
  const n = gaps.length
  if (!n) return []
  const max = Math.max(...gaps)
  const c = new Array<number>(max + 1).fill(0)
  for (const g of gaps) c[g]!++
  const rows: GapRow[] = []
  let cum = 0
  for (let g = 0; g <= max; g++) {
    if (cum >= CUM_STOP) {
      const rest = c.slice(g).reduce((a, b) => a + b, 0)
      rows.push({ gap: `${g} 以上（最長 ${max}）`, count: rest, share: rest / n, cum: 1 })
      break
    }
    cum += c[g]! / n
    rows.push({ gap: String(g), count: c[g]!, share: c[g]! / n, cum })
  }
  return rows
}

export const posGaps = (steps: DrawStep[], p: number): number[] =>
  steps.slice(WARMUP).map(s => s.pos[p]!.gap).filter((g): g is number => g != null)

export const levelGaps = (steps: DrawStep[], level: number): number[] =>
  steps.slice(WARMUP).map(s => s.levelGap[level]).filter((g): g is number => g != null)

/** 開出時隔期的百分位（後兩碼、後三碼格子多，用「幾成的期數隔期在多少以內」看） */
export function percentiles(gaps: number[]): { q: number, gap: number }[] {
  const s = [...gaps].sort((a, b) => a - b)
  if (!s.length) return []
  return [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99].map(q => ({ q, gap: s[Math.min(s.length - 1, Math.floor(q * s.length))]! }))
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

/** 最前面這幾期只拿來認識平常的開獎星期，不算「改變」 */
const WEEKDAY_SETTLE = 10

/** 開獎星期改變的日期（資料本身看得到的營運變化），附這個星期之後一共開了幾期 */
export function weekdayChanges(steps: DrawStep[]): { date: string, text: string }[] {
  const days = steps.map(s => new Date(`${s.date}T12:00:00Z`).getUTCDay())
  const seen = new Set(days.slice(0, WEEKDAY_SETTLE))
  const out: { date: string, text: string }[] = []
  days.forEach((w, i) => {
    if (i < WEEKDAY_SETTLE || seen.has(w)) return
    seen.add(w)
    const n = days.slice(i).filter(x => x === w).length
    out.push({ date: steps[i]!.date, text: `第一次在星期${WEEK[w]}開獎（這天起星期${WEEK[w]}共開了 ${n} 期）` })
  })
  return out
}

/** 每年開獎期數 */
export function drawsPerYear(steps: DrawStep[]): { year: string, n: number }[] {
  const m = new Map<string, number>()
  for (const s of steps) m.set(s.date.slice(0, 4), (m.get(s.date.slice(0, 4)) ?? 0) + 1)
  return [...m].map(([year, n]) => ({ year, n }))
}
