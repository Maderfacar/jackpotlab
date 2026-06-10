/**
 * 隔期連續號（consecutive_chain）
 *
 * 觸發條件：最近 2 期 (N-1, N) 形成 +1 或 -1 同方向連續對
 * 推薦策略：對的延續號（pair.curr + direction），升序、過濾彩種範圍
 *
 * 兩方向可並存；只推延續號（不是 N 期所有號 ±1）。
 *
 * 規格來源：memory project-brain-signals-batch-2（2026-06-10 對齊：3 期→2 期）
 */

import { GAMES, type GameId } from '../../../shared/lotto/games'
import type { BrainDraw, PickGroup, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'consecutive_chain'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638', 'bingo_bingo']

interface ConsecPair {
  prev: number
  curr: number
}

function pairsBetween(prevDraw: BrainDraw, currDraw: BrainDraw, direction: 1 | -1): ConsecPair[] {
  const currSet = new Set(currDraw.numbers)
  const out: ConsecPair[] = []
  for (const x of prevDraw.numbers) {
    const target = x + direction
    if (currSet.has(target)) out.push({ prev: x, curr: target })
  }
  return out
}

function chainTails(pairs: ConsecPair[], direction: 1 | -1, min: number, max: number): number[] {
  const tails: number[] = []
  for (const pair of pairs) {
    const next = pair.curr + direction
    if (next >= min && next <= max) tails.push(next)
  }
  return tails
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  const history = params.history
  if (history.length < 2) return { fires: false, picks: [] }

  const meta = GAMES[params.gameId]
  const min = meta.numberMin
  const max = meta.numberMax

  const periodN1 = history[history.length - 2]!
  const periodN = history[history.length - 1]!

  const ascPairs = pairsBetween(periodN1, periodN, 1)
  const descPairs = pairsBetween(periodN1, periodN, -1)

  const ascTails = chainTails(ascPairs, 1, min, max)
  const descTails = chainTails(descPairs, -1, min, max)

  const ascPicks = [...new Set(ascTails)].sort((a, b) => a - b)
  const descPicks = [...new Set(descTails)].sort((a, b) => a - b)

  const allSet = new Set<number>([...ascPicks, ...descPicks])
  const picks = [...allSet].sort((a, b) => a - b)

  const pickGroups: PickGroup[] = []
  if (ascPicks.length > 0) pickGroups.push({ label: '上升鏈 (+1)', numbers: ascPicks })
  if (descPicks.length > 0) pickGroups.push({ label: '下降鏈 (-1)', numbers: descPicks })

  const fires = picks.length > 0

  const evaluation: SignalEvaluation = {
    fires,
    picks
  }
  if (pickGroups.length > 0) evaluation.pickGroups = pickGroups
  return evaluation
}

export const consecutiveChainSignal: SignalDef = {
  id: ID,
  nameZh: '隔期連續號',
  description: '最近 2 期形成 +1 或 -1 同方向連續鏈時，推鏈的下一個延續號碼',
  appliesTo: [...APPLIES_TO],
  evaluate
}
