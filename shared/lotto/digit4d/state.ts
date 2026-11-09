/**
 * 四星彩的逐期盤面（2026-11-09 使用者：四個位置各自獨立算隔期；中獎看成個位／後兩碼／後三碼／四碼四層）。
 *
 * 名詞（每個位置各自算）：
 *   隔期：這個數字在這個位置幾期沒開出（上一期剛開出 = 0）。
 *   第幾新：這個位置 10 個數字照最近開出的先後排，第 0 新 = 上一期開出的那個。
 *           每期只開一個數字，所以同一位置 10 個數字的隔期都不一樣，一個隔期格子最多一個數字。
 *   名次的值：「第 r 新」這個名次連續幾期沒被開到（上一期剛被開到 = 0）。
 * 四層：個位（10 格）、後兩碼（100 格）、後三碼（1,000 格）、四碼（10,000 格），各自算隔期。
 */
import type { DigitPlainDraw } from '../digit-history'

export const DIGITS = 4
export const POS_LABELS = ['千位', '百位', '十位', '個位'] as const
/** 最前面這些期只拿來起算（每個位置 10 個數字都要先開過，第幾新才有意義） */
export const WARMUP = 100

export const LEVELS = [
  { k: 1, label: '個位', size: 10, prize: '四星單中個位沒有獎' },
  { k: 2, label: '後兩碼', size: 100, prize: '500' },
  { k: 3, label: '後三碼', size: 1000, prize: '5,000' },
  { k: 4, label: '四碼', size: 10000, prize: '50,000' }
] as const

export type Shape = 'distinct' | 'pair' | 'twoPair' | 'triple' | 'quad'
export const SHAPE_LABELS: Record<Shape, string> = { distinct: '四個都不同', pair: '一對', twoPair: '兩對', triple: '三條', quad: '四條' }

/** 後 k 碼當成一個號碼（四碼 [1,2,3,4] 的後兩碼 = 34） */
export const levelBox = (digits: number[], k: number): number => digits.slice(DIGITS - k).reduce((a, d) => a * 10 + d, 0)
export const boxLabel = (box: number, k: number): string => String(box).padStart(k, '0')

export function shapeOf(digits: number[]): Shape {
  const counts = [...digits.reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map<number, number>()).values()].sort((a, b) => b - a)
  if (counts[0] === 4) return 'quad'
  if (counts[0] === 3) return 'triple'
  if (counts[0] === 2) return counts[1] === 2 ? 'twoPair' : 'pair'
  return 'distinct'
}

export interface PosHit {
  digit: number
  /** 開出前這個數字在這個位置的隔期；之前沒開過 = null */
  gap: number | null
  /** 開出前它是第幾新 */
  rank: number
  /** 開出前這個名次的值；這個名次之前沒被開到過 = null */
  rankValue: number | null
}

export interface DrawStep {
  t: number
  issue: string
  date: string
  digits: number[]
  pos: PosHit[]
  /** 四層各自：開出的那一格開出前的隔期（index 0 = 個位 … 3 = 四碼），之前沒開過 = null */
  levelGap: (number | null)[]
  shape: Shape
  sum: number
}

/** 逐期往前走的盤面狀態（每期開完更新） */
export interface Runner {
  /** 已經走過幾期（下一期的 t） */
  t: number
  /** [位置][數字] 最後一次開出的 t，沒開過 = -1 */
  lastSeen: number[][]
  /** [位置] 由新到舊的 10 個數字 */
  order: number[][]
  /** [位置][名次] 最後一次被開到的 t，沒有 = -1 */
  rankLast: number[][]
  /** [層] 每格最後一次開出的 t，沒開過 = -1 */
  levelLast: Int32Array[]
  push: (d: DigitPlainDraw) => DrawStep
}

const ago = (t: number, last: number): number | null => (last < 0 ? null : t - last - 1)

export function createRunner(): Runner {
  const r: Runner = {
    t: 0,
    lastSeen: Array.from({ length: DIGITS }, () => new Array<number>(10).fill(-1)),
    order: Array.from({ length: DIGITS }, () => Array.from({ length: 10 }, (_, i) => i)),
    rankLast: Array.from({ length: DIGITS }, () => new Array<number>(10).fill(-1)),
    levelLast: LEVELS.map(l => new Int32Array(l.size).fill(-1)),
    push(d) {
      const t = r.t
      if (d.digits.length !== DIGITS) throw new Error(`第 ${d.issue} 期不是 4 個數字`)
      const pos = d.digits.map((digit, p) => {
        const rank = r.order[p]!.indexOf(digit)
        const hit: PosHit = { digit, gap: ago(t, r.lastSeen[p]![digit]!), rank, rankValue: ago(t, r.rankLast[p]![rank]!) }
        r.lastSeen[p]![digit] = t
        r.rankLast[p]![rank] = t
        r.order[p] = [digit, ...r.order[p]!.filter(x => x !== digit)]
        return hit
      })
      const levelGap = LEVELS.map((l, i) => {
        const box = levelBox(d.digits, l.k)
        const g = ago(t, r.levelLast[i]![box]!)
        r.levelLast[i]![box] = t
        return g
      })
      r.t++
      return { t, issue: d.issue, date: d.date, digits: d.digits, pos, levelGap, shape: shapeOf(d.digits), sum: d.digits.reduce((a, b) => a + b, 0) }
    }
  }
  return r
}

export function buildSteps(draws: DigitPlainDraw[]): { steps: DrawStep[], runner: Runner } {
  const runner = createRunner()
  return { steps: draws.map(d => runner.push(d)), runner }
}
