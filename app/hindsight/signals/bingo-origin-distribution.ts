/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * 對「最新一期 t（= history[length-1]、最新已處理期）」的 20 顆主號，
 * 統計它們分別「擷取自」隔期 0-3 哪一格。
 *
 * **對齊（2026-06-11 拍板，含本次重對齊 commit）：**
 *
 *   - 「隔期 j」對齊 draws 頁面「隔期狀態」分頁的 row.period = j+1
 *     → 即 analysisState.periods[j+1]：
 *     - 隔期 0 = periods[1] = t-1 期格、剩餘 = t-1 期 20 顆 \ 後續期擷取的
 *     - 隔期 1 = periods[2] = t-2 期格
 *     - 隔期 2 = periods[3] = t-3 期格
 *     - 隔期 3 = periods[4] = t-4 期格
 *   - **不包含**訊號 10 evaluate 視角的 t 期自己（draws periods[0]）
 *
 *   剩餘號碼集合 = periods[j+1].prizes 直接拿，**不還原**（跟 draws 隔期狀態完全一致）
 *
 * **命中數**：
 *
 *   - history[len-1].periods csv 中值等於 j 的條目數
 *   - csv 對齊 sorted-unique 的 t 期主號（applyNewDraws Step a 用 newPrizes = dedupe+sort 處理）
 *   - 語意：t 期 evaluate 視角下、從第 j 隔期格擷取自的數量
 *
 * **觀察文字（emptyGroupLabels）每期 5 行**：
 *
 *   - 4 行「隔期 j：{命中數}/{該格目前剩餘獎號數}」（j = 0..3）
 *   - 1 行「0-3 隔期共 {X}/{Y}（{Z.Z%}）」彙總（Y 為目前剩餘總和、與上方一致）
 *
 * **連莊紅框（只在隔期 0 上）**：
 *
 *   - 定義：t 期擷取自第 1 隔期格的號（= csv 值 = 1 的對應 sorted-unique 號）
 *   - 這些號在 t 期之前是隔期 1 那期格的剩餘、被 t 期擷取後移到隔期 0
 *     的 descriptor.prizes（即 periods[1].prizes、若 t+1 期沒擷取）
 *   - 所以「會出現在隔期 0、不會出現在隔期 1」（已從隔期 1 對應期格扣除）
 *   - 對應使用者口語的「連莊」概念：該號從隔期 1 連續上移到隔期 0
 *   - 實際過濾：只取「同時在 periods[1].prizes 集合裡的」（去除已被 t+1 等期擷取的）
 *
 * 適用彩種：bingo_bingo only
 */

import type { GameId } from '../../../shared/lotto/games'
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

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId !== 'bingo_bingo') return { fires: false, picks: [] }

  const histAS = params.analysisState.history
  const histBD = params.history
  if (histAS.length === 0 || histBD.length === 0) return { fires: false, picks: [] }

  const latestAS = histAS[histAS.length - 1]!
  const latestBD = histBD[histBD.length - 1]!
  const periodIdxs = parsePeriodsCsv(latestAS.periods)
  if (periodIdxs.length === 0) return { fires: false, picks: [] }

  const slots = params.analysisState.periods
  if (slots.length < SLOT_COUNT + 1) return { fires: false, picks: [] }

  // csv 對應 sorted-unique t 期主號順序（applyNewDraws Step a 用 newPrizes 處理）
  const tNumsSorted = [...new Set(latestBD.numbers)].sort((a, b) => a - b)

  // 每隔期：命中數 + 目前剩餘集合（直接用 periods[j+1].prizes、與 draws 隔期狀態一致）
  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    let hits = 0
    for (const idx of periodIdxs) {
      if (idx === j) hits++
    }
    const slot = slots[j + 1]!
    const remainingNumbers = [...slot.prizes].sort((a, b) => a - b)
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

  // 連莊紅框（隔期 0 上）= csv 值 = 1 的對應顆（t 期擷取自第 1 隔期格的號）
  // 並過濾「仍在 periods[1].prizes 中」的（去除已被後續期擷取的邊界情況）
  const period0Set = new Set(perInterval[0]?.remainingNumbers ?? [])
  const carryoverInPeriod0: number[] = []
  for (let i = 0; i < periodIdxs.length; i++) {
    if (periodIdxs[i] === 1) {
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
  description: '統計最新期 20 顆主號擷取自隔期 0-3 哪一格，剩餘號碼對齊 draws 隔期狀態（隔期 0=periods[1] 起）、隔期 0 連莊號（擷取自隔期 1 的）紅框；觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
