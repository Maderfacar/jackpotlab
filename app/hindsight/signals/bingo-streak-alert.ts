/**
 * 連莊警示（streak_alert）—— 預測型訊號（賓果專用）
 *
 * 觸發條件：最近 2 個 transition（N-2→N-1 與 N-1→N）的連莊號數量皆 < 5。
 *   「連莊號數量」= |prev.numbers ∩ curr.numbers|。
 * 推薦策略：最新一期 numbers 扣掉與前一期 numbers 的交集（即「本期新號」）。
 *
 * 適用彩種：bingo_bingo only
 *
 * 規格來源：memory project-brain-signals-batch-3
 */

import type { GameId } from '../../../shared/lotto/games'
import type { BrainDraw, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'streak_alert'
const APPLIES_TO: readonly GameId[] = ['bingo_bingo']
const STREAK_THRESHOLD = 5

function overlapSize(a: BrainDraw, b: BrainDraw): number {
  const set = new Set(a.numbers)
  let n = 0
  for (const x of b.numbers) if (set.has(x)) n++
  return n
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId !== 'bingo_bingo') return { fires: false, picks: [] }
  const h = params.history
  if (h.length < 3) return { fires: false, picks: [] }

  const N2 = h[h.length - 3]!
  const N1 = h[h.length - 2]!
  const N = h[h.length - 1]!

  const t1 = overlapSize(N2, N1)
  const t2 = overlapSize(N1, N)
  if (t1 >= STREAK_THRESHOLD || t2 >= STREAK_THRESHOLD) {
    return { fires: false, picks: [] }
  }

  const prevSet = new Set(N1.numbers)
  const carryOver = N.numbers.filter(x => prevSet.has(x))
  const newOnes = N.numbers.filter(x => !prevSet.has(x))
  const picks = [...new Set(newOnes)].sort((a, b) => a - b)
  const fires = picks.length > 0

  const evaluation: SignalEvaluation = { fires, picks }
  evaluation.conditionMetButEmpty = true
  evaluation.emptyGroupLabels = [
    `連莊號數量：N-2→N-1 = ${t1}、N-1→N = ${t2}（皆 < ${STREAK_THRESHOLD}）`,
    `本期連莊 (${carryOver.length} 顆)：${carryOver.length === 0 ? '無' : carryOver.sort((a, b) => a - b).join(', ')}`
  ]
  return evaluation
}

export const streakAlertSignal: SignalDef = {
  id: ID,
  nameZh: '連莊警示',
  description: '最近 2 個 transition 連莊號 < 5 時亮燈，推本期非連莊號（賓果專用）',
  appliesTo: [...APPLIES_TO],
  evaluate
}
