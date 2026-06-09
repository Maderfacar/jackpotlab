/**
 * 鑑古設定常數。每彩種獨立 D 預設、baseline、shrinkage 強度、漂移閾值。
 */

import type { GameId } from '../../shared/lotto/games'

/**
 * 灌入深度 D 預設值：
 *   - 539 / 大樂透 / 威力彩：每日類—— 539 = 3 年（≈ 1100）、其餘週 2 次 ≈ 400
 *   - 賓果賓果：5 分鐘一期，預設 1 個月 ≈ 8640 期
 *
 * 上限 15000、下限 1。對應 [[project-brain-design-decisions]] 的 D 設定。
 */
const D_DEFAULTS: Record<GameId, number> = {
  lotto539: 1100,
  lotto649: 400,
  super_lotto638: 400,
  bingo_bingo: 8640
}

const D_MIN = 1
const D_MAX = 15000
const D_FALLBACK = 400

export function defaultHindsightD(gameId: GameId): number {
  return D_DEFAULTS[gameId]
}

export function clampHindsightD(d: number): number {
  if (!Number.isFinite(d)) return D_FALLBACK
  return Math.max(D_MIN, Math.min(D_MAX, Math.floor(d)))
}

/**
 * 純隨機 baseline 命中率。
 * 一顆主號被開出的機率 ≈ 開出顆數 / 池大小。
 *   539：5/39、大樂透：6/49、威力彩主區：6/38、賓果：20/80
 *
 * shrinkage 把樣本不足訊號往 baseline 拉，避免「中 1/1 → 100% 命中率」誤導。
 */
export function baselineHitRate(gameId: GameId): number {
  switch (gameId) {
    case 'lotto539':
      return 5 / 39
    case 'lotto649':
      return 6 / 49
    case 'super_lotto638':
      return 6 / 38
    case 'bingo_bingo':
      return 20 / 80
  }
}

/** Shrinkage 強度。樣本不足時權重往 baseline 收斂的虛擬樣本數。 */
export const N0 = 30

/** 漂移絕對閾值（hit rate 單位）。最近 vs 長期差距超過此值即發警示。 */
export const DRIFT_THRESHOLD = 0.3
