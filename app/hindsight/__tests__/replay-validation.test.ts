/**
 * 熱啟動驗證：用 seeded PRNG 生成確定性開獎史，跑 replayHistory + detectAlerts，
 * 印出各訊號成績單數字 + 警示，供肉眼合理性稽核。
 *
 * 測試規格：
 *   - 539 / 大樂透 / 威力彩：最近 3 年
 *     · 539 每日 ≈ 1095 期
 *     · 大樂透週二/五 ≈ 314 期
 *     · 威力彩週一/四 ≈ 314 期
 *   - 賓果賓果：1 個月 ≈ 6090 期（每日 203 期 × 30 天）
 *
 * **誠信鐵律（[[feedback-no-fake-analysis-output]]）：**
 *   此測試僅回報從 replayHistory 算出來的數字，不偽造任何欄位。
 *   smoothedHitRate 使用 shrinkage，樣本不足的訊號會顯示 ⚠ 樣本不足。
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import type { GameId } from '../../../shared/lotto/games'
import { detectAlerts } from '../alerts'
import { baselineHitRate, N0 } from '../config'
import { replayHistory } from '../replay'
import { recentHitRate, smoothedHitRate } from '../scorecard'
import { consecutiveChainSignal } from '../signals/consecutive-chain'
import { dateNumberSignal } from '../signals/date-number'
import { intervalMeanSignal } from '../signals/interval-mean'
import type { BrainDraw, SignalDef } from '../types'

// -----------------------------------------------------------------------
// Seeded PRNG (mulberry32 — same as replay-simulation.test.ts)
// -----------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleDistinct(rng: () => number, k: number, min: number, max: number): number[] {
  const set = new Set<number>()
  const range = max - min + 1
  while (set.size < k) {
    const n = Math.floor(rng() * range) + min
    set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

function isoDate(base: Date, offsetMs: number): string {
  const d = new Date(base.getTime() + offsetMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// -----------------------------------------------------------------------
// Draw generators
// -----------------------------------------------------------------------

/** 539：5 顆 / 1-39，每日一期，startYear 年 1 月 1 日起 count 期 */
function gen539(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2023, 0, 1))
  return Array.from({ length: count }, (_, i) => ({
    drawTerm: i + 1,
    drawDate: isoDate(base, i * 86400000),
    numbers: sampleDistinct(rng, 5, 1, 39)
  }))
}

/** 大樂透：6 顆 / 1-49 + special 1-49，週二/五，約 312-316 期/3年 */
function genLotto649(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2023, 0, 3)) // 2023-01-03 週二
  return Array.from({ length: count }, (_, i) => ({
    drawTerm: 112000001 + i,
    drawDate: isoDate(base, i * 3.5 * 86400000), // 每 3.5 天
    numbers: sampleDistinct(rng, 6, 1, 49)
  }))
}

/** 威力彩：6 顆 / 1-38 + special 1-8，週一/四 */
function genSuper638(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2023, 0, 2)) // 2023-01-02 週一
  return Array.from({ length: count }, (_, i) => ({
    drawTerm: 113000001 + i,
    drawDate: isoDate(base, i * 3.5 * 86400000),
    numbers: sampleDistinct(rng, 6, 1, 38)
  }))
}

/** 賓果賓果：20 顆 / 1-80，每日 07:05 起每 5 分鐘一期，共 203 期/天，count 期 */
function genBingo(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2026, 5, 1)) // 2026-06-01
  return Array.from({ length: count }, (_, i) => ({
    drawTerm: i + 1,
    drawDate: isoDate(base, Math.floor(i / 203) * 86400000),
    numbers: sampleDistinct(rng, 20, 1, 80)
  }))
}

// -----------------------------------------------------------------------
// 成績單格式化工具
// -----------------------------------------------------------------------

const INSUFFICIENT_THRESHOLD = 30 // < 30 fires = 樣本不足

function avgFiringInterval(firingTerms: number[]): string {
  if (firingTerms.length < 2) return '—'
  let sum = 0
  for (let i = 1; i < firingTerms.length; i++) {
    sum += firingTerms[i]! - firingTerms[i - 1]!
  }
  return (sum / (firingTerms.length - 1)).toFixed(1)
}

function formatRow(
  sigId: string,
  totalFires: number,
  totalHits: number,
  totalPicks: number,
  sHitRate: number,
  rHitRate: number | null,
  avgInterval: string,
  baseline: number
): string {
  const insufficient = totalFires < INSUFFICIENT_THRESHOLD ? ' ⚠ 樣本不足' : ''
  const rStr = rHitRate != null ? rHitRate.toFixed(4) : '(無近期亮燈)'
  const ratio = sHitRate / baseline
  const flag = ratio > 2 ? ' 🚨 異常高（需確認）' : ''
  return (
    `  ${sigId.padEnd(22)}`
    + ` fires=${String(totalFires).padStart(5)}`
    + ` hits=${String(totalHits).padStart(5)}`
    + ` picks=${String(totalPicks).padStart(6)}`
    + ` smoothedHR=${sHitRate.toFixed(4)}`
    + ` recentHR=${rStr}`
    + ` avgInterval=${avgInterval.padStart(7)}`
    + ` (baseline=${baseline.toFixed(4)})${insufficient}${flag}`
  )
}

// -----------------------------------------------------------------------
// 主驗證邏輯
// -----------------------------------------------------------------------

const ALL_SIGNALS: SignalDef[] = [
  intervalMeanSignal,
  dateNumberSignal,
  consecutiveChainSignal
]

