/**
 * 「預期 vs 實際」紀錄（2026-09-02 使用者拍板：都記、存 Firestore、一拍兩瞪眼無容差）。
 *
 * 兩層預期，快照固定用 3 期窗口（142 天離線回測拍板的預設）：
 *   A. 參考值層 — 相似前 5 名合議：三線方向多數決、換算現在水位的隔和/值和
 *      （取中位）、y=1 顆數、五顆逐位 y（各取中位）。
 *   B. 號碼層 — 把 A 的目標（隔和中位/值和中位/y=1 中位、容差 ±3 沿用既有拍板）
 *      丟進組合湊數工具，存濃縮前 5 組。
 *
 * 開獎後對帳（一拍兩瞪眼）：方向對/錯、數字差多少照登、y 逐位全等與否、
 * 每組號碼對中幾顆。多數決平手記 null、不計入命中率分母。
 * 寫入一律走 server route + admin SDK；client 只讀。
 */

import type { AnalysisState } from '../utils/analysis'
import type { SignalRow } from './types'
import { buildSimilarity } from './similarity'
import { findCombos, numberInfosFromState, translateToCurrentLevel } from './combo'

/** 快照固定窗口長度（頁面上的 3/4/5 切換是探索用，帳本要固定尺才能累積） */
export const FORECAST_WINDOW_LEN = 3
export const FORECAST_TOP_K = 5
/** 組合目標容差，沿用「換算現在水位」既有拍板 ±3 */
export const FORECAST_COMBO_TOLERANCE = 3

export interface ForecastRef {
  score: number
  windowStartIssue: string
  windowEndIssue: string
  windowStartDate: string
  windowEndDate: string
  next1Issue: string
  next1Date: string
  next1PrizeSum: number
  next1GapSum: number
  next1ValSum: number
  /** 方向 = 該段下一期 vs 該段收尾期（1 升 / -1 降 / 0 平） */
  dirPrize: number
  dirGap: number
  dirVal: number
  /** 換算到當前窗口水位的隔和/值和 */
  tGap: number
  tVal: number
  ys: number[]
  y1: number
  prizes: number[]
}

export interface ForecastCombo {
  nums: number[]
  score: number
}

export interface Forecast {
  /** 快照當下已知的最新一期（預測對象 = 它的下一期） */
  baseIssue: string
  baseDate: string
  windowLen: number
  refs: ForecastRef[]
  majority: { prize: number | null, gap: number | null, val: number | null }
  tGapList: number[]
  tGapMedian: number
  tValList: number[]
  tValMedian: number
  y1Votes: number[]
  y1Median: number
  /** [5 位][各段票]，第 p 位 = 獎號由小到大第 p 顆的 y */
  yPosVotes: number[][]
  yPosMedian: number[]
  comboTargets: { gap: number, val: number, y1: number, tolerance: number }
  comboTotal: number
  combos: ForecastCombo[]
  createdAt: string
}

export interface ForecastOutcome {
  actualIssue: string
  actualDate: string
  actualPrizes: number[]
  actualPrizeSum: number
  actualGapSum: number
  actualValSum: number
  actualYs: number[]
  actualY1: number
  /** 實際走向（實際下一期 vs 快照基準期；1 變大 / -1 變小 / 0 持平） */
  actualDir: { prize: number, gap: number, val: number }
  /** 多數決 vs 實際方向；多數決平手 = null（不計入命中率） */
  dirHit: { prize: boolean | null, gap: boolean | null, val: boolean | null }
  dGap: number
  dVal: number
  y1Hit: boolean
  /** 逐位：中位票 vs 實際 y；實際 y 無資料 = null */
  yPosHit: Array<boolean | null>
  comboHits: number[]
  settledAt: string
}

const sumOf = (nums: number[]): number => nums.reduce((a, b) => a + b, 0)
const signOf = (d: number): number => (d > 0 ? 1 : d < 0 ? -1 : 0)

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

