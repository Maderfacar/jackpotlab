/**
 * 訊號註冊表。W1 初始為空；W2 才會 import 各訊號模組做 registerSignal。
 *
 * 雙重註冊會 throw — 避免同樣的訊號被加兩次混亂排名。
 */

import type { GameId } from '../../shared/lotto/games'
import type { SignalDef } from './types'

export const signalRegistry: Map<string, SignalDef> = new Map()

export function registerSignal(def: SignalDef): void {
  if (signalRegistry.has(def.id)) {
    throw new Error(`Signal already registered: ${def.id}`)
  }
  signalRegistry.set(def.id, def)
}

export function getSignalsForGame(gameId: GameId): SignalDef[] {
  const out: SignalDef[] = []
  for (const def of signalRegistry.values()) {
    if (def.appliesTo.includes('all') || def.appliesTo.includes(gameId)) {
      out.push(def)
    }
  }
  return out
}

/** 測試用：清空註冊表。生產程式碼不會呼叫。 */
export function _resetRegistryForTests(): void {
  signalRegistry.clear()
}
