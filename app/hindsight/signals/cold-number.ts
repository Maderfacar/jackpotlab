/**
 * 要開冷門號啦（cold_number）—— 預測型訊號
 *
 * 觸發條件：analysisState.history 的 values 欄位（CSV，每期 K 個整數），
 *   從最新一期往回掃，連續 ≥ 2 期「每期 K 顆主號的 values 值全部 < 10」。
 *   只要該期有任一有效位置 ≥ 10 就算當期不合格、鏈中斷。
 * 推薦策略：掃 analysisState.periods 所有 slot，若 record 最左值（即最新隔期值）
 *   嚴格 > 10，則該 slot.prizes 加入 picks，按隔期分組。
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：docs/HINDSIGHT-SIGNALS-AUDIT.md（2026-06-11 拍板：任一位置 → 全部位置）
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

  // 2026-06-11 拍板：每期 K 顆主號的 values 值「全部」< 10 才算該期合格。
  // 從最新一期往回掃，找連續合格的最大期數 K。
  // 注意：必須至少有一個有效（finite）值，且所有有效值都 < 10。
  function rowQualifies(row: number[]): boolean {
    let sawFinite = false
    for (const v of row) {
      if (v === undefined || !Number.isFinite(v)) continue
      sawFinite = true
      if (v >= 10) return false
    }
    return sawFinite
  }
  let bestK = 0
  for (const r of rows) {
    if (rowQualifies(r)) bestK++
    else break
  }
  if (bestK < 2) return { fires: false, picks: [] }

  // Picks：record 最左值 > 10（嚴格）的 slot
  const pickGroups: PickGroup[] = []
  const emptyGroupLabels: string[] = [`觸發：連續 ${bestK} 期所有位置 < 10（冷門訊號）`]
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
  description: '連續 ≥ 2 期所有位置 values 值都 < 10 時亮燈，推所有隔期最新值 > 10 的冷門號',
  appliesTo: [...APPLIES_TO],
  evaluate
}
