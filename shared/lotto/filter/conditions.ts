/**
 * 組合篩選（/filter）條件引擎：照使用者口述的條件，從某一期開完的盤面篩下一期的 5 顆組合。
 *
 * 定義（2026-10-09 與使用者逐條確認）：
 *   - 「第幾顆」= 號碼由小到大排；位置 x-y 用來源格原始剩餘號碼算（同格多顆不互扣，與網站獎號關聯一致）。
 *   - 「大於 / 小於」嚴格；「介於 a～b」含兩端。
 *   - 和上一期同尾 = 數「尾數」（05、15 都是尾 5 只算 1 個）。
 * 條件是資料（kind + 數字參數），頁面照 KIND_SPEC 畫成可勾選、可改數字的句子；新增條件 = 加一個 kind 或一筆預設。
 */
import type { BoardState } from '../scan/board-states'

export interface NumInfo {
  n: number
  gap: number
  value: number
  x: number
  y: number
}

/** 盤面上每個號碼的隔期 / 值 / 位置；不在盤面上（超過 n 期沒開）的號碼不在表內 */
export function numberInfo(state: BoardState): Map<number, NumInfo> {
  const out = new Map<number, NumInfo>()
  state.slots.forEach((nums, gap) => {
    nums.forEach((n, i) => out.set(n, { n, gap, value: state.values[gap] ?? 0, x: nums.length, y: i + 1 }))
  })
  return out
}

export type ConditionKind
  = | 'config' | 'gapSum' | 'valueAbove' | 'firstY' | 'yAtLeast' | 'noY' | 'tailCount' | 'minBelow'
    | 'posGap' | 'rangeAtLeast' | 'zoneNot' | 'sameTailMax' | 'valueCount' | 'evenAtLeast' | 'exclude'

export interface Condition {
  id: string
  kind: ConditionKind
  enabled: boolean
  /** 數字參數，意義照 KIND_SPEC 的句子順序 */
  p: number[]
  /** exclude：要排除的號碼 */
  nums?: number[]
}

/** 句子片段：字串照印、{ i } 是第 i 個數字參數的輸入格 */
export type Segment = string | { i: number, min: number, max: number }

export const KIND_SPEC: Record<ConditionKind, Segment[]> = {
  config: ['隔期 0～5 選', { i: 0, min: 0, max: 5 }, '顆、6～9 選', { i: 1, min: 0, max: 5 }, '顆、10 以上選', { i: 2, min: 0, max: 5 }, '顆'],
  gapSum: ['五顆隔期和介於', { i: 0, min: 0, max: 300 }, '～', { i: 1, min: 0, max: 300 }],
  valueAbove: ['值大於', { i: 0, min: 0, max: 999 }, '的至少', { i: 1, min: 0, max: 5 }, '顆'],
  firstY: ['最小號碼的 y =', { i: 0, min: 1, max: 5 }],
  yAtLeast: ['y =', { i: 0, min: 1, max: 5 }, '至少', { i: 1, min: 0, max: 5 }, '顆'],
  noY: ['不能有 y =', { i: 0, min: 1, max: 5 }],
  tailCount: ['尾數', { i: 0, min: 0, max: 9 }, '的號碼有', { i: 1, min: 0, max: 5 }, '～', { i: 2, min: 0, max: 5 }, '顆'],
  minBelow: ['最小號碼小於', { i: 0, min: 1, max: 40 }],
  posGap: ['由小到大第', { i: 0, min: 1, max: 5 }, '顆的隔期介於', { i: 1, min: 0, max: 99 }, '～', { i: 2, min: 0, max: 99 }],
  rangeAtLeast: ['號碼', { i: 0, min: 1, max: 39 }, '～', { i: 1, min: 1, max: 39 }, '至少', { i: 2, min: 0, max: 5 }, '顆'],
  zoneNot: ['區間分佈不能是 1-13 有', { i: 0, min: 0, max: 5 }, '顆、14-27 有', { i: 1, min: 0, max: 5 }, '顆、28-39 有', { i: 2, min: 0, max: 5 }, '顆'],
  sameTailMax: ['和上一期相同的尾數最多', { i: 0, min: 0, max: 5 }, '個（數尾數）'],
  valueCount: ['值 =', { i: 0, min: 0, max: 999 }, '的有', { i: 1, min: 0, max: 5 }, '～', { i: 2, min: 0, max: 5 }, '顆'],
  evenAtLeast: ['雙數至少', { i: 0, min: 0, max: 5 }, '顆'],
  exclude: ['排除號碼']
}

/** 2026-10-09 使用者在對話裡逐條加上的條件（第 115000244 期開完的盤面篩出 70 組） */
export const DEFAULT_CONDITIONS: Condition[] = [
  { id: 'config', kind: 'config', enabled: true, p: [3, 1, 1] },
  { id: 'gapSum', kind: 'gapSum', enabled: true, p: [11, 29] },
  { id: 'valueAbove', kind: 'valueAbove', enabled: true, p: [10, 1] },
  { id: 'firstY', kind: 'firstY', enabled: true, p: [1] },
  { id: 'y4', kind: 'yAtLeast', enabled: true, p: [4, 1] },
  { id: 'noY5', kind: 'noY', enabled: true, p: [5] },
  { id: 'tail7', kind: 'tailCount', enabled: true, p: [7, 1, 1] },
  { id: 'minBelow', kind: 'minBelow', enabled: true, p: [10] },
  { id: 'pos2Gap', kind: 'posGap', enabled: true, p: [2, 0, 5] },
  { id: 'range20', kind: 'rangeAtLeast', enabled: true, p: [20, 29, 1] },
  { id: 'zoneNot', kind: 'zoneNot', enabled: true, p: [2, 2, 1] },
  { id: 'y1', kind: 'yAtLeast', enabled: true, p: [1, 2] },
  { id: 'sameTail', kind: 'sameTailMax', enabled: true, p: [2] },
  { id: 'value0', kind: 'valueCount', enabled: true, p: [0, 1, 2] },
  { id: 'value1', kind: 'valueCount', enabled: true, p: [1, 1, 2] },
  { id: 'even', kind: 'evenAtLeast', enabled: true, p: [3] },
  { id: 'exclude', kind: 'exclude', enabled: true, p: [], nums: [7] }
]

