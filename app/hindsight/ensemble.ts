/**
 * 訊號集成排名：對當期所有亮燈的訊號的 picks 累加加權，回傳號碼排名。
 *
 * 每個訊號的「票權重」= 該訊號 smoothed hit rate（樣本不足會被拉回 baseline）。
 * 同一號碼如果被多支訊號推，權重相加；supportingSignals 留追溯線索。
 *
 * 這支函式不做命中率呈現的決策（[[feedback-no-fake-analysis-output]] 規則由 UI 層套用）。
 */

import type { GameId } from '../../shared/lotto/games'
import { baselineHitRate, N0 } from './config'
import { createEmptyScorecard, smoothedHitRate } from './scorecard'
import type { SignalFiringRecord, SignalScorecard } from './types'

export interface NumberRanking {
  number: number
  score: number
  supportingSignals: string[]
}

/**
 * firings: { [signalId]: SignalFiringRecord } — 當期所有亮燈訊號 + picks。
 * scorecards: { [signalId]: SignalScorecard } — 至 evaluate 那一刻的歷史成績。
 *
 * 排序：score 高→低；相同 score 時保留先加入的順序（穩定排序）。
 */
export function rankNumbersForNextDraw(
  firings: Record<string, SignalFiringRecord>,
  scorecards: Record<string, SignalScorecard>,
  gameId: GameId
): NumberRanking[] {
  const baseline = baselineHitRate(gameId)
  const acc: Map<number, { score: number, signals: string[], firstSeen: number }> = new Map()
  let order = 0
  for (const [signalId, firing] of Object.entries(firings)) {
    const scorecard = scorecards[signalId] ?? createEmptyScorecard(signalId)
    const weight = smoothedHitRate(scorecard, baseline, N0)
    for (const n of firing.picks) {
      const entry = acc.get(n)
      if (entry) {
        entry.score += weight
        entry.signals.push(signalId)
      } else {
        acc.set(n, { score: weight, signals: [signalId], firstSeen: order++ })
      }
    }
  }
  const out: NumberRanking[] = []
  for (const [number, info] of acc.entries()) {
    out.push({ number, score: info.score, supportingSignals: [...info.signals] })
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // 穩定排序：相同分數依加入順序
    const ai = acc.get(a.number)?.firstSeen ?? 0
    const bi = acc.get(b.number)?.firstSeen ?? 0
    return ai - bi
  })
  return out
}
