/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * 視角：**post-T 視角**（T = 當期新進來的最新一期）。
 * 完全對齊 draws 頁「原始分析 → 隔期狀態」row.period 0..3。
 *
 * **隔期對應（commit 79a60cf 之後拍板）：**
 *
 *   - 隔期 0 = stateAfterT.periods[0] = T 本期格、20 顆（沒被擷取過）
 *   - 隔期 1 = stateAfterT.periods[1] = T-1 期格（被 T 擷取後剩餘）
 *   - 隔期 2 = stateAfterT.periods[2] = T-2 期格
 *   - 隔期 3 = stateAfterT.periods[3] = T-3 期格
 *
 * **取得 post-T 狀態的兩條路徑：**
 *
 *   - **replay 路徑**：params.currentDraw 為 T，本地 applyNewDraws 模擬，拿 post-T
 *     （replay 自己會在外層 evaluate 之後 applyNewDraws，所以本地模擬不會影響全域）
 *   - **evaluateCurrent 路徑**：params.analysisState 本來就已含全部期（最後一筆就是 T），
 *     沒有 currentDraw，直接用
 *
 * **每隔期 hits 語意（新對齊）：**
 *
 *   - 隔期 0：T 本期自己的 20 顆 → hits = 20（remaining/remaining）
 *   - 隔期 j (j≥1)：T 期擷取自 T-j 期格的數量 = T 期 csv 值 = j-1 的數量
 *     （T 期 csv 是 pre-T frame 的 index，pre-T periods[k] 在 post-T 變 periods[k+1]）
 *
 * **觀察文字（emptyGroupLabels）每期 5 行**：
 *
 *   - 4 行「隔期 j：{hits}/{remaining}」（j = 0..3）
 *   - 1 行「0-3 隔期共 {totalHits}/{totalRemaining}（{percent}%）」
 *
 * **連莊紅框（隔期 0 上，給 SignalDetail 卡用）：**
 *
 *   - = T 期 csv 值 = 0 對應的 sorted-unique T 主號 = T ∩ T-1
 *   - 顯示在隔期 0（T 本期 20 顆）裡跟 T-1 重疊的那幾顆
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
  if (stateAfterT.periods.length < SLOT_COUNT) return { fires: false, picks: [] }

  const tEntry = stateAfterT.history[stateAfterT.history.length - 1]!
  const tCsvIdxs = parsePeriodsCsv(tEntry.periods)
  // tEntry.prizes 已經是 sorted-unique（processDraw newPrizes.join 而來），順序與 csv 對應
  const tNumsSorted = parsePrizesCsv(tEntry.prizes)

  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    const slot = stateAfterT.periods[j]!
    const remainingNumbers = [...slot.prizes].sort((a, b) => a - b)
    let hits: number
    if (j === 0) {
      // 隔期 0 = T 本期自己，20 顆都在
      hits = remainingNumbers.length
    } else {
      hits = 0
      for (const idx of tCsvIdxs) if (idx === j - 1) hits++
    }
    perInterval.push({
      interval: j,
      hits,
      remaining: remainingNumbers.length,
      remainingNumbers
    })
  }

  const totalHits = perInterval.reduce((s, p) => s + p.hits, 0)
  const totalRemaining = perInterval.reduce((s, p) => s + p.remaining, 0)
  const percent = totalRemaining > 0 ? (totalHits / totalRemaining) * 100 : 0

  // 連莊紅框（隔期 0 上）= T 期 csv 值 = 0 對應的 sorted-unique T 號 = T ∩ T-1
  const period0Set = new Set(perInterval[0]?.remainingNumbers ?? [])
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
  description: '統計最新期 T 的 20 顆主號擷取自隔期 0-3 哪一格（隔期 0=T 本期、隔期 1..3=T-1..T-3 期格 post-T 剩餘）、隔期 0 連莊號（T∩T-1）紅框；觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
