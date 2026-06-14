/**
 * 全壘打 evidence 計算工具 — 純函式、無 Vue/Nuxt 依賴。
 *
 * 抽出來給 HomeRunSection.vue（賓果海尼根頁）與 bingo-heineken-stats.vue
 * （歷史分析頁）共用，確保兩處用同一份過濾與命中邏輯。
 */

import type { GameId } from '../../shared/lotto/games'
import { slotCountForOriginDistribution } from './signals/bingo-origin-distribution'
import type { BrainDraw, BrainState } from './types'

/**
 * 兩層過濾：位置 + 隔期 0 紅框（連莊）。
 *
 *   1. 位置把關：positionYs 內的 1-indexed 位置從 rawSorted 移除；
 *      若 rawSorted.length < y → 跳過該位置（安靜略過）。
 *   2. 隔期 0 紅框移除：filter out carryoverSet 內的號（T∩T-1 連莊）。
 *
 * 不含第三層「過去 10 期高頻位置黑名單」(在呼叫端套用)，因為:
 *   - HomeRunSection 顯示「最新一期過濾後候選」時用 reactive blacklist
 *   - 歷史 evidence 用 firing 自帶的 perInterval、不再加 blacklist 過濾
 */
export function computeHomeRunByInterval(
  rawByInterval: number[][],
  positionYsByInterval: number[][],
  carryoverSet: ReadonlySet<number>,
  slotCount: number
): number[][] {
  const out: number[][] = []
  for (let j = 0; j < slotCount; j++) {
    const raw = rawByInterval[j] ?? []
    const positionYs = positionYsByInterval[j] ?? []
    const removePos = new Set<number>()
    for (const y of positionYs) {
      if (y >= 1 && y <= raw.length) removePos.add(y)
    }
    let after = raw.filter((_, idx) => !removePos.has(idx + 1))
    if (j === 0 && carryoverSet.size > 0) {
      after = after.filter(n => !carryoverSet.has(n))
    }
    out.push(after)
  }
  return out
}

/** 全壘打歷史證據鏈一筆 row。 */
export interface HomeRunEvidenceRow {
  /** 被預測的目標期（= firing.drawTerm + 1） */
  drawTerm: number
  drawDate: string
  /** 按隔期分排的 picks（升序），依 slotCount 動態 */
  picksByInterval: number[][]
  /** 每隔期命中數 */
  hitsByInterval: number[]
  /** 每隔期命中機率（hits / picks.length；該排 picks=0 時 null） */
  rateByInterval: Array<number | null>
  /**
   * 含當期在內的最近 RECENT_AVG_WINDOW 期、每隔期 mean(rate)
   * （picks=0 不計、全 null 時 null）。
   * 窗口大小集中在 RECENT_AVG_WINDOW 常數、日後調整改一處。
   */
  recentAvgRateByInterval: Array<number | null>
  /** picksByInterval union（去重升序），用來算總命中 */
  picks: number[]
  actual: number[]
  hits: number
  hitNumbers: number[]
  /** 0-3（或 0-5）總命中機率（hits / picks.length），picks 為空時 null */
  rate: number | null
}

/**
 * 「最近 N 期」窗口大小。拍板 commit 210b734 stats 頁實測各隔期建議窗口 N=10
 * 為主、隔期 1 N=5 但統一 N=10 也不會錯太多、選 10 作為統一值。
 */
export const RECENT_AVG_WINDOW = 10

/**
 * 計算全壘打歷史證據鏈。
 *
 * - 對 scorecard.recentFirings 每筆 firing：用 firing 內保存的 remainingNumbers /
 *   positionYs / carryoverInPeriod0 跑兩層過濾、union 算總 picks
 * - targetTerm = firing.drawTerm + 1，actual 從 drawByTerm 取
 * - 跳過 actual 為空的 row（最新一期 T+1 還沒開 / drawByTerm 缺資料）
 * - 排序：最新在前（reverse 過）
 * - past5AvgRateByInterval：含當期的最近 5 期、每隔期 mean(rate)
 *
 * 沒 brain state / scorecard 時回 []。
 */
export function computeHomeRunEvidence(
  gameId: GameId,
  brainState: BrainState | null,
  drawsAsc: BrainDraw[]
): HomeRunEvidenceRow[] {
  if (!brainState) return []
  const sc = brainState.scorecards['bingo_origin_distribution']
  if (!sc) return []
  const slotCount = slotCountForOriginDistribution(gameId)

  const drawByTerm = new Map<number, BrainDraw>()
  for (const d of drawsAsc) drawByTerm.set(d.drawTerm, d)

  const out: HomeRunEvidenceRow[] = []
  // 新的在上面
  for (const f of [...sc.recentFirings].reverse()) {
    const od = f.observationData?.originDistribution
    if (!od) continue

    const rawByInterval = od.perInterval.map(p => [...(p.remainingNumbers ?? [])].sort((a, b) => a - b))
    const positionYsByInterval = od.perInterval.map(p => p.positionYs ?? [])
    const carryoverSet = new Set<number>(od.carryoverInPeriod0 ?? [])
    const filtered = computeHomeRunByInterval(rawByInterval, positionYsByInterval, carryoverSet, slotCount)
    const picksByInterval = filtered.map(arr => [...arr])

    const picksSet = new Set<number>()
    for (const arr of filtered) {
      for (const n of arr) picksSet.add(n)
    }
    const picks = [...picksSet].sort((a, b) => a - b)

    const targetTerm = f.drawTerm + 1
    const targetDraw = drawByTerm.get(targetTerm)
    const actual = targetDraw?.numbers ?? []
    if (actual.length === 0) continue
    const actualDate = targetDraw?.drawDate ?? ''
    const actualSet = new Set(actual)
    const hitNumbers = picks.filter(p => actualSet.has(p))
    const hits = hitNumbers.length
    const rate = picks.length > 0 ? hits / picks.length : null

    const hitsByInterval = picksByInterval.map(arr => arr.filter(p => actualSet.has(p)).length)
    const rateByInterval = picksByInterval.map((arr, j) => arr.length > 0 ? (hitsByInterval[j] ?? 0) / arr.length : null)

    out.push({
      drawTerm: targetTerm,
      drawDate: actualDate,
      picksByInterval,
      hitsByInterval,
      rateByInterval,
      recentAvgRateByInterval: [],
      picks,
      actual,
      hits,
      hitNumbers,
      rate
    })
  }

  // 第二輪：含當期的最近 RECENT_AVG_WINDOW 期、每隔期 mean
  // 拍板：當期為窗口中時間最晚的一期（i=0 在 out 內、out.slice(i, i+N) 含 i）
  for (let i = 0; i < out.length; i++) {
    const windowSlice = out.slice(i, i + RECENT_AVG_WINDOW)
    const avgs: Array<number | null> = []
    const slotCountForRow = out[i]!.picksByInterval.length
    for (let j = 0; j < slotCountForRow; j++) {
      let sum = 0
      let n = 0
      for (const p of windowSlice) {
        const r = p.rateByInterval[j]
        if (r != null) {
          sum += r
          n++
        }
      }
      avgs.push(n > 0 ? sum / n : null)
    }
    out[i]!.recentAvgRateByInterval = avgs
  }
  return out
}
