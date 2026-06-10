/**
 * 要開冷門號啦（cold_number）—— 預測型訊號
 *
 * 觸發條件（位置鎖定）：analysisState.history 的 values 欄位（CSV，每期 K 個整數），
 *   從最新一期往回掃，存在「某一相同位置」連續 ≥ 2 期皆 < 10。
 * 推薦策略：掃 analysisState.periods 所有 slot，若 record 最左值（即最新隔期值）
 *   嚴格 > 10，則該 slot.prizes 加入 picks，按隔期分組。
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：memory project-brain-signals-batch-2
 */

import type { GameId } from '../../../shared/lotto/games'
import type { PickGroup, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'cold_number'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

function parseValuesRow(values: string | undefined): number[] {
  if (!values) return []
  return values.split(',').map((s) => {
    if (s === '') return Number.NaN
    const v = Number.parseInt(s, 10)
    return Number.isFinite(v) ? v : Number.NaN
  })
}

function parseLeftValue(record: string): number {
  if (!record) return Number.NaN
  const first = record.split(',')[0]
  if (!first) return Number.NaN
  const v = Number.parseInt(first, 10)
  return Number.isFinite(v) ? v : Number.NaN
}

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') return { fires: false, picks: [] }

  const hist = params.analysisState.history
  if (hist.length < 2) return { fires: false, picks: [] }

  // Reverse-chronological：rows[0] = 最新一期的 values
  const rows: number[][] = []
  for (let i = hist.length - 1; i >= 0; i--) {
    const row = parseValuesRow(hist[i]!.values)
    if (row.length === 0) break
    rows.push(row)
  }
  if (rows.length < 2) return { fires: false, picks: [] }

  const positions = rows[0]!.length
  // 找位置鎖定的最大連續期數 K：某 p ∈ [0, positions) 使 rows[0..K) 在 p 位置皆 < 10
  let bestK = 0
  for (let p = 0; p < positions; p++) {
    let k = 0
    for (const r of rows) {
      const v = r[p]
      if (v !== undefined && Number.isFinite(v) && v < 10) k++
      else break
    }
    if (k > bestK) bestK = k
  }
  if (bestK < 2) return { fires: false, picks: [] }

  // Picks：record 最左值 > 10（嚴格）的 slot
  const pickGroups: PickGroup[] = []
  const emptyGroupLabels: string[] = [`觸發：連續 ${bestK} 期某位置 < 10（冷門訊號）`]
  for (const slot of params.analysisState.periods) {
    if (slot.record === '') continue
    const leftVal = parseLeftValue(slot.record)
    if (!Number.isFinite(leftVal) || leftVal <= 10) continue
    const label = `隔期 ${slot.period} (值 ${leftVal})`
    if (slot.prizes.length > 0) {
      pickGroups.push({ label, numbers: [...slot.prizes] })
    } else {
      emptyGroupLabels.push(label)
    }
  }

  const picksSet = new Set<number>()
  for (const g of pickGroups) for (const n of g.numbers) picksSet.add(n)
  const picks = [...picksSet].sort((a, b) => a - b)
  const fires = pickGroups.length > 0

  const evaluation: SignalEvaluation = { fires, picks }
  if (pickGroups.length > 0) evaluation.pickGroups = pickGroups
  if (emptyGroupLabels.length > 0) {
    evaluation.conditionMetButEmpty = true
    evaluation.emptyGroupLabels = emptyGroupLabels
  }
  return evaluation
}

export const coldNumberSignal: SignalDef = {
  id: ID,
  nameZh: '要開冷門號啦',
  description: '位置鎖定連續 ≥ 2 期 < 10 時亮燈，推所有隔期最新值 > 10 的冷門號',
  appliesTo: [...APPLIES_TO],
  evaluate
}
