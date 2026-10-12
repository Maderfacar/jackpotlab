/**
 * 波段均值（2026-10-12 使用者拍板）：以「最新一期開完的盤面」為基礎，算隔期、值、位置 y。
 *
 * - 隔期 0～19：每格的記錄（/draws 的 record，最左最新）。目前的值 = 第一個數字（這格已幾期沒開出，還在加）；
 *   均值 = 往前已結束的 5／10／15 個數字、歷史 = 第 101 期之後開始的已結束數字。
 * - 隔期（第 1～5 顆）、值：第 1～5 顆（號碼由小到大）各自一串，每期一個數字。目前的值 = 最新一期那顆；
 *   均值 = 最新一期之前的 5／10／15 期、歷史 = 第 101 期之後全部（不含最新一期）。
 * - 目前的值大於均值 → above。
 * - 位置 y 不用平均（看不出是 1 還是 3），改數最近 5／10／15 期與歷史 y=1、2、3、4 以上各幾次。
 * - 值盤面：同一格的號碼值一定相同，所以把盤面翻過來看「每種值有幾顆號碼帶著」。
 * - 前 100 期是盤面剛開始累積的期間，不算進歷史。
 *
 * 底稿與每期狀態在 app/utils/wave-series.ts。docs/wave/wave.json 由 processDraw 版產生、
 * 並經 Python 獨立重算核對，測試要求逐值一致。scripts/wave-stats.ts 用這裡寫 docs/wave。
 */
import type { AnalysisDrawInput } from './analysis'
import {
  ballSeries, gapSeries, snapshotAt, walk,
  WAVE_LENGTHS, WAVE_RECENT, WAVE_WARM,
  type BallInfo, type WaveSeries
} from './wave-series'

export { WAVE_RECENT } from './wave-series'

export interface WaveAvg {
  label: string
  avg: number
  above: boolean
}

export interface WaveRow {
  key: string
  /** 隔期格（目前 = 還在加的等待期數）；否則是第 1～5 顆 */
  open: boolean
  current: number
  avgs: WaveAvg[]
  /** 平均用的數字（最新在前，最多 WAVE_RECENT 個），給人工驗證與輸入預期數字用 */
  recent: number[]
  histSum: number
  histCount: number
}

export interface WaveResult {
  issue: string
  date: string
  prizes: string
  gap: WaveRow[]
  /** 隔期：第 1～5 顆（號碼由小到大）各自一串 */
  gapBall: WaveRow[]
  value: WaveRow[]
  /** 位置 y：第 1～5 顆，最近 5／10／15 期與歷史裡 y=1、2、3、4 以上各幾次（平均看不出是 1 還是 3，改數次數） */
  yCounts: YCountRow[]
  /** 下一期盤面：每種值有哪幾格、幾顆號碼帶著（同一格的號碼值一定相同） */
  valueBoard: ValueGroup[]
}

/** y 分 4 類：1、2、3、4 以上 */
export const Y_BINS = ['1', '2', '3', '4+'] as const

export interface YWindow {
  label: string
  total: number
  /** y=1、2、3、4 以上各幾次 */
  counts: number[]
  /** 這一段的比例比歷史高 */
  above: boolean[]
}

export interface YCountRow {
  key: string
  /** 最新一期這顆的 y */
  latest: number
  windows: YWindow[]
}

export interface ValueGroup {
  value: number
  /** 帶這個值的隔期格（只列還有號碼的格） */
  slots: number[]
  numbers: number[]
}

/** 平均＝total／count；目前的值大於平均 → above（用整數乘法比，避免小數誤差） */
function average(label: string, current: number, total: number, count: number): WaveAvg {
  return { label, avg: total / count, above: current * count > total }
}

/** 某一列在第 t 期（期序）開完時的表格列；數字不夠回 null */
export function rowAt(s: WaveSeries, t: number): WaveRow | null {
  const snap = snapshotAt(s, t)
  if (!snap || snap.histCount === 0) return null
  const sums = WAVE_LENGTHS.map(n => snap.recent.length >= n ? snap.recent.slice(0, n).reduce((a, b) => a + b, 0) : null)
  if (sums.some(x => x === null)) return null
  return {
    key: s.key,
    open: s.open,
    current: snap.current,
    avgs: [
      ...WAVE_LENGTHS.map((n, k) => average(String(n), snap.current, sums[k]!, n)),
      average('歷史', snap.current, snap.histSum, snap.histCount)
    ],
    recent: snap.recent,
    histSum: snap.histSum,
    histCount: snap.histCount
  }
}

