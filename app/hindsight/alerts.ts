/**
 * 警示偵測。Phase 1 純頁面內紅色橫幅，後續可加推播。
 *
 * 四種警示：
 *   - multi_signal: 當期 ≥ 5 支訊號同時亮燈
 *   - rare_combination: 當期亮燈的「訊號 id 排序組合」在歷史第一次出現
 *   - signal_drift: 某支訊號最近 10 期 hit rate 與長期相差 > DRIFT_THRESHOLD
 *   - overall_drift: 全體最近 5 期 hit rate 與長期相差 > DRIFT_THRESHOLD
 *
 * 樣本不足時不發 drift 警示——對齊 [[feedback-no-fake-analysis-output]]。
 */

import { DRIFT_THRESHOLD } from './config'
import { recentHitRate } from './scorecard'
import type {
  BrainAlert,
  BrainDraw,
  BrainState,
  SignalFiringRecord,
  SignalScorecard
} from './types'

const MULTI_SIGNAL_MIN = 5
const SIGNAL_DRIFT_WINDOW = 10
const OVERALL_DRIFT_RECENT_TERMS = 5
const MIN_SAMPLES_FOR_DRIFT = 10

function comboKey(signalIds: readonly string[]): string {
  return [...signalIds].sort().join('+')
}

/**
 * 從所有 scorecards 推導「每期亮了哪些訊號」。
 * 來源：每張 scorecard 都記了自己 firingTerms。倒推到 term → signal set。
 */
function buildHistoricalCombos(
  scorecards: Record<string, SignalScorecard>
): Map<number, Set<string>> {
  const out: Map<number, Set<string>> = new Map()
  for (const [signalId, sc] of Object.entries(scorecards)) {
    for (const term of sc.firingTerms) {
      const set = out.get(term) ?? new Set<string>()
      set.add(signalId)
      out.set(term, set)
    }
  }
  return out
}

/**
 * 把每張 scorecard 的 recentFirings 攤平，依「期數」聚合 hits / picks。
 * 用來算「最近 K 期的整體 hit rate」。
 */
function aggregateRecentByTerm(
  scorecards: Record<string, SignalScorecard>
): Map<number, { hits: number, picks: number, drawDate: string }> {
  const out: Map<number, { hits: number, picks: number, drawDate: string }> = new Map()
  for (const sc of Object.values(scorecards)) {
    for (const f of sc.recentFirings) {
      const entry = out.get(f.drawTerm) ?? { hits: 0, picks: 0, drawDate: f.drawDate }
      entry.hits += f.hits ?? 0
      entry.picks += f.picks.length
      out.set(f.drawTerm, entry)
    }
  }
  return out
}

/**
 * 當期所有亮燈訊號的全域 hit rate（長期累積）。
 * 樣本不足（totalPicks 過少）回 null。
 */
function overallLongTermHitRate(
  scorecards: Record<string, SignalScorecard>
): number | null {
  let hits = 0
  let picks = 0
  for (const sc of Object.values(scorecards)) {
    hits += sc.totalHits
    picks += sc.totalPicks
  }
  if (picks < MIN_SAMPLES_FOR_DRIFT) return null
  return hits / picks
}

function makeId(prefix: string, term: number): string {
  return `${prefix}-${term}`
}

/**
 * 主入口。回傳當期應該發出的所有警示（純函式、不寫進 brainState）。
 * 呼叫端決定要不要把這些 alerts merge 進 BrainState.alerts。
 */
export function detectAlerts(
  brainState: BrainState,
  currentFirings: Record<string, SignalFiringRecord>,
  history: BrainDraw[]
): BrainAlert[] {
  const alerts: BrainAlert[] = []
  const firedIds = Object.keys(currentFirings)
  if (firedIds.length === 0) return alerts

  // 「當期」對應的 draw（尚未發生 → 取 history 最末 +1 概念上但實際上 currentFirings 任一筆都有 drawTerm/drawDate）
  const sample = currentFirings[firedIds[0]!]!
  const drawTerm = sample.drawTerm
  const drawDate = sample.drawDate
  const createdAt = new Date().toISOString()

  // 1. multi_signal
  if (firedIds.length >= MULTI_SIGNAL_MIN) {
    alerts.push({
      id: makeId('multi_signal', drawTerm),
      type: 'multi_signal',
      drawTerm,
      drawDate,
      detail: `${firedIds.length} 支訊號同時亮燈`,
      signals: [...firedIds].sort(),
      createdAt
    })
  }

  // 2. rare_combination
  const currentKey = comboKey(firedIds)
  const historicalCombos = buildHistoricalCombos(brainState.scorecards)
  let seenBefore = false
  for (const set of historicalCombos.values()) {
    if (comboKey([...set]) === currentKey) {
      seenBefore = true
      break
    }
  }
  if (!seenBefore && historicalCombos.size > 0) {
    alerts.push({
      id: makeId('rare_combination', drawTerm),
      type: 'rare_combination',
      drawTerm,
      drawDate,
      detail: `組合「${currentKey}」歷史第一次出現`,
      signals: [...firedIds].sort(),
      createdAt
    })
  }

  // 3. signal_drift（逐支訊號）
  for (const sc of Object.values(brainState.scorecards)) {
    if (sc.totalPicks < MIN_SAMPLES_FOR_DRIFT) continue
    const longTerm = sc.totalHits / sc.totalPicks
    const recent = recentHitRate(sc, SIGNAL_DRIFT_WINDOW)
    if (recent == null) continue
    if (Math.abs(recent - longTerm) > DRIFT_THRESHOLD) {
      alerts.push({
        id: makeId(`signal_drift_${sc.signalId}`, drawTerm),
        type: 'signal_drift',
        drawTerm,
        drawDate,
        detail: `${sc.signalId} 最近 ${SIGNAL_DRIFT_WINDOW} 期 hit=${recent.toFixed(3)}、長期 hit=${longTerm.toFixed(3)}`,
        signals: [sc.signalId],
        createdAt
      })
    }
  }

  // 4. overall_drift（全體）
  const longTermOverall = overallLongTermHitRate(brainState.scorecards)
  if (longTermOverall != null) {
    const recentAgg = aggregateRecentByTerm(brainState.scorecards)
    const sortedTerms = [...recentAgg.keys()].sort((a, b) => b - a).slice(0, OVERALL_DRIFT_RECENT_TERMS)
    let recentHits = 0
    let recentPicks = 0
    for (const t of sortedTerms) {
      const v = recentAgg.get(t)!
      recentHits += v.hits
      recentPicks += v.picks
    }
    if (recentPicks >= MIN_SAMPLES_FOR_DRIFT) {
      const recentOverall = recentHits / recentPicks
      if (Math.abs(recentOverall - longTermOverall) > DRIFT_THRESHOLD) {
        alerts.push({
          id: makeId('overall_drift', drawTerm),
          type: 'overall_drift',
          drawTerm,
          drawDate,
          detail: `最近 ${OVERALL_DRIFT_RECENT_TERMS} 期整體 hit=${recentOverall.toFixed(3)}、長期 hit=${longTermOverall.toFixed(3)}`,
          signals: [...firedIds].sort(),
          createdAt
        })
      }
    }
  }

  // `history` 參數目前僅用於未來擴充（例如把 drawDate 對照真實開獎日）；保留參數簽名以避免日後改 caller。
  void history

  return alerts
}
