/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * **時間軸概念（使用者拍板）：**
 *
 *   1. 下方「觀察紀錄」先發生：T 期被開出時，T 的 20 顆從「**前一次**隔期 0/1/2/3」
 *      （= pre-T periods[0..3] = T-1 當下的隔期）各擷取了多少
 *   2. 擷取後，每個 pre-T 隔期剩下若干顆
 *   3. shift right → pre-T periods[0..3] 變成 post-T periods[1..4]
 *      上方卡的隔期 0 = T 本期新進來的 20 顆
 *
 * **連動關係（核心）：**
 *
 *   - 觀察 隔期 j 的剩餘 = pre-T periods[j] 擷取後剩餘 = post-T periods[j+1].length
 *     = 上方卡 隔期 j+1 的顆數
 *   - 觀察 隔期 0 ⇄ 上方卡 隔期 1
 *   - 觀察 隔期 1 ⇄ 上方卡 隔期 2
 *   - 觀察 隔期 2 ⇄ 上方卡 隔期 3
 *   - 觀察 隔期 3 → 上方卡 隔期 4（卡只到 3，所以看不到）
 *   - 上方卡 隔期 0 = T 本期 20 顆，與觀察無對應
 *
 * **取得 post-T 狀態的兩條路徑：**
 *
 *   - **replay 路徑**：params.currentDraw 為 T，本地 applyNewDraws 模擬，拿 post-T
 *   - **evaluateCurrent 路徑**：params.analysisState 本來就已含全部期，直接用
 *
 * **觀察文字（emptyGroupLabels）每期 5 行**：
 *
 *   - 4 行「隔期 j：{T csv 值=j 的數量}/{post-T periods[j+1].length}」（j = 0..3）
 *   - 1 行「0-3 隔期共 {totalHits}/{totalRemaining}（{percent}%）」
 *
 * **連莊紅框（上方卡 隔期 0 上）：**
 *
 *   - = T 期 csv 值 = 0 對應的 sorted-unique T 主號 = T ∩ T-1
 *   - 顯示在 T 本期 20 顆裡跟 T-1 重疊的那幾顆
 *
 * 適用彩種：bingo_bingo only
 */

import type { GameId } from '../../../shared/lotto/games'
import { applyNewDraws } from '../../utils/analysis'
import type { AnalysisState } from '../../utils/analysis'
import type {
  OriginDistributionData,
  OriginIntervalEntry,
  SignalDef,
  SignalEvalParams,
  SignalEvaluation
} from '../types'

const ID = 'bingo_origin_distribution'
const APPLIES_TO: readonly GameId[] = ['bingo_bingo']
const SLOT_COUNT = 4 // 隔期 0..3

function parsePeriodsCsv(periods: string | undefined): Array<number | null> {
  if (!periods) return []
  return periods.split(',').map((s) => {
    if (s === '') return null
    const v = Number.parseInt(s, 10)
    return Number.isFinite(v) ? v : null
  })
}

function parsePrizesCsv(prizes: string | undefined): number[] {
  if (!prizes) return []
  const out: number[] = []
  for (const s of prizes.split(',')) {
    const v = Number.parseInt(s, 10)
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId !== 'bingo_bingo') return { fires: false, picks: [] }

  // 取得 post-T 視角的 analysisState
  let stateAfterT: AnalysisState
  if (params.currentDraw) {
    // replay 路徑：手上的 analysisState 還沒含 T，本地模擬 applyNewDraws 拿 post-T
    stateAfterT = applyNewDraws(params.analysisState, [{
      drawTerm: params.currentDraw.drawTerm,
      drawDate: params.currentDraw.drawDate,
      prizes: params.currentDraw.numbers
    }])
  } else {
    // evaluateCurrent 路徑：analysisState 本就含全部期，最後一筆即 T
    stateAfterT = params.analysisState
  }

  if (stateAfterT.history.length === 0) return { fires: false, picks: [] }
  // 觀察 隔期 j (j=0..3) 的 remaining 需 post-T periods[j+1]，故需 periods[0..4] 共 5 格
  if (stateAfterT.periods.length < SLOT_COUNT + 1) return { fires: false, picks: [] }

  const tEntry = stateAfterT.history[stateAfterT.history.length - 1]!
  const tCsvIdxs = parsePeriodsCsv(tEntry.periods)
  // tEntry.prizes 已經是 sorted-unique（processDraw newPrizes.join 而來），順序與 csv 對應
  const tNumsSorted = parsePrizesCsv(tEntry.prizes)

  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    let hits = 0
    for (const idx of tCsvIdxs) if (idx === j) hits++

    // 觀察記錄用：pre-T periods[j] 在 T 擷取後剩餘 = post-T periods[j+1].length
    const observedRemaining = stateAfterT.periods[j + 1]!.prizes.length

    // 上方卡用：post-T periods[j].prizes（升序）
    //   注意 interval=0 是 T 本期 20 顆，所以 remainingNumbers.length ≠ observedRemaining
    const upperCardSlot = stateAfterT.periods[j]!
    const remainingNumbers = [...upperCardSlot.prizes].sort((a, b) => a - b)

    perInterval.push({
      interval: j,
      hits,
      remaining: observedRemaining,
      remainingNumbers
    })
  }

  const totalHits = perInterval.reduce((s, p) => s + p.hits, 0)
  const totalRemaining = perInterval.reduce((s, p) => s + p.remaining, 0)
  const percent = totalRemaining > 0 ? (totalHits / totalRemaining) * 100 : 0

  // 連莊紅框（上方卡 隔期 0 上）= T 期 csv 值 = 0 對應的 sorted-unique T 號 = T ∩ T-1
  const period0Set = new Set(stateAfterT.periods[0]!.prizes)
  const carryoverInPeriod0: number[] = []
  for (let i = 0; i < tCsvIdxs.length; i++) {
    if (tCsvIdxs[i] === 0) {
      const n = tNumsSorted[i]
      if (typeof n === 'number' && period0Set.has(n)) carryoverInPeriod0.push(n)
    }
  }
  carryoverInPeriod0.sort((a, b) => a - b)

  const originDistribution: OriginDistributionData = {
    perInterval,
    totalHits,
    totalRemaining,
    carryoverInPeriod0
  }

  const labels: string[] = []
  for (const p of perInterval) {
    labels.push(`隔期 ${p.interval}：${p.hits}/${p.remaining}`)
  }
  labels.push(`0-3 隔期共 ${totalHits}/${totalRemaining}（${percent.toFixed(1)}%）`)

  return {
    fires: true,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: labels,
    observationData: { originDistribution }
  }
}

export const bingoOriginDistributionSignal: SignalDef = {
  id: ID,
  nameZh: '獎號隔期來源',
  description: '統計最新期 T 的 20 顆主號擷取自前一次隔期 0-3 的數量。觀察 隔期 j 剩餘 = 上方卡 隔期 j+1 顆數；上方卡 隔期 0 = T 本期 20 顆、隔期 0 連莊號（T∩T-1）紅框。觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
