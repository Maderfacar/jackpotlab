/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * **規格（commit 鏈 d0ed921 → 本次拍板對齊）：**
 *
 * 觀察紀錄表每期顯示 T 期 20 顆從「該期當下（pre-T、T-1 處理完之後）」隔期 0/1/2/3 各擷取多少。
 * 完全對齊 draws 的「隔期狀態」+「獎號關聯」兩個 tab。
 *
 * **分子分母（對齊「隔期狀態」）：**
 *
 *   - 分子 hits[j] = T 期 csv 值 = j 的數量 = T 期從 pre-T periods[j] 擷取數
 *   - 分母 remaining[j] = pre-T periods[j] 的**原始顆數**（擷取前）
 *     = hits[j] + post-T periods[j+1].length
 *     （pre-T 那格被 T 擷取後變 post-T periods[j+1]，加回擷取數還原原始顆數）
 *   - 彙總百分比 = totalHits / totalRemaining * 100
 *
 * 例：x-1 當下 隔期 0=[10,11,12,13] 隔期 1=[14,15,16] 隔期 2=[17,18,19] 隔期 3=[20,21,22]
 *     x 期開出 11,12,14,22 → 觀察紀錄：
 *       隔期 0：2/4
 *       隔期 1：1/3
 *       隔期 2：0/3
 *       隔期 3：1/3
 *       0-3 隔期共 4/13（30.7%）
 *
 * **位置 y 值（對齊「獎號關聯」）：**
 *
 *   - 對每顆 T 期擷取的號碼，取它在 sorted pre-T periods[j] 中的 1-indexed 位置 y
 *   - 直接 reuse history entry 內 processDraw 算好的 `positions` csv 的 y 部分
 *   - 上例：11→y=2、12→y=3 (來自隔期 0)；14→y=1 (來自隔期 1)；22→y=3 (來自隔期 3)
 *   - 收進 perInterval[j].positionYs（升序）
 *
 * **取得 post-T 狀態的兩條路徑：**
 *
 *   - replay 路徑：params.currentDraw = T，本地 applyNewDraws 模擬拿 post-T
 *   - evaluateCurrent 路徑：params.analysisState 本就含 T，直接用
 *
 * **上方卡（SignalDetail 元件自己 live 算、不讀此 firing data）：**
 *
 *   - 隔期 0..3 ⇄ post-T periods[0..3]
 *   - 隔期 0 紅框（連莊）= T csv 值 = 0 對應 sorted-unique T 號 = T ∩ T-1
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

/**
 * 解析 history entry 的 `positions` csv（格式 "x-y,x-y,..." 或 "" 表示冷號）。
 * 對齊 processDraw step a 寫入。
 */
function parsePositionsCsv(positions: string | undefined): Array<{ x: number, y: number } | null> {
  if (!positions) return []
  return positions.split(',').map((s) => {
    if (s === '') return null
    const parts = s.split('-')
    if (parts.length !== 2) return null
    const x = Number.parseInt(parts[0] ?? '', 10)
    const y = Number.parseInt(parts[1] ?? '', 10)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  })
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
  // 需 periods[0..4] 共 5 格（pre-T 隔期 3 的原始顆數要用 post-T periods[4]）
  if (stateAfterT.periods.length < SLOT_COUNT + 1) return { fires: false, picks: [] }

  const tEntry = stateAfterT.history[stateAfterT.history.length - 1]!
  const tCsvIdxs = parsePeriodsCsv(tEntry.periods)
  // tEntry.prizes 已 sorted-unique（processDraw newPrizes.join 而來），順序與 csv 對應
  const tNumsSorted = parsePrizesCsv(tEntry.prizes)
  const tPositions = parsePositionsCsv(tEntry.positions)

  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    let hits = 0
    const positionYs: number[] = []
    for (let i = 0; i < tCsvIdxs.length; i++) {
      if (tCsvIdxs[i] === j) {
        hits++
        const pos = tPositions[i]
        if (pos) positionYs.push(pos.y)
      }
    }
    positionYs.sort((a, b) => a - b)

    // 分母：pre-T periods[j] 原始顆數 = hits + post-T periods[j+1] 殘存
    const observedRemaining = hits + (stateAfterT.periods[j + 1]?.prizes.length ?? 0)

    // 上方卡用：post-T periods[j].prizes（升序）
    const upperCardSlot = stateAfterT.periods[j]!
    const remainingNumbers = [...upperCardSlot.prizes].sort((a, b) => a - b)

    perInterval.push({
      interval: j,
      hits,
      remaining: observedRemaining,
      remainingNumbers,
      positionYs
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
  description: 'T 期 20 顆從該期當下隔期 0-3 各擷取多少（對齊 draws 隔期狀態 + 獎號關聯）。觀察 hits/分母 = T 從此隔期擷取數 / pre-T 此隔期原始顆數；位置 y = 該擷取號在 sorted pre-T 隔期內的 1-indexed 位置；上方卡 隔期 0 連莊（T∩T-1）紅框。觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