const count = <T>(arr: T[], f: (x: T) => boolean): number => arr.reduce((a, x) => a + (f(x) ? 1 : 0), 0)
const p = (c: Condition, i: number): number => c.p[i] ?? 0

/** 單一條件對一組（已由小到大排、含隔期 / 值 / 位置）是否成立 */
export function checkCondition(c: Condition, combo: NumInfo[], prevNums: number[]): boolean {
  switch (c.kind) {
    case 'config':
      return count(combo, x => x.gap <= 5) === p(c, 0) && count(combo, x => x.gap >= 6 && x.gap <= 9) === p(c, 1) && count(combo, x => x.gap >= 10) === p(c, 2)
    case 'gapSum': {
      const s = combo.reduce((a, x) => a + x.gap, 0)
      return s >= p(c, 0) && s <= p(c, 1)
    }
    case 'valueAbove':
      return count(combo, x => x.value > p(c, 0)) >= p(c, 1)
    case 'firstY':
      return combo[0]?.y === p(c, 0)
    case 'yAtLeast':
      return count(combo, x => x.y === p(c, 0)) >= p(c, 1)
    case 'noY':
      return !combo.some(x => x.y === p(c, 0))
    case 'tailCount': {
      const k = count(combo, x => x.n % 10 === p(c, 0))
      return k >= p(c, 1) && k <= p(c, 2)
    }
    case 'minBelow':
      return (combo[0]?.n ?? 0) < p(c, 0)
    case 'posGap': {
      const x = combo[p(c, 0) - 1]
      return x != null && x.gap >= p(c, 1) && x.gap <= p(c, 2)
    }
    case 'rangeAtLeast':
      return count(combo, x => x.n >= p(c, 0) && x.n <= p(c, 1)) >= p(c, 2)
    case 'zoneNot':
      return !(count(combo, x => x.n <= 13) === p(c, 0) && count(combo, x => x.n >= 14 && x.n <= 27) === p(c, 1) && count(combo, x => x.n >= 28) === p(c, 2))
    case 'sameTailMax': {
      const prev = new Set(prevNums.map(n => n % 10))
      return new Set(combo.map(x => x.n % 10).filter(d => prev.has(d))).size <= p(c, 0)
    }
    case 'valueCount': {
      const k = count(combo, x => x.value === p(c, 0))
      return k >= p(c, 1) && k <= p(c, 2)
    }
    case 'evenAtLeast':
      return count(combo, x => x.n % 2 === 0) >= p(c, 0)
    case 'exclude':
      return !combo.some(x => (c.nums ?? []).includes(x.n))
  }
}

/** 一組沒通過哪些（啟用中的）條件 */
export function failedConditions(conds: Condition[], combo: NumInfo[], prevNums: number[]): Condition[] {
  return conds.filter(c => c.enabled && !checkCondition(c, combo, prevNums))
}

export interface FilterResult {
  total: number
  /** counts[n] = 號碼 n 出現在幾組 */
  counts: number[]
  /** 通過的組合（隔期和小 → 大）；超過 keep 組時只算數不留清單 */
  combos: NumInfo[][]
  truncated: boolean
}

/** 列舉 1~39 選 5 的全部組合，套用啟用中的條件 */
export function runFilter(conds: Condition[], info: Map<number, NumInfo>, prevNums: number[], keep = 5000): FilterResult {
  const active = conds.filter(c => c.enabled)
  const noY = active.filter(c => c.kind === 'noY').map(c => p(c, 0))
  const excluded = new Set(active.filter(c => c.kind === 'exclude').flatMap(c => c.nums ?? []))
  // 單顆就能判斷的先排掉，少跑很多組合
  const pool = [...info.values()].filter(x => !excluded.has(x.n) && !noY.includes(x.y)).sort((a, b) => a.n - b.n)
  const comboConds = active.filter(c => c.kind !== 'noY' && c.kind !== 'exclude')
  const counts = new Array<number>(40).fill(0)
  const combos: NumInfo[][] = []
  let total = 0
  const m = pool.length
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      for (let c = b + 1; c < m; c++) {
        for (let d = c + 1; d < m; d++) {
          for (let e = d + 1; e < m; e++) {
            const combo = [pool[a]!, pool[b]!, pool[c]!, pool[d]!, pool[e]!]
            if (!comboConds.every(k => checkCondition(k, combo, prevNums))) continue
            total++
            combo.forEach(x => counts[x.n]!++)
            if (combos.length < keep) combos.push(combo)
          }
        }
      }
    }
  }
  const gs = (x: NumInfo[]) => x.reduce((s, y) => s + y.gap, 0)
  const truncated = total > keep
  return { total, counts, combos: truncated ? combos : [...combos].sort((x, y) => gs(x) - gs(y)), truncated }
}
