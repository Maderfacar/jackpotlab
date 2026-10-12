/**
 * 波段均值的底稿：把每一列（隔期格 0～19、隔期／值 第 1～5 顆）整理成「一串數字 + 每個數字在哪一期定案」，
 * 任何一期的 5／10／15／歷史 平均都從這串用前綴和算（今天的表、走勢圖、輸入預期數字都共用）。
 *
 * 照定義逐期算（與 app/utils/analysis.ts processDraw 等價，測試核對）：
 *   隔期格 g = 上次開出在 g+1 期前的號碼（g < 60）；這格「開出」＝本期有號碼來自這格。
 *   值 = 來源格到上一期為止已連續幾期沒開出；y = 這顆在來源格剩餘號碼（由小到大）排第幾。
 */
import type { AnalysisDrawInput } from './analysis'

export const WAVE_WARM = 100
export const WAVE_GAP_SLOTS = 20
export const WAVE_BALLS = 5
export const WAVE_RECENT = 15
export const WAVE_LENGTHS = [5, 10, 15] as const
const SLOT_COUNT = 60

/** 每期每顆（由小到大）的隔期、值與 y；找不到來源格（第一次出現或隔 60 期以上）為 null */
export interface BallInfo {
  gap: number | null
  value: number | null
  y: number | null
}

export interface Walk {
  /** 隔期格 0～19 每次開出的期序 */
  slotHits: number[][]
  balls: BallInfo[][]
  /** 號碼 → 最後開出的期序 */
  lastSeen: Map<number, number>
  /** 隔期格 → 最後一次有號碼開出的期序 */
  lastHit: Map<number, number>
}

export function walk(draws: AnalysisDrawInput[]): Walk {
  const lastSeen = new Map<number, number>()
  const lastHit = new Map<number, number>()
  /** 期序 → 那期開出、到現在還沒再開的號碼 */
  const remaining = new Map<number, Set<number>>()
  const slotHits: number[][] = Array.from({ length: WAVE_GAP_SLOTS }, () => [])
  const balls: BallInfo[][] = []

  draws.forEach((d, i) => {
    const prizes = [...new Set(d.prizes)].sort((a, b) => a - b)
    const hitSlots = new Set<number>()
    balls.push(prizes.map((p) => {
      const seen = lastSeen.get(p)
      if (seen === undefined || i - seen - 1 >= SLOT_COUNT) return { gap: null, value: null, y: null }
      const g = i - seen - 1
      hitSlots.add(g)
      const box = [...remaining.get(seen)!].sort((a, b) => a - b)
      return { gap: g, value: i - 1 - (lastHit.get(g) ?? 0), y: box.indexOf(p) + 1 }
    }))
    for (const g of hitSlots) {
      lastHit.set(g, i)
      if (g < WAVE_GAP_SLOTS) slotHits[g]!.push(i)
    }
    for (const p of prizes) {
      const seen = lastSeen.get(p)
      if (seen !== undefined) remaining.get(seen)!.delete(p)
      lastSeen.set(p, i)
    }
    remaining.set(i, new Set(prizes))
  })
  return { slotHits, balls, lastSeen, lastHit }
}

/**
 * 一列的數字串（由舊到新）。
 * open = 隔期格：「目前」是還在加的等待期數，數字在那格開出時才定案；
 * 否則（第 1～5 顆）每期一個數字，「目前」= 最新一期那個，平均用它之前的。
 */
export interface WaveSeries {
  key: string
  open: boolean
  values: number[]
  /** 每個數字在第幾期（期序）定案 */
  at: number[]
  /** 從第幾個數字開始算進「歷史」（第 101 期之後） */
  histFrom: number
  /** 前綴和：prefix[j] = values[0..j-1] 加總 */
  prefix: number[]
}

function makeSeries(key: string, open: boolean, values: number[], at: number[], histFrom: number): WaveSeries {
  const prefix = [0]
  for (const v of values) prefix.push(prefix.at(-1)! + v)
  return { key, open, values, at, histFrom, prefix }
}

/** 隔期格 k：兩次開出之間等了幾期；上一次開出在第 101 期之後的才算歷史 */
export function gapSeries(slotHits: number[][]): WaveSeries[] {
  return slotHits.map((hits, k) => {
    const values: number[] = []
    const at: number[] = []
    let histFrom = -1
    for (let j = 1; j < hits.length; j++) {
      if (histFrom < 0 && hits[j - 1]! >= WAVE_WARM) histFrom = values.length
      values.push(hits[j]! - hits[j - 1]! - 1)
      at.push(hits[j]!)
    }
    return makeSeries(String(k), true, values, at, histFrom < 0 ? values.length : histFrom)
  })
}

