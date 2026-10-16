/**
 * 近期波段（2026-10-16 使用者定案）：539 位置 y=1～5、值 0～5，以「目前盤面＋目前波段」看下一期。
 *
 * - 每期數這期 5 顆裡「位置 y=k」或「值=v」的顆數。範圍 = 最新一期所在年份（今年以來）。
 * - 各 key 出現頻率不同，不能都看 3 期：視窗 W = round(7.1 ÷ 該 key 今年每期平均)，至少 3 期，
 *   讓 W 期合計平均都在 7 左右。高波段 = 今年 W 期合計的前 20%、低波段 = 後 20%。
 * - 同盤面 = 上一期同樣幾顆＋同樣在高／中／低波段；看下一期幾顆。
 *   全史（2007 起、去掉前 100 期暖機，波段門檻用全史自己的前後 20%）為主，今年為輔。
 * - 值另看「上一期值總和 <10 / ≥10」：差距 ≥25% 算有影響，推估就改用同一邊的分布。
 * - 下一期開完：最舊那期移出 W 期範圍、補上下一期，列出開幾顆 → 合計幾顆 → 落在哪個波段。
 *
 * 隔期、值、y 由 wave-series.ts 的 walk 照定義逐期算（與 analysis.ts processDraw 等價，測試核對）。
 * scripts/y-wave.ts 也用這支，頁面 /trend 與對話中的回答保證同一套。
 */
import type { AnalysisDrawInput } from './analysis'
import { walk } from './wave-series'

export type RecentWaveKind = 'y' | 'value'
export type Zone = '高' | '中' | '低'

export const RECENT_WAVE_KEYS: Record<RecentWaveKind, number[]> = { y: [1, 2, 3, 4, 5], value: [0, 1, 2, 3, 4, 5] }
const TARGET_WINDOW_SUM = 7.1
const MIN_WINDOW = 3
const HIGH_Q = 0.8
const LOW_Q = 0.2
const WARMUP = 100
export const LOW_VALUE_SUM = 10
/** 值總和兩邊的平均差這麼多以上算「有影響」，這麼少以下算「沒有影響」 */
const EFFECT_STRONG = 0.25
const EFFECT_NONE = 0.1
const MIN_EFFECT_SAMPLE = 30

export interface RecentWaveDraw {
  issue: string
  date: string
  ys: number[]
  values: number[]
  valueSum: number
}

export interface DistItem {
  k: number
  n: number
  pct: number
}
export interface Dist {
  items: DistItem[]
  total: number
  mean: number
}

export interface ForecastOption {
  k: number
  sum: number
  zone: Zone
  pct: number
}

export interface ValueSumCheck {
  now: number
  isLow: boolean
  low: Dist
  high: Dist
  /** none：沒影響；slight：略多／略少；strong：有影響；unknown：次數太少 */
  effect: 'none' | 'slight' | 'strong' | 'unknown'
  /** 值總和 <10 那邊比 ≥10 那邊多（true）或少 */
  lowMore: boolean
}

export interface RecentWave {
  kind: RecentWaveKind
  key: number
  year: string
  mean: number
  w: number
  hi: number
  lo: number
  latest: { issue: string, count: number }
  /** 最近 W 期（至少 3 期）每期幾顆，舊 → 新 */
  recent: { issue: string, count: number }[]
  window: { from: string, to: string, sum: number }
  /** 最近三個 W 期合計（舊 → 新） */
  lastSums: number[]
  zone: Zone
  lastSeen: { issue: string, ago: number } | null
  sameYear: Dist
  sameAll: Dist
  valueSum: ValueSumCheck | null
  /** 推估用的分布（值總和有影響時改用同一邊） */
  forecastDist: Dist
  next: { issue: string, from: string, dropIssue: string, dropCount: number, options: ForecastOption[] }
}

/** 由舊到新的開獎 → 每期每顆的 y、值（walk 照定義算） */
export function recentWaveDraws(draws: AnalysisDrawInput[]): RecentWaveDraw[] {
  const { balls } = walk(draws)
  return draws.map((d, i) => {
    const bs = balls[i] ?? []
    const values = bs.map(b => b.value).filter((v): v is number => v !== null)
    return {
      issue: String(d.drawTerm),
      date: d.drawDate,
      ys: bs.map(b => b.y).filter((v): v is number => v !== null),
      values,
      valueSum: values.reduce((a, b) => a + b, 0)
    }
  })
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(q * (sorted.length - 1))] ?? 0
}

function zoneOf(sum: number, hi: number, lo: number): Zone {
  return sum >= hi ? '高' : sum <= lo ? '低' : '中'
}

/** 每期當下的 W 期合計與波段；前 W-1 期為 null */
function windowZones(counts: number[], w: number): { sums: (number | null)[], zones: (Zone | null)[], hi: number, lo: number } {
  const sums = counts.map((_, i) => i < w - 1 ? null : counts.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0))
  const valid = sums.filter((s): s is number => s !== null)
  const hi = quantile(valid, HIGH_Q)
  const lo = quantile(valid, LOW_Q)
  return { sums, zones: sums.map(s => s === null ? null : zoneOf(s, hi, lo)), hi, lo }
}

