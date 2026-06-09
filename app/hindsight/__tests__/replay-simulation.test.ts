/**
 * Replay 模擬驗收：用 seeded PRNG 生成 deterministic 開獎史，跑 replayHistory，
 * 回報每個訊號 scorecard 數字；驗證 date_number 對賓果完全 0 fires。
 *
 * 規模：
 *   - 539：1095 期（≈ 3 年每日）
 *   - 賓果：2000 期（≈ 1 週密度；足以證明 date_number 短路）
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { createInitialState } from '../../utils/analysis'
import { baselineHitRate, N0 } from '../config'
import { replayHistory } from '../replay'
import { smoothedHitRate } from '../scorecard'
import { consecutiveChainSignal } from '../signals/consecutive-chain'
import { dateNumberSignal } from '../signals/date-number'
import { intervalMeanSignal } from '../signals/interval-mean'
import type { BrainDraw, SignalDef } from '../types'

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

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86400000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addMinutes(base: Date, minutes: number): string {
  // 賓果只需要 dateStr.slice(8,10) 給日期號用；HH:MM 不影響 dayOf
  // 但為了模擬同一天多期，仍用 ISO date 部分
  const d = new Date(base.getTime() + minutes * 60000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function gen539Draws(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2023, 0, 1))
  const out: BrainDraw[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      drawTerm: i + 1,
      drawDate: addDays(base, i),
      numbers: sampleDistinct(rng, 5, 1, 39)
    })
  }
  return out
}

function genBingoDraws(count: number, seed: number): BrainDraw[] {
  const rng = mulberry32(seed)
  const base = new Date(Date.UTC(2026, 5, 1))
  const out: BrainDraw[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      drawTerm: i + 1,
      drawDate: addMinutes(base, i * 5),
      numbers: sampleDistinct(rng, 20, 1, 80)
    })
  }
  return out
}

const signals: SignalDef[] = [
  intervalMeanSignal,
  dateNumberSignal,
  consecutiveChainSignal
]

describe('replay simulation: W2 三訊號 scorecard 報告', () => {
  it('539 三年模擬：報告各訊號 totalFires / totalHits / totalPicks / smoothedHitRate', (t) => {
    const draws = gen539Draws(1095, 42)
    const state = replayHistory('lotto539', draws, signals)
    const baseline = baselineHitRate('lotto539')

    t.diagnostic(`--- 539 (1095 draws) scorecard ---`)
    t.diagnostic(`baseline (5/39) = ${baseline.toFixed(4)}`)
    for (const sig of signals) {
      const sc = state.scorecards[sig.id]
      assert.ok(sc, `scorecard for ${sig.id} should exist`)
      const sm = smoothedHitRate(sc, baseline, N0)
      t.diagnostic(
        `${sig.id.padEnd(20)} fires=${String(sc.totalFires).padStart(5)} `
        + `hits=${String(sc.totalHits).padStart(5)} `
        + `picks=${String(sc.totalPicks).padStart(6)} `
        + `smoothedHitRate=${sm.toFixed(4)}`
      )
      assert.ok(sc.totalFires >= 0)
      assert.ok(sc.totalHits >= 0)
      assert.ok(sc.totalPicks >= sc.totalHits, `picks (${sc.totalPicks}) >= hits (${sc.totalHits})`)
      // smoothedHitRate 必為合法機率
      assert.ok(sm >= 0 && sm <= 1, `smoothedHitRate ${sm} out of [0,1]`)
    }
  })

  it('賓果 模擬：date_number 對賓果不註冊 scorecard（appliesTo 不含 bingo）；其他訊號可正常 fire', (t) => {
    const draws = genBingoDraws(2000, 1337)
    const state = replayHistory('bingo_bingo', draws, signals)
    const baseline = baselineHitRate('bingo_bingo')

    t.diagnostic(`--- bingo_bingo (2000 draws) scorecard ---`)
    t.diagnostic(`baseline (20/80) = ${baseline.toFixed(4)}`)
    for (const sig of signals) {
      const sc = state.scorecards[sig.id]
      if (!sc) {
        t.diagnostic(`${sig.id.padEnd(20)} (not applicable to bingo_bingo)`)
        continue
      }
      const sm = smoothedHitRate(sc, baseline, N0)
      t.diagnostic(
        `${sig.id.padEnd(20)} fires=${String(sc.totalFires).padStart(5)} `
        + `hits=${String(sc.totalHits).padStart(5)} `
        + `picks=${String(sc.totalPicks).padStart(6)} `
        + `smoothedHitRate=${sm.toFixed(4)}`
      )
    }

    // 第一道防線：appliesTo 不含 bingo → replay 連 scorecard 都不會建
    assert.equal(state.scorecards.date_number, undefined,
      'date_number 因 appliesTo 不含 bingo_bingo，replay 應該完全跳過')
    // 第二道防線（runtime short-circuit）：直接呼叫 evaluate 也回 fires=false
    const directOut = dateNumberSignal.evaluate({
      gameId: 'bingo_bingo',
      history: draws,
      analysisState: createInitialState('bingo_bingo', 60),
      todayDate: draws[0]!.drawDate
    })
    assert.equal(directOut.fires, false, 'date_number runtime gate 對 bingo 應回 false')
    assert.deepEqual(directOut.picks, [])

    // 其他兩個訊號對 bingo 仍然會 fire（賓果適用）
    assert.ok(state.scorecards.interval_mean, 'interval_mean 應該對 bingo 註冊 scorecard')
    assert.ok(state.scorecards.consecutive_chain, 'consecutive_chain 應該對 bingo 註冊 scorecard')
  })
})
