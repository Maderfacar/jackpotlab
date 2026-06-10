/**
 * 絕地定位（position_distribution）—— 觀察型訊號
 *
 * 觸發條件：analysisState.history 至少 1 期且 positions 欄位非空。
 * 推薦策略：無號可推。亮燈時：
 *   - emptyGroupLabels 顯示最新一期 y 值組成（字串）+ 最近 N 期累積分佈
 *   - observationData.latestYs 提供結構化 y 值陣列，供 UI 染色 chip 渲染
 *
 * 觀察窗：使用 params.analysisState.n（隨使用者選的 N 變動）
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：docs/HINDSIGHT-SIGNALS-AUDIT.md（2026-06-11 拍板：固定 30 → N、加染色）
 */

import type { GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'position_distribution'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

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

  // 2026-06-11 拍板：觀察窗從固定 30 改成 params.analysisState.n
  const windowSize = params.analysisState.n
  const counts = new Map<number, number>()
  const window = hist.slice(-windowSize)
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
    fires: true,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: labels,
    observationData: { latestYs }
  }
}

export const positionDistributionSignal: SignalDef = {
  id: ID,
  nameZh: '絕地定位',
  description: '回顧獎號在所屬隔期內的位置 y 值組成；不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
