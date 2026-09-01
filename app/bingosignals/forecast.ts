/**
 * 賓果版「預期 vs 實際」帳本（2026-09-02 拍板：帳本進賓果頁、10 顆候選）。
 *
 * 預期內容（相似前 5 段合議）：
 *   - 隔期總和目標（換算現在水位取中位）
 *   - 數值總和目標（在 log 空間換算 — 避免單顆爆值扭曲，再換回原始值）
 *   - 三線走向多數決
 *   - 預期結構：遠近／數值／y 三種組成（各桶取 5 段中位）
 *   - 10 顆候選：每顆號碼下一期的隔期/數值/y 開獎前已定 →
 *     按預期遠近組成配額（縮放到 10 顆），桶內以三種結構吻合度排名。
 *     不窮舉 C(80,10)（1.6 兆組、不可行也不需要）。
 * 對帳（一拍兩瞪眼）：走向對錯、總和差、三種組成 L1 差、10 顆中幾顆
 * （隨機基準期望 = 10×20/80 = 2.5 顆，帳本直接對照）。
 */

import type { AnalysisState } from '../utils/analysis'
import type { SignalRow } from '../signals/types'
import { numberInfosFromState, translateToCurrentLevel } from '../signals/combo'
import {
  buildBingoSimilarity, bucketize, GAP_EDGES, VAL_EDGES, Y_EDGES,
  type BingoTables
} from './similarity'

export const BINGO_FORECAST_WINDOW_LEN = 3
export const BINGO_FORECAST_TOP_K = 5
export const BINGO_PICK_COUNT = 10
/** 隨機挑 10 顆的期望命中（10 × 20/80） */
export const BINGO_PICK_BASELINE = 2.5

const sumOf = (nums: number[]): number => nums.reduce((a, b) => a + b, 0)
const signOf = (d: number): number => (d > 0 ? 1 : d < 0 ? -1 : 0)
const log2p = (v: number): number => Math.log2(1 + Math.max(0, v))

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function majorityOf(votes: number[]): number | null {
  const counts = new Map<number, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: number | null = null
  let bestCount = 0
  let tie = false
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v
      bestCount = c
      tie = false
    } else if (c === bestCount) {
      tie = true
    }
  }
  return tie ? null : best
}

function l1(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  return s
}

/** 各桶取中位（結果不強制加總 20 — 忠實呈現合議） */
function medianComp(comps: number[][]): number[] {
  const B = comps[0]?.length ?? 0
  const out: number[] = []
  for (let b = 0; b < B; b++) out.push(median(comps.map(c => c[b] ?? 0)))
  return out
}

/** 把組成縮放到 total 顆（最大餘數法，保證加總 = total） */
function scaleComp(comp: number[], total: number): number[] {
  const sum = sumOf(comp)
  if (sum <= 0) return comp.map((_, i) => (i === 0 ? total : 0))
  const raw = comp.map(c => (c / sum) * total)
  const base = raw.map(Math.floor)
  let rest = total - sumOf(base)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const o of order) {
    if (rest <= 0) break
    base[o.i]!++
    rest--
  }
  return base
}

function bucketIndex(v: number, edges: readonly number[]): number {
  let i = 0
  while (i < edges.length && v > edges[i]!) i++
  return i
}

export interface BingoForecastRef {
  score: number
  windowStartIssue: string
  windowEndIssue: string
  windowEndDate: string
  next1Issue: string
  next1Date: string
  next1PrizeSum: number
  next1GapSum: number
  next1ValSum: number
  dirPrize: number
  dirGap: number
  dirVal: number
  tGap: number
  tVal: number
  next1GapComp: number[]
  next1ValComp: number[]
  next1YComp: number[]
}

export interface BingoPick {
  num: number
  gap: number
  value: number
  y: number
}

export interface BingoForecast {
  baseIssue: string
  baseDate: string
  windowLen: number
  refs: BingoForecastRef[]
  majority: { prize: number | null, gap: number | null, val: number | null }
  tGapList: number[]
  tGapMedian: number
  tValList: number[]
  tValMedian: number
  predGapComp: number[]
  predValComp: number[]
  predYComp: number[]
  picks: BingoPick[]
  createdAt: string
}