export const ballKey = (b: number) => `第 ${b + 1} 顆`

/** 第 1～5 顆各一串（找不到來源格的期略過）；第 101 期之後的才算歷史 */
export function ballSeries(balls: BallInfo[][], pick: (x: BallInfo) => number | null): WaveSeries[] {
  return Array.from({ length: WAVE_BALLS }, (_, b) => {
    const values: number[] = []
    const at: number[] = []
    let histFrom = -1
    balls.forEach((row, i) => {
      const v = pick(row[b] ?? { gap: null, value: null, y: null })
      if (v === null) return
      if (histFrom < 0 && i >= WAVE_WARM) histFrom = values.length
      values.push(v)
      at.push(i)
    })
    return makeSeries(ballKey(b), false, values, at, histFrom < 0 ? values.length : histFrom)
  })
}

/**
 * 第 t 期開完時這一列的狀態。
 * 2026-10-12 使用者：最新那個數字（隔期格還在加的「目前」、第 1～5 顆最新一期那個）也要算進平均。
 */
export interface WaveSnapshot {
  current: number
  /** 平均用的數字（最新在前，第一個就是目前，最多 WAVE_RECENT 個） */
  recent: number[]
  /** 5／10／15 平均（含目前；數字不夠為 null） */
  avgs: (number | null)[]
  /** 歷史（第 101 期之後，含目前）的總和與個數 */
  histSum: number
  histCount: number
}

/** 定案期序 ≤ t 的數字有幾個（二分搜尋） */
function countUpTo(at: number[], t: number): number {
  let lo = 0
  let hi = at.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (at[mid]! <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function snapshotAt(s: WaveSeries, t: number): WaveSnapshot | null {
  const idx = countUpTo(s.at, t)
  if (idx === 0) return null
  // 隔期格：目前 = 還在加的等待期數，排在所有已結束的數字前面；第 1～5 顆：目前 = 最新一期那個（本來就在串裡）
  const current = s.open ? t - s.at[idx - 1]! : s.values[idx - 1]!
  const doneEnd = s.open ? idx : idx - 1
  const sumDone = (n: number) => s.prefix[doneEnd]! - s.prefix[doneEnd - n]!
  const avgs = WAVE_LENGTHS.map(n => (doneEnd >= n - 1 ? (current + sumDone(n - 1)) / n : null))
  const recent = [current, ...s.values.slice(Math.max(0, doneEnd - (WAVE_RECENT - 1)), doneEnd).reverse()]
  const doneHist = Math.max(0, doneEnd - s.histFrom)
  const histSum = current + (doneHist ? s.prefix[doneEnd]! - s.prefix[s.histFrom]! : 0)
  return { current, recent, avgs, histSum, histCount: doneHist + 1 }
}

/**
 * 輸入「下一期開完後的目前值」x，這一列會變成怎樣（2026-10-12 使用者：隔期 4 目前 2，輸入 0 = 下一期從這格開出；
 * 新的數字不管 0 還是幾，都要算進平均）。recent／histSum／histCount 都已含目前。
 * - 隔期格：x = 0 → 下一期這格開出：目前那段定案，新的 0 排在最前面；
 *   x ≥ current + 1 → 還沒開出：目前那個變成 x；其他值不可能（回 null）。
 * - 第 1～5 顆：x = 下一期這顆的數字，排在最前面。
 * 回傳新的目前值與四種平均（5、10、15、歷史）。
 */
export function predictNext(open: boolean, current: number, recent: number[], histSum: number, histCount: number, x: number): { current: number, avgs: number[] } | null {
  if (!Number.isInteger(x) || x < 0) return null
  const replaces = open && x > 0
  if (replaces && x < current + 1) return null
  const list = replaces ? [x, ...recent.slice(1)] : [x, ...recent]
  const avgs = WAVE_LENGTHS.map(n => list.slice(0, n).reduce((a, b) => a + b, 0) / n)
  const hist = replaces ? (histSum - current + x) / histCount : (histSum + x) / (histCount + 1)
  return { current: x, avgs: [...avgs, hist] }
}

export interface TrendPoint {
  t: number
  current: number
  /** 5、10、15、歷史 */
  avgs: (number | null)[]
}

/** 第 from～to 期（期序，含兩端）每期開完時的目前值與四種平均 */
export function trendOf(s: WaveSeries, from: number, to: number): TrendPoint[] {
  const out: TrendPoint[] = []
  for (let t = Math.max(0, from); t <= to; t++) {
    const snap = snapshotAt(s, t)
    if (!snap) continue
    out.push({ t, current: snap.current, avgs: [...snap.avgs, snap.histSum / snap.histCount] })
  }
  return out
}