export function buildForecast(rows: SignalRow[], state: AnalysisState, now: Date): Forecast | null {
  const sim = buildSimilarity(rows, FORECAST_WINDOW_LEN, FORECAST_TOP_K)
  const lastRow = rows[rows.length - 1]
  if (!sim || !lastRow) return null

  const byIssue = new Map(rows.map(r => [r.issue, r]))
  const curRows = sim.current.map(p => byIssue.get(p.issue)).filter((r): r is SignalRow => !!r)
  if (curRows.length !== FORECAST_WINDOW_LEN) return null
  const curGaps = curRows.map(r => r.sum)
  const curVals = curRows.map(r => sumOf(r.values))

  const refs: ForecastRef[] = []
  for (const m of sim.top) {
    if (!m.next1) continue
    const windowStart = m.window[0]
    const windowEnd = m.window[m.window.length - 1]
    const next1Row = byIssue.get(m.next1.issue)
    const windowRows = m.window.map(p => byIssue.get(p.issue)).filter((r): r is SignalRow => !!r)
    if (!windowStart || !windowEnd || !next1Row || windowRows.length !== m.window.length) continue
    refs.push({
      score: m.score,
      windowStartIssue: windowStart.issue,
      windowEndIssue: windowEnd.issue,
      windowStartDate: windowStart.date,
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
      tVal: translateToCurrentLevel(m.next1.valueSum, windowRows.map(r => sumOf(r.values)), curVals),
      ys: next1Row.ys,
      y1: next1Row.ys.filter(y => y === 1).length,
      prizes: next1Row.prizes
    })
  }
  if (refs.length === 0) return null

  const tGapList = refs.map(r => r.tGap)
  const tValList = refs.map(r => r.tVal)
  const y1Votes = refs.map(r => r.y1)
  const yPosVotes: number[][] = []
  for (let p = 0; p < 5; p++) yPosVotes.push(refs.map(r => r.ys[p] ?? -1))

  const comboTargets = {
    gap: median(tGapList),
    val: median(tValList),
    y1: median(y1Votes),
    tolerance: FORECAST_COMBO_TOLERANCE
  }
  const { infos } = numberInfosFromState(state)
  const comboResult = findCombos(
    infos,
    comboTargets.gap,
    comboTargets.val,
    FORECAST_TOP_K,
    comboTargets.tolerance,
    comboTargets.y1
  )

  return {
    baseIssue: lastRow.issue,
    baseDate: lastRow.date,
    windowLen: FORECAST_WINDOW_LEN,
    refs,
    majority: {
      prize: majorityOf(refs.map(r => r.dirPrize)),
      gap: majorityOf(refs.map(r => r.dirGap)),
      val: majorityOf(refs.map(r => r.dirVal))
    },
    tGapList,
    tGapMedian: median(tGapList),
    tValList,
    tValMedian: median(tValList),
    y1Votes,
    y1Median: median(y1Votes),
    yPosVotes,
    yPosMedian: yPosVotes.map(v => median(v)),
    comboTargets,
    comboTotal: comboResult.total,
    combos: comboResult.top.map(entry => ({
      nums: entry.nums.map(n => n.num),
      score: entry.score
    })),
    createdAt: now.toISOString()
  }
}

/** 開獎後對帳。actualPrev = 快照基準期（方向要跟它比）、actual = 實際開出的下一期。 */
export function settleForecast(forecast: Forecast, actualPrev: SignalRow, actual: SignalRow, now: Date): ForecastOutcome {
  const actualPrizeSum = sumOf(actual.prizes)
  const actualValSum = sumOf(actual.values)
  const actualDir = {
    prize: signOf(actualPrizeSum - sumOf(actualPrev.prizes)),
    gap: signOf(actual.sum - actualPrev.sum),
    val: signOf(actualValSum - sumOf(actualPrev.values))
  }
  const dirHit = {
    prize: forecast.majority.prize == null ? null : forecast.majority.prize === actualDir.prize,
    gap: forecast.majority.gap == null ? null : forecast.majority.gap === actualDir.gap,
    val: forecast.majority.val == null ? null : forecast.majority.val === actualDir.val
  }
  const actualY1 = actual.ys.filter(y => y === 1).length
  const yPosHit = forecast.yPosMedian.map((m, p) => {
    const ya = actual.ys[p]
    if (ya == null || ya < 1) return null
    return m === ya
  })
  const actualSet = new Set(actual.prizes)
  return {
    actualIssue: actual.issue,
    actualDate: actual.date,
    actualPrizes: actual.prizes,
    actualPrizeSum,
    actualGapSum: actual.sum,
    actualValSum,
    actualYs: actual.ys,
    actualY1,
    actualDir,
    dirHit,
    dGap: Math.abs(forecast.tGapMedian - actual.sum),
    dVal: Math.abs(forecast.tValMedian - actualValSum),
    y1Hit: forecast.y1Median === actualY1,
    yPosHit,
    comboHits: forecast.combos.map(c => c.nums.filter(n => actualSet.has(n)).length),
    settledAt: now.toISOString()
  }
}
