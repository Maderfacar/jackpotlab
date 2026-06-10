/**
 * 隔期總和（interval_sum）—— 觀察型訊號
 *
 * 觸發條件：analysisState.history 的 sum 序列從最新一期往回看，
 *   存在「至少 3 個連續同向 transition」（即至少 4 個值嚴格單調）。
 * 推薦策略：無號可推（fires 永遠 false），亮燈時以 emptyGroupLabels
 *   呈現「已連續變大/變小 K 期，數值變化 v1→v2→...」。
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：docs/HINDSIGHT-SIGNALS-AUDIT.md（2026-06-11 拍板：≥ 2 改 ≥ 3）
 */

import type { GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'interval_sum'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') return { fires: false, picks: [] }

  const hist = params.analysisState.history
  // 取 sum 為有效數字的序列（空字串跳過）
  const sums: number[] = []
  for (const h of hist) {
    if (typeof h.sum === 'number' && Number.isFinite(h.sum)) sums.push(h.sum)
  }
  // 至少 3 個值才有 2 個 transition
  if (sums.length < 3) return { fires: false, picks: [] }

  // 從尾端往前掃連續同向鏈
  const n = sums.length
  const last = sums[n - 1]!
  const prev = sums[n - 2]!
  if (last === prev) return { fires: false, picks: [] }

  const dir: 1 | -1 = last > prev ? 1 : -1
  const chain: number[] = [prev, last]
  for (let i = n - 3; i >= 0; i--) {
    const v = sums[i]!
    const next = chain[0]!
    if ((dir === 1 && v < next) || (dir === -1 && v > next)) {
      chain.unshift(v)
    } else {
      break
    }
  }

  const transitions = chain.length - 1
  // 2026-06-11 拍板：門檻從 ≥ 2 改成 ≥ 3（連續 4 期以上嚴格單調）
  if (transitions < 3) return { fires: false, picks: [] }

  const arrow = chain.join('→')
  const dirLabel = dir === 1 ? '變大' : '變小'
  const label = `已連續${dirLabel} ${transitions} 期：${arrow}`

  // 觀察型：fires=true 讓 scorecard 累積「已觀察次數」，picks=[] 不進排名
  return {
    fires: true,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: [label]
  }
}

export const intervalSumSignal: SignalDef = {
  id: ID,
  nameZh: '隔期總和',
  description: '最近 N 期隔期總和連續同向（≥ 3 個 transition，即連 4 期以上嚴格單調）時亮燈，顯示數值變化；不推號',
  kind: 'observation',
  appliesTo: [...APPLIES_TO],
  evaluate
}