export interface BingoForecastOutcome {
  actualIssue: string
  actualDate: string
  actualPrizes: number[]
  actualPrizeSum: number
  actualGapSum: number
  actualValSum: number
  actualGapComp: number[]
  actualValComp: number[]
  actualYComp: number[]
  actualDir: { prize: number, gap: number, val: number }
  dirHit: { prize: boolean | null, gap: boolean | null, val: boolean | null }
  dGap: number
  dVal: number
  gapCompDiff: number
  valCompDiff: number
  yCompDiff: number
  /** 10 顆候選中了幾顆（隨機基準 2.5） */
  pickHits: number
  hitNums: number[]
  settledAt: string
}

/** log 空間水位換算：z 對 z、再換回原始值（避免值和爆點扭曲） */
function translateLog(histNext: number, histWindow: number[], curWindow: number[]): number {
  const t = translateToCurrentLevel(
    log2p(histNext),
    histWindow.map(log2p),
    curWindow.map(log2p)
  )
  return Math.max(0, Math.round(2 ** t - 1))
}

/** 10 顆候選：預期遠近組成配額（縮到 10），桶內按三結構吻合度排名。 */
function pickCandidates(
  state: AnalysisState,
  predGapComp: number[],
  predValComp: number[],
  predYComp: number[]
): BingoPick[] {
  const { infos } = numberInfosFromState(state, 80)
  const gapShare = predGapComp.map(c => c / Math.max(1, sumOf(predGapComp)))
  const valShare = predValComp.map(c => c / Math.max(1, sumOf(predValComp)))
  const yShare = predYComp.map(c => c / Math.max(1, sumOf(predYComp)))

  const scoredNums = infos.map((info) => {
    const gb = bucketIndex(info.gap, GAP_EDGES)
    const vb = bucketIndex(info.value, VAL_EDGES)
    const yb = bucketIndex(info.y, Y_EDGES)
    return {
      pick: { num: info.num, gap: info.gap, value: info.value, y: info.y },
      gapBucket: gb,
      fit: (gapShare[gb] ?? 0) + (valShare[vb] ?? 0) + (yShare[yb] ?? 0)
    }
  })

  const quota = scaleComp(predGapComp, BINGO_PICK_COUNT)
  const picked: BingoPick[] = []
  const used = new Set<number>()
  for (let b = 0; b < quota.length; b++) {
    const pool = scoredNums
      .filter(s => s.gapBucket === b)
      .sort((x, y) => y.fit - x.fit || x.pick.gap - y.pick.gap || x.pick.num - y.pick.num)
    for (let k = 0; k < (quota[b] ?? 0) && k < pool.length; k++) {
      picked.push(pool[k]!.pick)
      used.add(pool[k]!.pick.num)
    }
  }
  // 桶內號碼不足時，從全體剩餘依吻合度補滿 10 顆
  if (picked.length < BINGO_PICK_COUNT) {
    const rest = scoredNums
      .filter(s => !used.has(s.pick.num))
      .sort((x, y) => y.fit - x.fit || x.pick.num - y.pick.num)
    for (const s of rest) {
      if (picked.length >= BINGO_PICK_COUNT) break
      picked.push(s.pick)
    }
  }
  return picked.sort((a, b) => a.num - b.num)
}

