/**
 * 絕地定位（position_distribution）—— 觀察型訊號
 *
 * 觸發條件：analysisState.history 至少 1 期且 positions 欄位非空。
 * 推薦策略：無號可推。亮燈時以 emptyGroupLabels 顯示最新一期 5 個 y 值的組成，
 *   以及最近 30 期累積 y 值分佈次數。
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：memory project-brain-signals-batch-2
 */

import type { GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'position_distribution'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']
const RECENT_WINDOW = 30

function parseYs(positions: string | undefined): number[] {
  if (!positions) return []
  const out: number[] = []
  for (const cell of positions.split(',')) {
    if (!cell) continue
    const parts = cell.split('-')
    if (parts.length !== 2) continue
    const y = Number.parseInt(parts[1]!, 10)
    if (Number.isFinite(y)) out.push(y)
  }
  return out
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') return { fires: false, picks: [] }

  const hist = params.analysisState.history
  if (hist.length === 0) return { fires: false, picks: [] }

  const latest = hist[hist.length - 1]!
  const latestYs = parseYs(latest.positions)
  if (latestYs.length === 0) return { fires: false, picks: [] }

  const counts = new Map<number, number>()
  const window = hist.slice(-RECENT_WINDOW)
  for (const h of window) {
    for (const y of parseYs(h.positions)) {
      counts.set(y, (counts.get(y) ?? 0) + 1)
    }
  }
  const sortedKeys = [...counts.keys()].sort((a, b) => a - b)
  const distribution = sortedKeys.map(k => `y=${k}:${counts.get(k)}`).join(' / ')

  const labels: string[] = [
    `本期 y 組成：[${latestYs.join(', ')}]`,
    `近 ${window.length} 期分佈：${distribution || '（無資料）'}`
  ]

  return {
    fires: false,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: labels
  }
}

export const positionDistributionSignal: SignalDef = {
  id: ID,
  nameZh: '絕地定位',
  description: '回顧獎號在所屬隔期內的位置 y 值組成；不推號',
  appliesTo: [...APPLIES_TO],
  evaluate
}
