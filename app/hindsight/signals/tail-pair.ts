/**
 * 尾號複數（tail_pair）—— 觀察型訊號（純回顧）
 *
 * 觸發條件：最新一期出現「尾號複數」事件（≥ 2 顆主號尾數相同）。
 * 推薦策略：無號可推。亮燈時以 emptyGroupLabels 顯示累積規律：
 *   - 連莊同尾 N1 次：下一期有同尾、且同尾號其中之一與當期完全一致
 *   - 不連莊同尾 N2 次：下一期有同尾、但同尾號完全不同
 *   - 無同尾 N3 次：下一期沒出現任何尾號複數
 *   - 「已 X 次沒出現不連莊同尾」/「已 Y 次沒出現連莊同尾」
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：memory project-brain-signals-batch-2
 */

import type { GameId } from '../../../shared/lotto/games'
import type { BrainDraw, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'tail_pair'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

function sameTailNumbers(numbers: number[]): number[] {
  const byTail = new Map<number, number[]>()
  for (const n of numbers) {
    const t = ((n % 10) + 10) % 10
    const arr = byTail.get(t) ?? []
    arr.push(n)
    byTail.set(t, arr)
  }
  const out: number[] = []
  for (const arr of byTail.values()) {
    if (arr.length >= 2) out.push(...arr)
  }
  return out
}

type Outcome = 'continue' | 'different' | 'noSameTail'

function classify(curr: BrainDraw, next: BrainDraw): Outcome | null {
  const currSame = sameTailNumbers(curr.numbers)
  if (currSame.length === 0) return null
  const nextSame = sameTailNumbers(next.numbers)
  if (nextSame.length === 0) return 'noSameTail'
  const currSet = new Set(currSame)
  const overlap = next.numbers.some(n => currSet.has(n))
  return overlap ? 'continue' : 'different'
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') return { fires: false, picks: [] }
  const history = params.history
  if (history.length === 0) return { fires: false, picks: [] }

  const latest = history[history.length - 1]!
  const latestHasPair = sameTailNumbers(latest.numbers).length > 0
  if (!latestHasPair) return { fires: false, picks: [] }

  // 掃 history 所有 (curr → next) 對，curr 有尾號複數才計入
  const events: Outcome[] = []
  for (let i = 0; i < history.length - 1; i++) {
    const out = classify(history[i]!, history[i + 1]!)
    if (out) events.push(out)
  }

  const counts = { continue: 0, different: 0, noSameTail: 0 }
  for (const e of events) counts[e]++

  // 從最末往前數「自上次 different 後幾次」與「自上次 continue 後幾次」
  let sinceDifferent = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] === 'different') break
    sinceDifferent++
  }
  let sinceContinue = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] === 'continue') break
    sinceContinue++
  }

  const sameTailNums = sameTailNumbers(latest.numbers).sort((a, b) => a - b)
  const tailListLabel = `本期同尾號：${sameTailNums.join(', ')}`

  const labels: string[] = [tailListLabel]
  if (events.length === 0) {
    labels.push('歷史紀錄：尚無 (curr→next) 樣本')
  } else {
    labels.push(`歷史紀錄：連莊同尾 ${counts.continue} 次 / 不連莊同尾 ${counts.different} 次 / 無同尾 ${counts.noSameTail} 次`)
    if (counts.different > 0 && sinceDifferent > 0) {
      labels.push(`已 ${sinceDifferent} 次沒出現不連莊同尾`)
    }
    if (counts.continue > 0 && sinceContinue > 0) {
      labels.push(`已 ${sinceContinue} 次沒出現連莊同尾`)
    }
  }

  return {
    fires: false,
    picks: [],
    conditionMetButEmpty: true,
    emptyGroupLabels: labels
  }
}

export const tailPairSignal: SignalDef = {
  id: ID,
  nameZh: '尾號複數',
  description: '當期出現尾號複數事件時亮燈，回顧連莊/不連莊/無同尾的歷史規律；不推號',
  appliesTo: [...APPLIES_TO],
  evaluate
}
