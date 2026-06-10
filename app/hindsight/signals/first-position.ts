/**
 * 第 1 號位置（first_position）—— 預測型訊號（賓果專用）
 *
 * 觸發條件：每期都可亮燈（只要能湊出 ≥ 1 個 pick）
 * 推薦策略：
 *   - 最新 1 期：history[-1].numbers[0]（升序最小）。若也出現在 history[-2] → 視為連莊，扣除
 *   - 隔期 1、2、3：analysisState.periods[1..3] 各自 .prizes[0]（已升序）
 *   - 去重、過濾彩種範圍、升序、最多 4 個
 *
 * 適用彩種：bingo_bingo only
 *
 * 規格來源：memory project-brain-signals-batch-3
 */

import { GAMES, type GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'first_position'
const APPLIES_TO: readonly GameId[] = ['bingo_bingo']

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId !== 'bingo_bingo') return { fires: false, picks: [] }
  const h = params.history
  if (h.length === 0) return { fires: false, picks: [] }

  const meta = GAMES[params.gameId]
  const min = meta.numberMin
  const max = meta.numberMax

  const candidates: number[] = []
  const latestSorted = [...h[h.length - 1]!.numbers].sort((a, b) => a - b)
  const latestFirst = latestSorted[0]
  if (latestFirst !== undefined) {
    const prevSet = h.length >= 2 ? new Set(h[h.length - 2]!.numbers) : new Set<number>()
    if (!prevSet.has(latestFirst)) {
      candidates.push(latestFirst)
    }
  }

  const periods = params.analysisState.periods
  for (const idx of [1, 2, 3] as const) {
    const slot = periods[idx]
    if (!slot || slot.prizes.length === 0) continue
    candidates.push(slot.prizes[0]!)
  }

  const picks = [...new Set(candidates)]
    .filter(n => n >= min && n <= max)
    .sort((a, b) => a - b)
  const fires = picks.length > 0

  const evaluation: SignalEvaluation = { fires, picks }
  if (fires) {
    evaluation.pickGroups = [{ label: '第一位置（最新+隔期1-3）', numbers: picks }]
  }
  return evaluation
}

export const firstPositionSignal: SignalDef = {
  id: ID,
  nameZh: '第 1 號位置',
  description: '推最新 1 期 + 隔期 1-3 的第一個位置號（最新若連莊則扣除，賓果專用）',
  appliesTo: [...APPLIES_TO],
  evaluate
}
