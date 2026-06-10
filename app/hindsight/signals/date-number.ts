/**
 * 日期號（date_number）—— 預測型訊號（三桶獨立子判定，2026-06-11 拍板）
 *
 * 三個歷史桶 (-1) / (0) / (+1)：掃所有歷史，每期分別檢查
 *   - 桶 (-1)：該期主號含「該期日期數 -1」（且 d'-1 在彩種範圍）→ +1 hit
 *   - 桶 (0)：該期主號含「該期日期數」                          → +1 hit
 *   - 桶 (+1)：該期主號含「該期日期數 +1」（且 d'+1 在彩種範圍）→ +1 hit
 *   同期可同時被多桶計入。
 *
 * 今日候選：c₋₁ = d−1、c₀ = d、c₊₁ = d+1。某 c 不在彩種範圍 → 該位置整個跳過。
 *
 * 三個子判定（A = 桶(-1) ↔ c₋₁、B = 桶(0) ↔ c₀、C = 桶(+1) ↔ c₊₁），每個獨立評：
 *   1. 對應今日候選不在彩種範圍 → 跳過、不亮、不推
 *   2. 該桶 hit < 2          → 不亮、不推
 *   3. hit ≥ 2               → 平均間隔（期數差）+ gap = 最新期 − 該桶末次 hit；
 *                              若 gap ≥ 平均 → 亮、推該位置的今日候選號
 *
 * 整體：三子判定任一亮 → 訊號亮；picks = 亮的子判定對應今日候選號聯集（升序）。
 * pickGroups 按子判定分組。
 *
 * 適用彩種：lotto539 / lotto649 / super_lotto638（賓果不適用）
 *
 * 規格來源：docs/HINDSIGHT-SIGNALS-AUDIT.md（2026-06-11 拍板：重寫成三桶獨立子判定）
 */

import { GAMES, type GameId } from '../../../shared/lotto/games'
import type { PickGroup, SignalDef, SignalEvalParams, SignalEvaluation } from '../types'

const ID = 'date_number'
const APPLIES_TO: readonly GameId[] = ['lotto539', 'lotto649', 'super_lotto638']

function dayOf(dateStr: string): number | null {
  if (!dateStr || dateStr.length < 10) return null
  const d = Number.parseInt(dateStr.slice(8, 10), 10)
  return Number.isFinite(d) ? d : null
}

type BucketKey = 'minus1' | 'zero' | 'plus1'

interface Subjudgment {
  key: BucketKey
  offset: -1 | 0 | 1
  label: string
}

const SUBJUDGMENTS: readonly Subjudgment[] = [
  { key: 'minus1', offset: -1, label: '日期 −1' },
  { key: 'zero', offset: 0, label: '日期' },
  { key: 'plus1', offset: 1, label: '日期 +1' }
]

function evaluate(params: SignalEvalParams): SignalEvaluation {
  if (params.gameId === 'bingo_bingo') return { fires: false, picks: [] }

  const meta = GAMES[params.gameId]
  const todayD = dayOf(params.todayDate)
  if (todayD == null) return { fires: false, picks: [] }

  const history = params.history
  if (history.length === 0) return { fires: false, picks: [] }

  // 三個歷史桶獨立累積。每期分別檢查 d'-1、d'、d'+1 是否落在主號裡。
  const buckets: Record<BucketKey, number[]> = {
    minus1: [],
    zero: [],
    plus1: []
  }
  for (const draw of history) {
    const d = dayOf(draw.drawDate)
    if (d == null) continue
    const numSet = new Set(draw.numbers)
    for (const sj of SUBJUDGMENTS) {
      const target = d + sj.offset
      if (target < meta.numberMin || target > meta.numberMax) continue
      if (numSet.has(target)) buckets[sj.key].push(draw.drawTerm)
    }
  }

  const currentTerm = history[history.length - 1]!.drawTerm

  const litNumbers: number[] = []
  const pickGroups: PickGroup[] = []

  for (const sj of SUBJUDGMENTS) {
    const candidate = todayD + sj.offset
    // 子判定 1：候選不在彩種範圍 → 跳過
    if (candidate < meta.numberMin || candidate > meta.numberMax) continue
    const hits = buckets[sj.key]
    // 子判定 2：桶 hit < 2 → 不亮
    if (hits.length < 2) continue
    // 子判定 3：平均間隔（相鄰平均 = (末 − 首) / (n − 1)）
    const meanInterval = (hits[hits.length - 1]! - hits[0]!) / (hits.length - 1)
    const lastHit = hits[hits.length - 1]!
    const gap = currentTerm - lastHit
    if (gap < meanInterval) continue
    // 亮 → 推該位置的今日候選號
    litNumbers.push(candidate)
    pickGroups.push({ label: `${sj.label}：${candidate}`, numbers: [candidate] })
  }

  if (litNumbers.length === 0) return { fires: false, picks: [] }

  const picks = [...new Set(litNumbers)].sort((a, b) => a - b)
  return { fires: true, picks, pickGroups }
}

export const dateNumberSignal: SignalDef = {
  id: ID,
  nameZh: '日期號',
  description: '三桶獨立子判定：日期 −1 / 日期 / 日期 +1 各自評估歷史命中、gap ≥ 平均間隔時亮燈推該位置候選號（賓果不適用）',
  appliesTo: [...APPLIES_TO],
  evaluate
}
