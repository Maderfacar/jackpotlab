/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * 對「最新一期 t（= history[length-1]、即最新已處理期）」的 20 顆主號，
 * 統計它們分別來自隔期 0-3 哪一格。
 *
 * **對齊（2026-06-11 使用者拍板）：**
 *   - 隔期 0 = 該期當時的上一期（即 t-1，絕對命名）
 *   - 隔期 i = 該期當時的往前第 i+1 期
 *   - 隔期 0 **不**包含最新期 t 自己
 *
 * **觀察文字（emptyGroupLabels）每期 5 行：**
 *   - 4 行「隔期 j：{命中數}/{該期當時剩餘獎號數}」（j = 0..3）
 *   - 1 行彙總「0-3 隔期共 {X}/{Y}（{Z%}）」
 *
 * **結構化資料（observationData.originDistribution）：**
 *   給 SignalDetail 觀察紀錄上方一卡渲染「隔期 0-3 剩餘號碼」用：
 *   - perInterval[j].remainingNumbers：該隔期當時剩餘號碼集合（升序）
 *   - carryoverInPeriod0：隔期 0 上要紅框的連莊號集合
 *     = 該期當時隔期 0 (= t-1 期格) ∩ 隔期 1 對應期 (= t-2) numbers
 *     = 傳統連莊號定義（連續兩期重疊的號）
 *     這些號因被 t-1 期擷取自 t-2 期格、自動從隔期 1 剩餘扣除
 *     → 只在隔期 0 顯示並紅框、不會在隔期 1 重複出現
 *
 * **公式（每隔期 j = 0..3）：**
 *   - 命中數 = history[len-1].periods csv 中值等於 j 的條目數
 *   - 剩餘號碼集合 = analysisState.periods[j+1].prizes ∪ 該期擷取自該隔期格的號
 *   - 剩餘獎號數 = 集合 size = periods[j+1].prizes.length + 命中數
 *
 * 適用彩種：bingo_bingo only
 *
 * 規格來源：docs/HINDSIGHT-SIGNALS-AUDIT.md 之外的新訊號、見
 *   [[project-brain-signal-10-origin-distribution]] memory。
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
const SLOT_COUNT = 4 // 隔期 0..3（2026-06-11 拍板：從 0-5 改成 0-3）

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

  // 每隔期：命中號集合 + 剩餘號碼集合（命中 ∪ 現存剩餘）
  const perInterval: OriginIntervalEntry[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    const hitNumbers: number[] = []
    for (let i = 0; i < periodIdxs.length; i++) {
      if (periodIdxs[i] === j) {
        const n = latestBD.numbers[i]
        if (typeof n === 'number') hitNumbers.push(n)
      }
    }
    const slot = slots[j + 1]!
    const remainingSet = new Set<number>([...slot.prizes, ...hitNumbers])
    const remainingNumbers = [...remainingSet].sort((a, b) => a - b)
    perInterval.push({
      interval: j,
      hits: hitNumbers.length,
      remaining: remainingNumbers.length,
      remainingNumbers
    })
  }

  // 彙總 0-3
  const totalHits = perInterval.reduce((s, p) => s + p.hits, 0)
  const totalRemaining = perInterval.reduce((s, p) => s + p.remaining, 0)
  const percent = totalRemaining > 0 ? (totalHits / totalRemaining) * 100 : 0

  // 連莊紅框（隔期 0 上）：
  //   = 該期當時隔期 0 剩餘 ∩ 隔期 1 對應期 numbers
  //   = t-1 期 numbers ∩ t-2 期 numbers
  //   傳統連莊號定義（連續兩期重疊的號）
  const prevPrev = histBD.length >= 2 ? histBD[histBD.length - 2] : null
  const refSet = prevPrev ? new Set(prevPrev.numbers) : new Set<number>()
  const period0Remaining = perInterval[0]?.remainingNumbers ?? []
  const carryoverInPeriod0 = period0Remaining.filter(n => refSet.has(n))

  const originDistribution: OriginDistributionData = {
    perInterval,
    totalHits,
    totalRemaining,
    carryoverInPeriod0
  }

  // 觀察文字：4 行隔期 + 1 行彙總
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
  description: '統計最新期 20 顆主號分別來自隔期 0-3 哪一格，顯示命中/剩餘、0-3 彙總百分比、隔期 0-3 剩餘號碼總覽（連莊號紅框）；觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
