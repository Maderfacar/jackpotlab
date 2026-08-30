/**
 * 「開獎後例行檢查」計算（2026-08-30 使用者需求）。
 *
 * 每個 build* 對應檢查清單的一塊，全部吃當前載入視窗即時計算：
 *   ① buildIdentity      本期五顆的身世（slot / 位置 / 數值 / 尾數比對）
 *   ③ buildTotals        三個加總（隔期總和 / 數值總和 / 獎號總合）vs 上期
 *   ④ buildValueCensus   數值 0~5 盤點（本期幾顆、缺席的隔多久沒出）
 *   ⑤ buildSlotAlerts    slot 記錄警示（超過均值、是否破自己歷史新高）
 *   ⑥ buildZeroSources   本期數值0 來自哪些 slot + 下期數值0 候選 slot
 *   ⑦ buildPositionOrigin 第 1~5 顆的 y 分布 + 來源 slot 遠近分布
 *
 * 之後要加檢查項目：加一個 builder + 在 CheckupSection.vue 加一塊即可。
 */

import type { AnalysisState } from '../utils/analysis'
import { averageOfCsvFirst } from '../utils/analysis'
import type { SignalRow } from './types'

/** 與觀察卡一致的分桶邊界（2026-08-30 拍板統一）：0-5 近 / 6-10 中 / 11+ 遠 */
const GAP_LOW_MAX = 5
const GAP_MID_MAX = 10
const VALUE_CENSUS_MAX = 5

// ---------- ①② 本期身世 ----------

export interface IdentityRow {
  num: number
  gap: number
  pos: string
  value: number
  tail: number
  /** 此尾數上一期也出現過 */
  tailRepeated: boolean
}

export interface IdentityInfo {
  rows: IdentityRow[]
  /** 本期出現的尾數（去重、升序） */
  tails: number[]
  /** 上一期的尾數（去重、升序） */
  prevTails: number[]
  /** 本期尾數中、上一期也有的 */
  repeatedTails: number[]
}

export function buildIdentity(rows: SignalRow[]): IdentityInfo | null {
  const cur = rows.at(-1)
  if (!cur) return null
  const prev = rows.at(-2)
  const prevTailSet = new Set((prev?.prizes ?? []).map(n => n % 10))
  const identityRows: IdentityRow[] = cur.prizes.map((num, k) => ({
    num,
    gap: cur.gaps[k] ?? -1,
    pos: cur.xs[k] != null && cur.xs[k]! >= 0 ? `${cur.xs[k]}-${cur.ys[k]}` : '—',
    value: cur.values[k] ?? -1,
    tail: num % 10,
    tailRepeated: prevTailSet.has(num % 10)
  }))
  const tails = [...new Set(cur.prizes.map(n => n % 10))].sort((a, b) => a - b)
  return {
    rows: identityRows,
    tails,
    prevTails: [...new Set((prev?.prizes ?? []).map(n => n % 10))].sort((a, b) => a - b),
    repeatedTails: tails.filter(t => prevTailSet.has(t))
  }
}

// ---------- ③ 三個加總 ----------

export interface TotalsEntry {
  label: string
  current: number
  prev: number | null
  /** 1 比上期高 / -1 低 / 0 平 / null 無上期 */
  dir: 1 | -1 | 0 | null
}

export function buildTotals(rows: SignalRow[]): TotalsEntry[] {
  const cur = rows.at(-1)
  if (!cur) return []
  const prev = rows.at(-2) ?? null
  const make = (label: string, pick: (r: SignalRow) => number): TotalsEntry => {
    const current = pick(cur)
    const prevVal = prev ? pick(prev) : null
    const dir = prevVal == null ? null : current > prevVal ? 1 : current < prevVal ? -1 : 0
    return { label, current, prev: prevVal, dir }
  }
  return [
    make('隔期總和', r => r.sum),
    make('數值總和', r => r.values.reduce((a, b) => a + b, 0)),
    make('獎號總合', r => r.prizes.reduce((a, b) => a + b, 0))
  ]
}

// ---------- ④ 數值盤點 ----------

export interface ValueCensusEntry {
  value: number
  /** 本期出現顆數 */
  count: number
  /** 本期沒出時：距上次出現隔幾期；載入視窗內從未出現 = null（用 neverInWindow 區分） */
  absentFor: number | null
  neverInWindow: boolean
}

export function buildValueCensus(rows: SignalRow[]): ValueCensusEntry[] {
  const cur = rows.at(-1)
  if (!cur) return []
  const out: ValueCensusEntry[] = []
  for (let v = 0; v <= VALUE_CENSUS_MAX; v++) {
    const count = cur.values.filter(x => x === v).length
    if (count > 0) {
      out.push({ value: v, count, absentFor: null, neverInWindow: false })
      continue
    }
    let absentFor: number | null = null
    for (let i = rows.length - 2; i >= 0; i--) {
      if (rows[i]!.values.includes(v)) {
        absentFor = rows.length - 1 - i
        break
      }
    }
    out.push({ value: v, count: 0, absentFor, neverInWindow: absentFor == null })
  }
  return out
}

// ---------- ⑤ slot 記錄警示 ----------

export interface SlotAlert {
  slot: number
  issue: string
  date: string
  /** 記錄最新值 = 該 slot 距上次開出獎號幾期 */
  current: number
  /** 該 slot 自己過去紀錄的最大值（記錄字串第 2 個值起）；無過去紀錄 = null */
  pastMax: number | null
  isNewHigh: boolean
  /** 有過去紀錄、尚未突破、但已達歷史最大的 9 成 */
  nearHistoricalMax: boolean
  /** 剩餘號碼 */
  remaining: number[]
  /**
   * 目前無號碼時的預估：最快幾期後輪入號碼（來自更年輕的 slot）、
   * 屆時記錄值會是多少。前提是輪入前那些號碼沒被中途開走。
   */
  emptyProjection: {
    waitPeriods: number
    projectedValue: number
    fromSlot: number
    incoming: number[]
  } | null
}

