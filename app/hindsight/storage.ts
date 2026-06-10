/**
 * BrainState 的 localStorage 持久化。
 *
 * Phase 1 不寫 Firebase（[[project-brain-design-decisions]]「記憶層級」），
 * 只用 localStorage 保住「跨頁、跨開關」的成績單。
 *
 * key schema：`jackpotlab-hindsight-{gameId}-v1`
 * sweepStaleHindsightStorage：mount 時掃舊 schema，避免使用者卡在不相容版本。
 */

import { GAMES, isGameId } from '../../shared/lotto/games'
import type { GameId } from '../../shared/lotto/games'
import type { BrainState } from './types'

const STORAGE_PREFIX = 'jackpotlab-hindsight'
// v3: observation 訊號改 fires=true 累積 totalFires；舊 v2 的觀察型 scorecard
// 都是 0，必須整顆重跑才能在歷史回放中累積出觀察次數。
// 同時：cold_number 觸發語意從「位置鎖定」改「任一位置」，重新打分結果不同。
const STORAGE_VERSION = 3

export function brainStateKey(gameId: GameId): string {
  return `${STORAGE_PREFIX}-${gameId}-v${STORAGE_VERSION}`
}

/**
 * 嚴格校驗：v 必須等於當前 STORAGE_VERSION、gameId 必須吻合且合法、
 * scorecards / alerts 必須是物件 / 陣列。任何不符即回 null（呼叫端會重跑 replay）。
 */
export function loadBrainState(gameId: GameId): BrainState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(brainStateKey(gameId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrainState>
    if (!parsed || parsed.v !== STORAGE_VERSION) return null
    if (parsed.gameId !== gameId) return null
    if (!isGameId(parsed.gameId)) return null
    if (!parsed.scorecards || typeof parsed.scorecards !== 'object') return null
    if (!Array.isArray(parsed.alerts)) return null
    return parsed as BrainState
  } catch {
    return null
  }
}

export function saveBrainState(state: BrainState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(brainStateKey(state.gameId), JSON.stringify(state))
  } catch {
    // localStorage quota / disabled / private window — swallow（資料下次 replay 還會重算）
  }
}

/**
 * 把 `jackpotlab-hindsight-` 開頭但版本不對、或 gameId 不在 GAMES 內的 key 全掃掉。
 * 對齊 app/utils/analysis.ts 的 sweepStaleAnalysisStorage 模式：每次 mount 跑一次。
 */
export function sweepStaleHindsightStorage(): void {
  if (typeof window === 'undefined') return
  const validKeys = new Set<string>()
  for (const id of Object.keys(GAMES) as GameId[]) {
    validKeys.add(brainStateKey(id))
  }
  const toRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(`${STORAGE_PREFIX}-`) && !validKeys.has(k)) {
      toRemove.push(k)
    }
  }
  for (const k of toRemove) {
    try {
      window.localStorage.removeItem(k)
    } catch {
      // ignore
    }
  }
}
