/**
 * 交叉（2026-10-27 使用者：連開 4單 時，那幾顆單號是從哪幾個隔期格出來的）。
 *
 * 把每一顆球同時用兩種分法歸類（例：單雙 × 隔期段），數「平均每期幾顆」落在每一格。
 * 樣本 = 某個盤面座標跟這期一樣、而且連到這麼多期以上的那些期（或它們的下一期），
 * 對照 = 全部的期。五顆裡有一顆分不出類（暖機期間沒隔期）的期整期不算，讓每格加起來剛好 5。
 */
import type { DrawFeatures } from '../patterns/features'
import { BUCKETS, bucketOf } from './position'

export type BallAttr = 'oddEven' | 'third' | 'head' | 'gap' | 'value' | 'y'

export interface BallAttrDef {
  id: BallAttr
  name: string
  labels: string[]
}

export const BALL_ATTRS: BallAttrDef[] = [
  { id: 'oddEven', name: '單雙', labels: ['單', '雙'] },
  { id: 'third', name: '小中大', labels: ['小', '中', '大'] },
  { id: 'head', name: '頭數', labels: ['0頭', '1頭', '2頭', '3頭'] },
  { id: 'gap', name: '隔期段', labels: BUCKETS.gap.map(b => b.label) },
  { id: 'value', name: '值段', labels: BUCKETS.value.map(b => b.label) },
  { id: 'y', name: '位置 y', labels: ['y=1', 'y=2', 'y=3', 'y≥4'] }
]

export const ballAttr = (id: BallAttr): BallAttrDef => BALL_ATTRS.find(a => a.id === id)!

/** 一期第 p 顆（升序）落在哪一類；分不出來為 null */
export function ballClass(attr: BallAttr, num: number, f: DrawFeatures, p: number): number | null {
  switch (attr) {
    case 'oddEven': return num % 2 === 1 ? 0 : 1
    case 'third': return num <= 13 ? 0 : num <= 26 ? 1 : 2
    case 'head': return Math.min(3, Math.floor(num / 10))
    case 'gap': {
      const g = f.gaps[p]
      return g == null ? null : bucketOf('gap', g)
    }
    case 'value': {
      const v = f.values[p]
      return v == null ? null : bucketOf('value', v)
    }
    case 'y': {
      const y = f.ys[p]
      return y == null ? null : Math.min(4, y) - 1
    }
  }
}

export interface CrossTable {
  /** 每格的總顆數 [列][欄] */
  cells: number[][]
  /** 算進來的期數 */
  draws: number
}

export function crossTable(nums: number[][], feats: DrawFeatures[], idxs: number[], row: BallAttr, col: BallAttr): CrossTable {
  const cells = ballAttr(row).labels.map(() => ballAttr(col).labels.map(() => 0))
  let draws = 0
  for (const i of idxs) {
    const n = nums[i]
    const f = feats[i]
    if (!n || !f || n.length !== 5) continue
    const pairs = n.map((num, p) => [ballClass(row, num, f, p), ballClass(col, num, f, p)] as const)
    if (pairs.some(([r, c]) => r == null || c == null)) continue
    for (const [r, c] of pairs) cells[r!]![c!]! += 1
    draws += 1
  }
  return { cells, draws }
}

/** 每期往前連了幾期同樣的狀態（含自己）；null 為 0 */
export function runLengths(seq: readonly (string | null)[]): number[] {
  const out: number[] = []
  seq.forEach((s, i) => {
    out.push(s == null ? 0 : i > 0 && seq[i - 1] === s ? out[i - 1]! + 1 : 1)
  })
  return out
}

/**
 * 以前跟這期一樣的那些期：狀態相同、而且連到 ≥ minRun 期（不含最新一期）。
 * ahead = 1 時回傳它們的下一期。
 */
export function sameSituation(seq: readonly (string | null)[], state: string, minRun: number, ahead: 0 | 1 = 0): number[] {
  const runs = runLengths(seq)
  const last = seq.length - 1
  const out: number[] = []
  for (let i = 0; i < last; i++) {
    if (seq[i] === state && runs[i]! >= minRun) out.push(i + ahead)
  }
  return out
}