function countY(ys: number[]): number[] {
  const counts = Y_BINS.map(() => 0)
  for (const y of ys) counts[Math.min(y, Y_BINS.length) - 1]!++
  return counts
}

/** 最近 5／10／15 期（含最新一期）與歷史（第 101 期之後，含最新一期）的 y 次數；比例比歷史高 → above */
function yCountRows(series: WaveSeries[]): YCountRow[] {
  return series.map((s) => {
    const newest = [...s.values].reverse()
    const histTotal = s.values.length - s.histFrom
    const hist = countY(newest.slice(0, histTotal))
    const window = (label: string, ys: number[]): YWindow => {
      const counts = countY(ys)
      return { label, total: ys.length, counts, above: counts.map((c, k) => c * histTotal > hist[k]! * ys.length) }
    }
    return {
      key: s.key,
      latest: newest[0]!,
      windows: [
        ...WAVE_LENGTHS.map(n => window(String(n), newest.slice(0, n))),
        { label: '歷史', total: histTotal, counts: hist, above: hist.map(() => false) }
      ]
    }
  })
}

/** 最新一期開完的盤面：號碼 p 下一期若開出，來自隔期 g = 下一期序 − 最後開出 − 1，值 = 那格到現在已幾期沒開出 */
function valueBoardOf(lastSeen: Map<number, number>, lastHit: Map<number, number>, nextIndex: number): ValueGroup[] {
  const groups = new Map<number, { slots: Set<number>, numbers: number[] }>()
  for (const [p, seen] of [...lastSeen.entries()].sort((a, b) => a[0] - b[0])) {
    const g = nextIndex - seen - 1
    if (g >= 60) continue
    const value = nextIndex - 1 - (lastHit.get(g) ?? 0)
    const group = groups.get(value) ?? { slots: new Set<number>(), numbers: [] }
    group.slots.add(g)
    group.numbers.push(p)
    groups.set(value, group)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, g]) => ({ value, slots: [...g.slots].sort((a, b) => a - b), numbers: g.numbers }))
}

/** 每一列的數字串（今天的表、走勢圖都從這裡算） */
export interface WaveContext {
  draws: AnalysisDrawInput[]
  gap: WaveSeries[]
  gapBall: WaveSeries[]
  value: WaveSeries[]
  y: WaveSeries[]
  lastSeen: Map<number, number>
  lastHit: Map<number, number>
}

export function buildWaveContext(draws: AnalysisDrawInput[]): WaveContext | null {
  if (draws.length < WAVE_WARM + WAVE_RECENT + 1) return null
  const w = walk(draws)
  if (w.slotHits.some(h => h.length < 2)) return null
  const pick = (f: (b: BallInfo) => number | null) => ballSeries(w.balls, f)
  return {
    draws,
    gap: gapSeries(w.slotHits),
    gapBall: pick(b => b.gap),
    value: pick(b => b.value),
    y: pick(b => b.y),
    lastSeen: w.lastSeen,
    lastHit: w.lastHit
  }
}

export function waveFromContext(ctx: WaveContext): WaveResult | null {
  const t = ctx.draws.length - 1
  const rowsOf = (list: WaveSeries[]) => list.map(s => rowAt(s, t))
  const gap = rowsOf(ctx.gap)
  const gapBall = rowsOf(ctx.gapBall)
  const value = rowsOf(ctx.value)
  if ([...gap, ...gapBall, ...value].some(r => r === null)) return null
  const latest = ctx.draws[t]!
  return {
    issue: String(latest.drawTerm),
    date: latest.drawDate,
    prizes: [...latest.prizes].sort((a, b) => a - b).join(','),
    gap: gap as WaveRow[],
    gapBall: gapBall as WaveRow[],
    value: value as WaveRow[],
    yCounts: yCountRows(ctx.y),
    valueBoard: valueBoardOf(ctx.lastSeen, ctx.lastHit, ctx.draws.length)
  }
}

/** draws 由舊到新。期數不夠（暖機 100 期 + 至少 16 期）回 null。 */
export function computeWave(draws: AnalysisDrawInput[]): WaveResult | null {
  const ctx = buildWaveContext(draws)
  return ctx ? waveFromContext(ctx) : null
}
