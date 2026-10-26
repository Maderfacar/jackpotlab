/**
 * 例外前兆（2026-10-27 使用者：盤面「還在挖」第 4 項——常見配置不成立的那幾期，前面是什麼盤面）。
 *
 * - 常見 / 例外：一個座標的狀態照出現次數多到少排，累加到 ≥ 60% 的那幾個算「常見」，其餘算「例外」
 *   （例：單雙 3單＋3雙 ≈ 67% 是常見，4單、4雙、5單、5雙 是例外）。
 * - 前兆：看每個例外期的「前一期」各座標是什麼狀態；某個狀態出現後，下一期出例外的比例跟平常比。
 */
import type { CoordSeries } from './coords'

const COMMON_SHARE = 0.6
/** 例外加起來太少（< 3%）的座標不拿來當目標 */
const MIN_RARE_SHARE = 0.03

export interface ExceptionSplit {
  common: string[]
  rare: string[]
  /** 例外佔全部期數的比例 */
  rareShare: number
}

export function exceptionSplit(seq: readonly (string | null)[]): ExceptionSplit | null {
  const count = new Map<string, number>()
  let total = 0
  for (const s of seq) {
    if (s == null) continue
    count.set(s, (count.get(s) ?? 0) + 1)
    total += 1
  }
  if (!total) return null
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const common: string[] = []
  let acc = 0
  for (const [s, n] of sorted) {
    if (acc / total >= COMMON_SHARE) break
    common.push(s)
    acc += n
  }
  const rare = sorted.map(([s]) => s).filter(s => !common.includes(s))
  const rareShare = 1 - acc / total
  return rare.length && rareShare >= MIN_RARE_SHARE ? { common, rare, rareShare } : null
}

export interface Rate {
  /** 前一期是這個狀態的次數 */
  n: number
  /** 其中下一期出例外的次數 */
  e: number
}

export interface PrecursorRow extends Rate {
  coordId: string
  state: string
}

export interface Precursors {
  /** 全部期：下一期出例外的比例 */
  base: Rate
  rows: PrecursorRow[]
}

/** 目標座標的例外，對照每個座標前一期的狀態（只用已經開出的期） */
export function precursors(target: CoordSeries, split: ExceptionSplit, coords: CoordSeries[]): Precursors {
  const rare = new Set(split.rare)
  const base: Rate = { n: 0, e: 0 }
  const table = new Map<string, PrecursorRow>()
  for (let t = 1; t < target.seq.length; t++) {
    const s = target.seq[t]
    if (s == null) continue
    const exc = rare.has(s) ? 1 : 0
    base.n += 1
    base.e += exc
    for (const c of coords) {
      const prev = c.seq[t - 1]
      if (prev == null) continue
      const key = `${c.def.id}\u0000${prev}`
      const row = table.get(key) ?? { coordId: c.def.id, state: prev, n: 0, e: 0 }
      row.n += 1
      row.e += exc
      table.set(key, row)
    }
  }
  return { base, rows: [...table.values()] }
}

export const rateOf = (r: Rate): number => (r.n ? r.e / r.n : 0)