export function buildBingoForecast(
  rows: SignalRow[],
  state: AnalysisState,
  now: Date,
  prebuiltTables?: BingoTables
): BingoForecast | null {
  const sim = buildBingoSimilarity(rows, BINGO_FORECAST_WINDOW_LEN, BINGO_FORECAST_TOP_K, prebuiltTables)
  const lastRow = rows[rows.length - 1]
  if (!sim || !lastRow) return null

  const byIssue = new Map(rows.map(r => [r.issue, r]))
  const curRows = sim.current.map(p => byIssue.get(p.issue)).filter((r): r is SignalRow => !!r)
  if (curRows.length !== BINGO_FORECAST_WINDOW_LEN) return null
  const curGaps = curRows.map(r => r.sum)
  const curVals = curRows.map(r => sumOf(r.values))

  const refs: BingoForecastRef[] = []
  for (const m of sim.top) {
    if (!m.next1) continue
    const windowStart = m.window[0]
    const windowEnd = m.window[m.window.length - 1]
    const windowRows = m.window.map(p => byIssue.get(p.issue)).filter((r): r is SignalRow => !!r)
    if (!windowStart || !windowEnd || windowRows.length !== m.window.length) continue
    refs.push({
      score: m.score,
      windowStartIssue: windowStart.issue,
      windowEndIssue: windowEnd.issue,
      windowEndDate: windowEnd.date,
      next1Issue: m.next1.issue,
      next1Date: m.next1.date,
      next1PrizeSum: m.next1.prizeSum,
      next1GapSum: m.next1.gapSum,
      next1ValSum: m.next1.valueSum,
      dirPrize: signOf(m.next1.prizeSum - windowEnd.prizeSum),
      dirGap: signOf(m.next1.gapSum - windowEnd.gapSum),
      dirVal: signOf(m.next1.valueSum - windowEnd.valueSum),
      tGap: translateToCurrentLevel(m.next1.gapSum, windowRows.map(r => r.sum), curGaps),
      tVal: translateLog(m.next1.valueSum, windowRows.map(r => sumOf(r.values)), curVals),
      next1GapComp: m.next1.gapComp,
      next1ValComp: m.next1.valComp,
      next1YComp: m.next1.yComp
    })
  }
  if (refs.length === 0) return null

  const predGapComp = medianComp(refs.map(r => r.next1GapComp))
  const predValComp = medianComp(refs.map(r => r.next1ValComp))
  const predYComp = medianComp(refs.map(r => r.next1YComp))

  return {
    baseIssue: lastRow.issue,
    baseDate: lastRow.date,
    windowLen: BINGO_FORECAST_WINDOW_LEN,
    refs,
    majority: {
      prize: majorityOf(refs.map(r => r.dirPrize)),
      gap: majorityOf(refs.map(r => r.dirGap)),
      val: majorityOf(refs.map(r => r.dirVal))
    },
    tGapList: refs.map(r => r.tGap),
    tGapMedian: median(refs.map(r => r.tGap)),
    tValList: refs.map(r => r.tVal),
    tValMedian: median(refs.map(r => r.tVal)),
    predGapComp,
    predValComp,
    predYComp,
    picks: pickCandidates(state, predGapComp, predValComp, predYComp),
    createdAt: now.toISOString()
  }
}

export function settleBingoForecast(
  forecast: BingoForecast,
  actualPrev: SignalRow,
  actual: SignalRow,
  now: Date
): BingoForecastOutcome {
  const actualPrizeSum = sumOf(actual.prizes)
  const actualValSum = sumOf(actual.values)
  const actualDir = {
    prize: signOf(actualPrizeSum - sumOf(actualPrev.prizes)),
    gap: signOf(actual.sum - actualPrev.sum),
    val: signOf(actualValSum - sumOf(actualPrev.values))
  }
  const actualGapComp = bucketize(actual.gaps, GAP_EDGES)
  const actualValComp = bucketize(actual.values, VAL_EDGES)
  const actualYComp = bucketize(actual.ys, Y_EDGES)
  const actualSet = new Set(actual.prizes)
  const hitNums = forecast.picks.map(p => p.num).filter(n => actualSet.has(n))
  return {
    actualIssue: actual.issue,
    actualDate: actual.date,
    actualPrizes: actual.prizes,
    actualPrizeSum,
    actualGapSum: actual.sum,
    actualValSum,
    actualGapComp,
    actualValComp,
    actualYComp,
    actualDir,
    dirHit: {
      prize: forecast.majority.prize == null ? null : forecast.majority.prize === actualDir.prize,
      gap: forecast.majority.gap == null ? null : forecast.majority.gap === actualDir.gap,
      val: forecast.majority.val == null ? null : forecast.majority.val === actualDir.val
    },
    dGap: Math.abs(forecast.tGapMedian - actual.sum),
    dVal: Math.abs(forecast.tValMedian - actualValSum),
    gapCompDiff: l1(forecast.predGapComp, actualGapComp),
    valCompDiff: l1(forecast.predValComp, actualValComp),
    yCompDiff: l1(forecast.predYComp, actualYComp),
    pickHits: hitNums.length,
    hitNums,
    settledAt: now.toISOString()
  }
}
