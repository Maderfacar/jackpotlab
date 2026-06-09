/**
 * 隔期均值（interval_mean）
 *
 * 觸發條件：某個 slot 的當前未中天數 >= 該 slot 自己的 record 陣列均值
 * 推薦策略：該 slot 的 prizes（按 slot 分組推薦，不壓平展示）
 *
 * 規格來源：memory project-brain-signals-batch-1
 */

import type { GameId } from '../../../shared/lotto/games'
import type { PickGroup, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'interval_mean'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638', 'bingo_bingo']

function parseRecord(record: string): number[] {
  if (!record) return []
  const out: number[] = []
  for (const part of record.split(',')) {
    if (!part) continue
    const v = Number.parseInt(part, 10)
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  const pickGroups: PickGroup[] = []
  const emptyGroupLabels: string[] = []

  for (const slot of params.analysisState.periods) {
    if (slot.record === '') continue
    const values = parseRecord(slot.record)
    if (values.length === 0) continue
    const sum = values.reduce((a, b) => a + b, 0)
    const mean = sum / values.length
    const latest = values[0]!
    if (latest >= mean) {
      const label = `隔期 ${slot.period}`
      if (slot.prizes.length > 0) {
        pickGroups.push({ label, numbers: [...slot.prizes] })
      } else {
        emptyGroupLabels.push(label)
      }
    }
  }

  const picksSet = new Set<number>()
  for (const g of pickGroups) for (const n of g.numbers) picksSet.add(n)
  const picks = [...picksSet].sort((a, b) => a - b)

  const conditionMetButEmpty = emptyGroupLabels.length > 0
  const fires = pickGroups.length > 0

  const evaluation: SignalEvaluation = {
    fires,
    picks
  }
  if (pickGroups.length > 0) evaluation.pickGroups = pickGroups
  if (conditionMetButEmpty) {
    evaluation.conditionMetButEmpty = true
    evaluation.emptyGroupLabels = emptyGroupLabels
  }
  return evaluation
}

export const intervalMeanSignal: SignalDef = {
  id: ID,
  nameZh: '隔期均值',
  description: '某個 slot 的當前未中天數 >= 該 slot 自己的記錄陣列均值時亮燈',
  appliesTo: [...APPLIES_TO],
  evaluate
}
