/**
 * 日期號（date_number）
 *
 * 觸發條件：當天日期對應的號碼 ±1（候選 = [d-1, d, d+1] 過濾彩種範圍），
 *           距離上次「日期號出現」的間隔 >= 歷史平均間隔
 * 推薦策略：當天的候選號碼（升序）
 *
 * 賓果不適用（直接 fires=false）；只看主號碼。
 *
 * 規格來源：memory project-brain-signals-batch-1
 */

import { GAMES, type GameId } from '../../../shared/lotto/games'
import type { SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'date_number'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

function dayOf(dateStr: string): number | null {
  if (!dateStr || dateStr.length < 10) return null
  const d = Number.parseInt(dateStr.slice(8, 10), 10)
  return Number.isFinite(d) ? d : null
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') {
    return { fires: false, picks: [] }
  }
  const meta = GAMES[params.gameId]

  const todayD = dayOf(params.todayDate)
  if (todayD == null) return { fires: false, picks: [] }

  const candidates = [todayD - 1, todayD, todayD + 1]
    .filter(n => n >= meta.numberMin && n <= meta.numberMax)
  if (candidates.length === 0) return { fires: false, picks: [] }

  const history = params.history
  if (history.length === 0) return { fires: false, picks: [] }

  const hitTerms: number[] = []
  for (const draw of history) {
    const d = dayOf(draw.drawDate)
    if (d == null) continue
    const cands = [d - 1, d, d + 1].filter(n => n >= meta.numberMin && n <= meta.numberMax)
    if (cands.length === 0) continue
    const candSet = new Set(cands)
    if (draw.numbers.some(n => candSet.has(n))) {
      hitTerms.push(draw.drawTerm)
    }
  }

  if (hitTerms.length < 2) return { fires: false, picks: [] }

  let intervalSum = 0
  for (let i = 1; i < hitTerms.length; i++) {
    intervalSum += hitTerms[i]! - hitTerms[i - 1]!
  }
  const meanInterval = intervalSum / (hitTerms.length - 1)

  const lastTerm = hitTerms[hitTerms.length - 1]!
  const currentTerm = history[history.length - 1]!.drawTerm
  const gap = currentTerm - lastTerm

  if (gap < meanInterval) return { fires: false, picks: [] }

  const picks = [...candidates].sort((a, b) => a - b)
  return { fires: true, picks }
}

export const dateNumberSignal: SignalDef = {
  id: ID,
  nameZh: '日期號',
  description: '當天日期對應的號碼 ±1，距上次出現超過平均間隔時亮燈（賓果不適用）',
  appliesTo: [...APPLIES_TO],
  evaluate
}
