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
  SignalDef,
  SignalFiringRecord,
  SignalScorecard
} from './types'

const MULTI_SIGNAL_MIN = 5
const SIGNAL_DRIFT_WINDOW = 10
const OVERALL_DRIFT_RECENT_TERMS = 5
const MIN_SAMPLES_FOR_DRIFT = 10
/**
 * rare_combination 冷卻期：歷史組合表累積 < 此期數時不發此類警示。
 * 原因：新訊號上線後，任何「含新訊號」的組合在歷史都是第一次出現，
 * 樣本未厚實前所有組合都被誤判為罕見；累積夠厚才有資格判罕見。
 */
const RARE_COMBO_MIN_HISTORY = 60

function comboKey(signalIds: readonly string[]): string {
  return [...signalIds].sort().join('+')
}

function buildNameMap(signals: readonly SignalDef[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of signals) out.set(s.id, s.nameZh)
  return out
}

function nameOf(map: Map<string, string>, id: string): string {
  return map.get(id) ?? id
}

function comboLabel(map: Map<string, string>, signalIds: readonly string[]): string {
  return [...signalIds].sort().map(id => nameOf(map, id)).join(' + ')
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
  history: BrainDraw[],
  signals: readonly SignalDef[] = []
): BrainAlert[] {
  const alerts: BrainAlert[] = []
  const firedIds = Object.keys(currentFirings)
  if (firedIds.length === 0) return alerts
  const nameMap = buildNameMap(signals)

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
      detail: `${firedIds.length} 支訊號同時亮燈：${comboLabel(nameMap, firedIds)}`,
      signals: [...firedIds].sort(),
      createdAt
    })
  }

  // 2. rare_combination（歷史組合表 < RARE_COMBO_MIN_HISTORY 期不發，避免新訊號上線誤判）
  const currentKey = comboKey(firedIds)
  const historicalCombos = buildHistoricalCombos(brainState.scorecards)
  if (historicalCombos.size >= RARE_COMBO_MIN_HISTORY) {
    let seenBefore = false
    for (const set of historicalCombos.values()) {
      if (comboKey([...set]) === currentKey) {
        seenBefore = true
        break
      }
    }
    if (!seenBefore) {
      alerts.push({
        id: makeId('rare_combination', drawTerm),
        type: 'rare_combination',
        drawTerm,
        drawDate,
        detail: `組合「${comboLabel(nameMap, firedIds)}」歷史第一次出現`,
        signals: [...firedIds].sort(),
        createdAt
      })
    }
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
        detail: `${nameOf(nameMap, sc.signalId)} 最近 ${SIGNAL_DRIFT_WINDOW} 期命中 ${(recent * 100).toFixed(1)}%、長期 ${(longTerm * 100).toFixed(1)}%`,
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
          detail: `最近 ${OVERALL_DRIFT_RECENT_TERMS} 期整體命中 ${(recentOverall * 100).toFixed(1)}%、長期 ${(longTermOverall * 100).toFixed(1)}%`,
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