/** 符合條件的期，下一期各是幾顆 */
function distWhere(counts: number[], match: (i: number) => boolean): Dist {
  const tally = new Map<number, number>()
  for (let i = 0; i < counts.length - 1; i++) {
    if (match(i)) tally.set(counts[i + 1]!, (tally.get(counts[i + 1]!) ?? 0) + 1)
  }
  const total = [...tally.values()].reduce((a, b) => a + b, 0)
  const items = [...tally].sort((a, b) => a[0] - b[0]).map(([k, n]) => ({ k, n, pct: total ? n / total : 0 }))
  return { items, total, mean: total ? items.reduce((a, it) => a + it.k * it.n, 0) / total : 0 }
}

export function pctOf(dist: Dist, pred: (k: number) => boolean): number {
  return dist.items.filter(it => pred(it.k)).reduce((a, it) => a + it.pct, 0)
}

function valueSumCheck(nowSum: number, low: Dist, high: Dist): ValueSumCheck {
  const isLow = nowSum < LOW_VALUE_SUM
  const lowMore = low.mean > high.mean
  if (low.total < MIN_EFFECT_SAMPLE || high.total < MIN_EFFECT_SAMPLE) return { now: nowSum, isLow, low, high, effect: 'unknown', lowMore }
  const ratio = Math.abs(low.mean - high.mean) / Math.max(low.mean, high.mean, 0.01)
  const effect = ratio >= EFFECT_STRONG ? 'strong' : ratio >= EFFECT_NONE ? 'slight' : 'none'
  return { now: nowSum, isLow, low, high, effect, lowMore }
}

/** draws：由舊到新、全部歷史（第一期起）。今年期數不夠一個視窗時回 null。 */
export function analyzeRecentWave(draws: RecentWaveDraw[], kind: RecentWaveKind, key: number): RecentWave | null {
  const pick = (d: RecentWaveDraw) => (kind === 'y' ? d.ys : d.values).filter(v => v === key).length
  const latestDraw = draws.at(-1)
  if (!latestDraw) return null
  const year = latestDraw.date.slice(0, 4)
  const yearDraws = draws.filter(d => d.date.startsWith(year))
  const counts = yearDraws.map(pick)
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1)
  if (mean === 0) return null
  const w = Math.max(MIN_WINDOW, Math.round(TARGET_WINDOW_SUM / mean))
  if (counts.length < w + 2) return null

  const yearZ = windowZones(counts, w)
  const lastSums = yearZ.sums.slice(-3).filter((s): s is number => s !== null)
  const zone = yearZ.zones.at(-1)!
  const last = counts.at(-1)!

  const allDraws = draws.slice(WARMUP)
  const allCounts = allDraws.map(pick)
  const allZ = windowZones(allCounts, w)
  const sameAll = distWhere(allCounts, i => allCounts[i] === last && allZ.zones[i] === zone)
  const sameYear = distWhere(counts, i => counts[i] === last && yearZ.zones[i] === zone)

  let valueSum: ValueSumCheck | null = null
  let forecastDist = sameAll
  if (kind === 'value') {
    const same = (i: number) => allCounts[i] === last && allZ.zones[i] === zone
    valueSum = valueSumCheck(
      latestDraw.valueSum,
      distWhere(allCounts, i => same(i) && allDraws[i]!.valueSum < LOW_VALUE_SUM),
      distWhere(allCounts, i => same(i) && allDraws[i]!.valueSum >= LOW_VALUE_SUM)
    )
    if (valueSum.effect === 'strong') forecastDist = valueSum.isLow ? valueSum.low : valueSum.high
  }

  const lastSeenIdx = counts.findLastIndex(c => c > 0)
  const nowSum = lastSums.at(-1)!
  const dropCount = counts[counts.length - w]!
  const maxK = Math.max(2, ...sameAll.items.map(it => it.k))
  const options = Array.from({ length: maxK + 1 }, (_, k) => {
    const sum = nowSum - dropCount + k
    return { k, sum, zone: zoneOf(sum, yearZ.hi, yearZ.lo), pct: pctOf(forecastDist, x => x === k) }
  })

  return {
    kind,
    key,
    year,
    mean,
    w,
    hi: yearZ.hi,
    lo: yearZ.lo,
    latest: { issue: latestDraw.issue, count: last },
    recent: yearDraws.slice(-Math.max(w, 3)).map((d, i, arr) => ({ issue: d.issue, count: counts[counts.length - arr.length + i]! })),
    window: { from: yearDraws.at(-w)!.issue, to: latestDraw.issue, sum: nowSum },
    lastSums,
    zone,
    lastSeen: lastSeenIdx < 0 ? null : { issue: yearDraws[lastSeenIdx]!.issue, ago: counts.length - 1 - lastSeenIdx },
    sameYear,
    sameAll,
    valueSum,
    forecastDist,
    next: {
      issue: String(Number(latestDraw.issue) + 1),
      from: yearDraws.at(-w + 1)?.issue ?? latestDraw.issue,
      dropIssue: yearDraws.at(-w)!.issue,
      dropCount,
      options
    }
  }
}
