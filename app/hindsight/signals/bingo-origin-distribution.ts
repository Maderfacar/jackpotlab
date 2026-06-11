/**
 * 獎號隔期來源（bingo_origin_distribution）—— 觀察型訊號
 *
 * 對「最新一期 T-1（從 evaluate 角度看的 history[length-1]）」的 20 顆主號，
 * 統計它們分別來自隔期 0..5 哪一格。
 *
 * - 隔期 0 = 該期當時的上一期（T-2 in absolute time）
 * - 隔期 i = 該期當時的往前第 i+1 期
 *
 * 每一行：「隔期 j：{命中數}/{該期當時剩餘獎號數}」
 *
 * 分子（命中數）：history[len-1].periods csv 中值等於 j 的數量
 *   （periods csv 是 applyNewDraws 在 Step a 用「處理該期前的隔期表」算的、
 *    所以 csv 中的索引就是該期當時的隔期格索引）
 * 分母（該期當時剩餘獎號數）：analysisState.periods[j+1].prizes.length + 命中數
 *   （現在的 periods[j+1] = 該期當時的 periods[j]，且已扣掉該期撈中的部分，
 *    把該期命中數加回去就還原成「該期 evaluate 時的剩餘獎號數」）
 *
 * 適用彩種：bingo_bingo only（每期 20 顆 + 隔期表 N>=60 的前提）
 *
 * 規格來源：使用者拍板（2026-06-11），詳見 docs/HINDSIGHT-SIGNALS-AUDIT.md
 */

import type { GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'bingo_origin_distribution'
const APPLIES_TO: readonly GameId[] = ['bingo_bingo']
const SLOT_COUNT = 6 // 隔期 0..5

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

  const hist = params.analysisState.history
  if (hist.length === 0) return { fires: false, picks: [] }

  const latest = hist[hist.length - 1]!
  const periodIdxs = parsePeriodsCsv(latest.periods)
  if (periodIdxs.length === 0) return { fires: false, picks: [] }

  const slots = params.analysisState.periods
  // 需要 periods[1..6]（對應該期當時隔期 0..5），不足直接不亮
  if (slots.length < SLOT_COUNT + 1) return { fires: false, picks: [] }

  const labels: string[] = []
  for (let j = 0; j < SLOT_COUNT; j++) {
    let hits = 0
    for (const idx of periodIdxs) {
      if (idx === j) hits++
    }
    const slot = slots[j + 1]!
    const remainingAtThatTime = slot.prizes.length + hits
    labels.push(`隔期 ${j}：${hits}/${remainingAtThatTime}`)
  }

  return {
    fires: true,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: labels
  }
}

export const bingoOriginDistributionSignal: SignalDef = {
  id: ID,
  nameZh: '獎號隔期來源',
  description: '統計最新期 20 顆主號分別來自隔期 0-5 哪一格，顯示「命中數/該期當時剩餘獎號數」；觀察型、不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