export interface SlotAlertInfo {
  /** 全部 slot 記錄最新值的平均（與 /draws 紅字同一算法） */
  avg: number
  /** 超過均值的 slot（由高到低）。記錄跟著「格子位置」走，每期都有新內容輪進來。 */
  alerts: SlotAlert[]
}

function recordValues(record: string): number[] {
  return record
    .split(',')
    .filter(s => s !== '')
    .map(s => Number.parseInt(s, 10))
    .filter(Number.isFinite)
}

/** 「接近歷史最大」門檻：現值 ≥ 歷史最大的 9 成 */
const NEAR_MAX_RATIO = 0.9

export function buildSlotAlerts(state: AnalysisState): SlotAlertInfo {
  const avg = averageOfCsvFirst(state.periods)
  const alerts: SlotAlert[] = []
  for (const p of state.periods) {
    if (!p.issue) continue
    const vals = recordValues(p.record)
    const current = vals[0] ?? 0
    if (current <= avg) continue
    const past = vals.slice(1)
    const pastMax = past.length > 0 ? Math.max(...past) : null
    const isNewHigh = pastMax != null && current > pastMax

    // 空 slot：往更年輕的格子找最近有號碼的，預估幾期後輪入、屆時記錄值。
    let emptyProjection: SlotAlert['emptyProjection'] = null
    if (p.prizes.length === 0) {
      for (let j = 1; j <= p.period; j++) {
        const younger = state.periods[p.period - j]
        if (younger && younger.prizes.length > 0) {
          emptyProjection = {
            waitPeriods: j,
            projectedValue: current + j,
            fromSlot: younger.period,
            incoming: [...younger.prizes].sort((a, b) => a - b)
          }
          break
        }
      }
    }

    alerts.push({
      slot: p.period,
      issue: p.issue,
      date: p.date,
      current,
      pastMax,
      isNewHigh,
      nearHistoricalMax: pastMax != null && !isNewHigh && current >= pastMax * NEAR_MAX_RATIO,
      remaining: [...p.prizes].sort((a, b) => a - b),
      emptyProjection
    })
  }
  alerts.sort((a, b) => b.current - a.current)
  return { avg, alerts }
}

// ---------- ⑥ 數值0 來源與下期候選 ----------

export interface ZeroCandidateSlot {
  slot: number
  issue: string
  date: string
  numbers: number[]
}

export interface ZeroSourceInfo {
  /** 本期數值0 的獎號與其來源 slot（隔期值） */
  thisPeriod: Array<{ num: number, slot: number }>
  /** 下期若再出數值0，只可能來自這些 slot（記錄最新值 = 0 且還有剩餘號碼） */
  candidates: ZeroCandidateSlot[]
}

export function buildZeroSources(rows: SignalRow[], state: AnalysisState): ZeroSourceInfo {
  const cur = rows.at(-1)
  const thisPeriod: Array<{ num: number, slot: number }> = []
  if (cur) {
    cur.prizes.forEach((num, k) => {
      if (cur.values[k] === 0) thisPeriod.push({ num, slot: cur.gaps[k] ?? -1 })
    })
  }
  const candidates: ZeroCandidateSlot[] = []
  for (const p of state.periods) {
    if (!p.issue || p.prizes.length === 0) continue
    const vals = recordValues(p.record)
    if ((vals[0] ?? -1) !== 0) continue
    candidates.push({
      slot: p.period,
      issue: p.issue,
      date: p.date,
      numbers: [...p.prizes].sort((a, b) => a - b)
    })
  }
  candidates.sort((a, b) => a.slot - b.slot)
  return { thisPeriod, candidates }
}

// ---------- ⑦ 位置與來源分布 ----------

export interface PositionOriginRow {
  pos: number
  /** 本期該位置的 y 與來源 slot */
  currentY: number | null
  currentGap: number | null
  /** y=1..5 的比例 */
  yDist: number[]
  /** 來源 slot 遠近比例：近 0-5 / 中 6-10 / 遠 11+ */
  bucketDist: { low: number, mid: number, high: number }
  sample: number
}

export function buildPositionOrigin(rows: SignalRow[]): PositionOriginRow[] {
  const valid = rows.filter(r => r.valid)
  const cur = rows.at(-1)
  const out: PositionOriginRow[] = []
  for (let pos = 0; pos < 5; pos++) {
    const yCounts = [0, 0, 0, 0, 0]
    let low = 0
    let mid = 0
    let high = 0
    let n = 0
    for (const r of valid) {
      const y = r.ys[pos]!
      const g = r.gaps[pos]!
      if (y < 1 || g < 0) continue
      n++
      if (y >= 1 && y <= 5) yCounts[y - 1]!++
      if (g <= GAP_LOW_MAX) low++
      else if (g <= GAP_MID_MAX) mid++
      else high++
    }
    out.push({
      pos: pos + 1,
      currentY: cur && cur.ys[pos]! >= 1 ? cur.ys[pos]! : null,
      currentGap: cur && cur.gaps[pos]! >= 0 ? cur.gaps[pos]! : null,
      yDist: yCounts.map(c => (n > 0 ? c / n : 0)),
      bucketDist: {
        low: n > 0 ? low / n : 0,
        mid: n > 0 ? mid / n : 0,
        high: n > 0 ? high / n : 0
      },
      sample: n
    })
  }
  return out
}
