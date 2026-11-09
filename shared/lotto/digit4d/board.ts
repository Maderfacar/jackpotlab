/**
 * 最新一期開完的盤面（給下一期看）：四個位置各自 10 個數字照第幾新排，加上後兩碼／後三碼／四碼各層的格子。
 */
import { DIGITS, LEVELS, type Runner } from './state'

export interface PosBoardRow {
  rank: number
  digit: number
  /** 這個數字現在的隔期（上一期剛開出 = 0） */
  gap: number
  /** 這個名次現在的值（上一期剛被開到 = 0）；從沒被開到 = null */
  rankValue: number | null
}

export interface BoxGap { box: number, gap: number | null }

export interface LevelBoard {
  k: number
  /** 開過的格子數 */
  seen: number
  size: number
  /** 最久沒開的 10 格（沒開過的排最前，gap = null） */
  longest: BoxGap[]
  /** 最近開出的 10 格 */
  recent: BoxGap[]
}

export interface Board {
  /** 下一期的序號（= 已開的期數） */
  nextT: number
  positions: PosBoardRow[][]
  levels: LevelBoard[]
  /** 不分位置：0～9 每個數字最近一次出現在任何一位是幾期前 */
  anyDigit: { digit: number, gap: number }[]
}

const TOP = 10

export function boardOf(r: Runner, anyLast: number[]): Board {
  const now = r.t
  const ago = (last: number): number | null => (last < 0 ? null : now - last - 1)
  const positions = Array.from({ length: DIGITS }, (_, p) => r.order[p]!.map((digit, rank) => ({
    rank,
    digit,
    gap: ago(r.lastSeen[p]![digit]!) ?? now,
    rankValue: ago(r.rankLast[p]![rank]!)
  })))
  const levels = LEVELS.slice(1).map((l) => {
    const last = r.levelLast[l.k - 1]!
    const boxes = Array.from({ length: l.size }, (_, box) => ({ box, last: last[box]! }))
    const seen = boxes.filter(b => b.last >= 0)
    const byOld = [...boxes].sort((a, b) => a.last - b.last || a.box - b.box)
    const byNew = [...seen].sort((a, b) => b.last - a.last || a.box - b.box)
    return {
      k: l.k,
      seen: seen.length,
      size: l.size,
      longest: byOld.slice(0, TOP).map(b => ({ box: b.box, gap: ago(b.last) })),
      recent: byNew.slice(0, TOP).map(b => ({ box: b.box, gap: ago(b.last) }))
    }
  })
  const anyDigit = anyLast.map((last, digit) => ({ digit, gap: ago(last) ?? now })).sort((a, b) => b.gap - a.gap)
  return { nextT: now, positions, levels, anyDigit }
}

/** 不分位置：每個數字最後一次出現在任何一位的 t */
export function anyDigitLast(digitsByDraw: number[][]): number[] {
  const last = new Array<number>(10).fill(-1)
  digitsByDraw.forEach((ds, t) => ds.forEach((d) => {
    last[d] = t
  }))
  return last
}