function runValidation(
  gameId: GameId,
  draws: BrainDraw[],
  label: string,
  t: { diagnostic: (msg: string) => void }
) {
  const state = replayHistory(gameId, draws, ALL_SIGNALS)
  const baseline = baselineHitRate(gameId)

  // 建當下 firings 給 detectAlerts（用最末一期作 evaluate 基準）
  // 注意：這裡只需要 alerts 統計，不呼叫 evaluate；直接把 replayHistory 結果送進 detectAlerts
  const fictitiousFirings: Record<string, import('../types').SignalFiringRecord> = {}
  // 把 recentFirings 最後一筆當「最新期 firing」（用來讓 detectAlerts 算共燈警示）
  for (const [id, sc] of Object.entries(state.scorecards)) {
    const last = sc.recentFirings[sc.recentFirings.length - 1]
    if (last) fictitiousFirings[id] = last
  }
  const alerts = detectAlerts(state, fictitiousFirings, draws)

  t.diagnostic(`\n${'='.repeat(60)}`)
  t.diagnostic(`【${label}】gameId=${gameId}  periods=${draws.length}  baseline=${baseline.toFixed(4)}`)
  t.diagnostic('='.repeat(60))

  const applicable = ALL_SIGNALS.filter(s =>
    s.appliesTo.includes('all') || s.appliesTo.includes(gameId)
  )

  for (const sig of applicable) {
    const sc = state.scorecards[sig.id]
    if (!sc) {
      t.diagnostic(`  ${sig.id.padEnd(22)} (appliesTo 不含 ${gameId}，跳過)`)
      continue
    }
    const shr = smoothedHitRate(sc, baseline, N0)
    const rhr = recentHitRate(sc)
    const avgI = avgFiringInterval(sc.firingTerms)
    t.diagnostic(formatRow(sig.id, sc.totalFires, sc.totalHits, sc.totalPicks, shr, rhr, avgI, baseline))
  }

  t.diagnostic(`\n  alerts 偵測數: ${alerts.length}`)
  const countByType: Record<string, number> = {}
  for (const a of alerts) {
    countByType[a.type] = (countByType[a.type] ?? 0) + 1
  }
  for (const [type, count] of Object.entries(countByType)) {
    t.diagnostic(`    ${type}: ${count}`)
  }
  if (alerts.length === 0) {
    t.diagnostic('    (無警示)')
  }
}

// -----------------------------------------------------------------------
// 驗證斷言（合理性門檻）
// -----------------------------------------------------------------------

function assertSanity(
  gameId: GameId,
  draws: BrainDraw[],
  t: { diagnostic: (msg: string) => void }
) {
  const state = replayHistory(gameId, draws, ALL_SIGNALS)
  const baseline = baselineHitRate(gameId)
  const applicable = ALL_SIGNALS.filter(s =>
    s.appliesTo.includes('all') || s.appliesTo.includes(gameId)
  )

  for (const sig of applicable) {
    const sc = state.scorecards[sig.id]
    if (!sc) continue

    // 1. picks >= hits（不可能命中比推的還多）
    assert.ok(
      sc.totalPicks >= sc.totalHits,
      `${sig.id}: totalPicks(${sc.totalPicks}) 應 >= totalHits(${sc.totalHits})`
    )

    // 2. fires >= 0 & hits >= 0
    assert.ok(sc.totalFires >= 0)
    assert.ok(sc.totalHits >= 0)

    // 3. smoothedHitRate 在 [0,1] 內
    const shr = smoothedHitRate(sc, baseline, N0)
    assert.ok(shr >= 0 && shr <= 1, `${sig.id}: smoothedHitRate ${shr} 應在 [0,1]`)

    // 4. 異常高（> 3× baseline）時報告但不擋（由人工稽核）
    //    這裡僅 diagnostic，不 assert.fail，符合「先報告再修」原則
    const ratio = shr / baseline
    if (ratio > 3) {
      t.diagnostic(`⚠ ${gameId}/${sig.id}: smoothedHitRate=${shr.toFixed(4)} 超過 baseline×3 (${(baseline * 3).toFixed(4)})，請手動確認`)
    }
  }
}

// -----------------------------------------------------------------------
// 測試案例
// -----------------------------------------------------------------------

describe('replay-validation: W4 熱啟動驗證（seeded PRNG）', () => {
  it('539 3年（1095期）— 各訊號成績單 + 合理性斷言', (t) => {
    const draws = gen539(1095, 42)
    runValidation('lotto539', draws, '今彩 539 × 3年', t)
    assertSanity('lotto539', draws, t)
  })

  it('大樂透 3年（314期）— 各訊號成績單 + 合理性斷言', (t) => {
    const draws = genLotto649(314, 43)
    runValidation('lotto649', draws, '大樂透 × 3年', t)
    assertSanity('lotto649', draws, t)
  })

  it('威力彩 3年（314期）— 各訊號成績單 + 合理性斷言', (t) => {
    const draws = genSuper638(314, 44)
    runValidation('super_lotto638', draws, '威力彩 × 3年', t)
    assertSanity('super_lotto638', draws, t)
  })

  it('賓果賓果 1個月（6090期）— 各訊號成績單 + 合理性斷言（date_number 不適用）', (t) => {
    const draws = genBingo(6090, 45)
    runValidation('bingo_bingo', draws, '賓果賓果 × 1月', t)
    assertSanity('bingo_bingo', draws, t)

    // date_number appliesTo 不含 bingo → scorecards 裡應該不存在
    const state = replayHistory('bingo_bingo', draws, ALL_SIGNALS)
    assert.equal(
      state.scorecards.date_number,
      undefined,
      'date_number 不應對 bingo_bingo 建 scorecard'
    )
    t.diagnostic('\n  ✓ date_number 對 bingo_bingo 正確跳過（appliesTo 排除）')
  })
})
