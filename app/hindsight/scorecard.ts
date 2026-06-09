/**
 * 訊號成績單的純函式運算。所有 update 都產生新 scorecard，不 mutate 原物件。
 *
 * Shrinkage（新手剎車）：把 (totalHits + baseline * N0) / (totalPicks + N0) 當權重。
 * 樣本不足時被拉回 baseline，避免「中 1/1 → 100%」誤導。詳見 [[feedback-no-fake-analysis-output]]。
 */

import type { BrainDraw, SignalFiringRecord, SignalScorecard } from './types'

/** recentFirings 保留長度（覆蓋 30 / 90 / 365 天聚合與漂移偵測使用）。 */
export const RECENT_FIRING_KEEP = 50

/** 訊號漂移偵測的「最近」視窗（期數）。 */
export const RECENT_HIT_RATE_WINDOW = 20

export function createEmptyScorecard(signalId: string): SignalScorecard {
  return {
    signalId,
    totalFires: 0,
    totalHits: 0,
    totalPicks: 0,
    recentFirings: [],
    firingTerms: [],
    coFiringCounts: {}
  }
}

/**
 * nextDraw 進來後給 firing 打分。回傳新 scorecard。
 *
 * 命中數 = 推的 picks 與實際開出 numbers 的交集大小。
 * picks 含重複時不去重——上層 evaluate() 已負責提供 sorted-unique。
 */
export function updateScorecard(
  scorecard: SignalScorecard,
  firing: SignalFiringRecord,
  nextDraw: BrainDraw
): SignalScorecard {
  const winningSet = new Set(nextDraw.numbers)
  const hitNumbers = firing.picks.filter(p => winningSet.has(p))
  const hits = hitNumbers.length
  const scoredFiring: SignalFiringRecord = {
    drawTerm: nextDraw.drawTerm,
    drawDate: nextDraw.drawDate,
    picks: [...firing.picks],
    pickGroups: firing.pickGroups,
    hits,
    hitNumbers
  }
  const recent = [...scorecard.recentFirings, scoredFiring].slice(-RECENT_FIRING_KEEP)
  return {
    ...scorecard,
    totalFires: scorecard.totalFires + 1,
    totalHits: scorecard.totalHits + hits,
    totalPicks: scorecard.totalPicks + firing.picks.length,
    recentFirings: recent,
    firingTerms: [...scorecard.firingTerms, nextDraw.drawTerm]
  }
}

/**
 * 共燈計次：當期亮燈的另一支訊號 +1。傳入「另一支」訊號的 id 列表。
 */
export function bumpCoFirings(
  scorecard: SignalScorecard,
  otherSignalIds: readonly string[]
): SignalScorecard {
  if (otherSignalIds.length === 0) return scorecard
  const next: Record<string, number> = { ...scorecard.coFiringCounts }
  for (const other of otherSignalIds) {
    next[other] = (next[other] ?? 0) + 1
  }
  return {
    ...scorecard,
    coFiringCounts: next
  }
}

/**
 * Shrinkage 後的命中率：(totalHits + baseline * N0) / (totalPicks + N0)。
 *
 * - totalPicks = 0 時直接回 baseline（避免 NaN 或 0/0）。
 * - totalPicks 充分大時逼近 totalHits / totalPicks。
 */
export function smoothedHitRate(
  scorecard: SignalScorecard,
  baseline: number,
  n0: number
): number {
  const denom = scorecard.totalPicks + n0
  if (denom <= 0) return baseline
  return (scorecard.totalHits + baseline * n0) / denom
}

/**
 * 最近 window 期的「中／推」命中率。樣本不足回 null（呼叫端決定怎麼顯示）。
 *
 * 為什麼回 null 而不是 baseline：[[feedback-no-fake-analysis-output]] — 樣本不足要明確標示，
 * 不可以用編造值充數。漂移偵測拿到 null 就應該跳過比較。
 */
export function recentHitRate(
  scorecard: SignalScorecard,
  window: number = RECENT_HIT_RATE_WINDOW
): number | null {
  if (window <= 0) return null
  const recent = scorecard.recentFirings.slice(-window)
  if (recent.length === 0) return null
  let hits = 0
  let picks = 0
  for (const f of recent) {
    hits += f.hits ?? 0
    picks += f.picks.length
  }
  if (picks === 0) return null
  return hits / picks
}
