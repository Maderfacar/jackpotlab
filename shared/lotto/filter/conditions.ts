/**
 * 組合篩選（/filter）條件引擎：照使用者口述的條件，從某一期開完的盤面篩下一期的 5 顆組合。
 *
 * 定義（2026-10-09 與使用者逐條確認）：
 *   - 「第幾顆」= 號碼由小到大排；位置 x-y 用來源格原始剩餘號碼算（同格多顆不互扣，與網站獎號關聯一致）。
 *   - 「大於 / 小於」嚴格；「介於 a～b」「有 a～b 顆」含兩端（0～0 = 一顆都不要）。
 *   - 和上一期同尾 = 數「尾數」（05、15 都是尾 5 只算 1 個）。
 * 條件是資料（kind + 數字參數），頁面照 KIND_SPEC 畫成可勾選、可改數字的句子，依 KIND_META 的類別分組；
 * repeatable 的條件使用者可以在頁面上再加一條（id 以 u- 開頭）。
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
  = | 'numSum' | 'rangeCount' | 'minBelow' | 'zoneNot' | 'evenCount' | 'exclude'
    | 'config' | 'gapSum' | 'posGap'
    | 'valueAboveCount' | 'valueCount'
    | 'firstY' | 'yCount' | 'noY'
    | 'tailCount' | 'sameTailMax'

export interface Condition {
  id: string
  kind: ConditionKind
  enabled: boolean
  /** 數字參數，意義照 KIND_SPEC 的句子順序 */
  p: number[]
  /** exclude：要排除的號碼 */
  nums?: number[]
}

export type GroupKey = 'number' | 'gap' | 'value' | 'position' | 'tail'

export const GROUPS: { key: GroupKey, title: string }[] = [
  { key: 'number', title: '獎號本身' },
  { key: 'gap', title: '隔期' },
  { key: 'value', title: '值' },
  { key: 'position', title: '位置 y' },
  { key: 'tail', title: '尾數' }
]

/** 句子片段：字串照印、{ i } 是第 i 個數字參數的輸入格 */
export type Segment = string | { i: number, min: number, max: number }

const n5 = (i: number) => ({ i, min: 0, max: 5 })

export const KIND_SPEC: Record<ConditionKind, Segment[]> = {
  numSum: ['五顆獎號總和介於', { i: 0, min: 15, max: 185 }, '～', { i: 1, min: 15, max: 185 }],
  rangeCount: ['號碼', { i: 0, min: 1, max: 39 }, '～', { i: 1, min: 1, max: 39 }, '有', n5(2), '～', n5(3), '顆'],
  minBelow: ['最小號碼小於', { i: 0, min: 1, max: 40 }],
  zoneNot: ['區間分佈不能是 1-13 有', n5(0), '顆、14-27 有', n5(1), '顆、28-39 有', n5(2), '顆'],
  evenCount: ['雙數有', n5(0), '～', n5(1), '顆'],
  exclude: ['排除號碼'],
  config: ['隔期 0～5 選', n5(0), '顆、6～9 選', n5(1), '顆、10 以上選', n5(2), '顆'],
  gapSum: ['五顆隔期和介於', { i: 0, min: 0, max: 300 }, '～', { i: 1, min: 0, max: 300 }],
  posGap: ['由小到大第', { i: 0, min: 1, max: 5 }, '顆的隔期介於', { i: 1, min: 0, max: 99 }, '～', { i: 2, min: 0, max: 99 }],
  valueAboveCount: ['值大於', { i: 0, min: 0, max: 999 }, '的有', n5(1), '～', n5(2), '顆'],
  valueCount: ['值 =', { i: 0, min: 0, max: 999 }, '的有', n5(1), '～', n5(2), '顆'],
  firstY: ['最小號碼的 y =', { i: 0, min: 1, max: 5 }],
  yCount: ['y =', { i: 0, min: 1, max: 5 }, '的有', n5(1), '～', n5(2), '顆'],
  noY: ['不能有 y =', { i: 0, min: 1, max: 5 }],
  tailCount: ['尾數', { i: 0, min: 0, max: 9 }, '的號碼有', n5(1), '～', n5(2), '顆'],
  sameTailMax: ['和上一期相同的尾數最多', n5(0), '個（數尾數）']
}

/** 每種條件屬於哪一類、能不能再加一條（再加時的預設數字） */
export const KIND_META: Record<ConditionKind, { group: GroupKey, repeatable?: number[] }> = {
  numSum: { group: 'number' },
  rangeCount: { group: 'number', repeatable: [1, 9, 0, 0] },
  minBelow: { group: 'number' },
  zoneNot: { group: 'number', repeatable: [2, 2, 1] },
  evenCount: { group: 'number' },
  exclude: { group: 'number' },
  config: { group: 'gap' },
  gapSum: { group: 'gap' },
  posGap: { group: 'gap', repeatable: [1, 0, 5] },
  valueAboveCount: { group: 'value' },
  valueCount: { group: 'value', repeatable: [2, 0, 5] },
  firstY: { group: 'position' },
  yCount: { group: 'position', repeatable: [2, 0, 5] },
  noY: { group: 'position', repeatable: [4] },
  tailCount: { group: 'tail', repeatable: [1, 0, 5] },
  sameTailMax: { group: 'tail' }
}

/** 2026-10-09 使用者在對話裡逐條加上的條件（第 115000244 期開完的盤面篩出 70 組）；獎號總和預設不勾 */
export const DEFAULT_CONDITIONS: Condition[] = [
  { id: 'numSum', kind: 'numSum', enabled: false, p: [15, 185] },
  { id: 'range20', kind: 'rangeCount', enabled: true, p: [20, 29, 1, 5] },
  { id: 'minBelow', kind: 'minBelow', enabled: true, p: [10] },
  { id: 'zoneNot', kind: 'zoneNot', enabled: true, p: [2, 2, 1] },
  { id: 'even', kind: 'evenCount', enabled: true, p: [3, 5] },
  { id: 'exclude', kind: 'exclude', enabled: true, p: [], nums: [7] },
  { id: 'config', kind: 'config', enabled: true, p: [3, 1, 1] },
  { id: 'gapSum', kind: 'gapSum', enabled: true, p: [11, 29] },
  { id: 'pos2Gap', kind: 'posGap', enabled: true, p: [2, 0, 5] },
  { id: 'valueAbove', kind: 'valueAboveCount', enabled: true, p: [10, 1, 5] },
  { id: 'value0', kind: 'valueCount', enabled: true, p: [0, 1, 2] },
  { id: 'value1', kind: 'valueCount', enabled: true, p: [1, 1, 2] },
  { id: 'firstY', kind: 'firstY', enabled: true, p: [1] },
  { id: 'y4', kind: 'yCount', enabled: true, p: [4, 1, 5] },
  { id: 'y1', kind: 'yCount', enabled: true, p: [1, 2, 5] },
  { id: 'noY5', kind: 'noY', enabled: true, p: [5] },
  { id: 'tail7', kind: 'tailCount', enabled: true, p: [7, 1, 1] },
  { id: 'sameTail', kind: 'sameTailMax', enabled: true, p: [2] }
]

/** 依類別排好（同類保持原本先後），頁面編號照這個順序 */
export function sortByGroup(conds: Condition[]): Condition[] {
  const order = GROUPS.map(g => g.key)
  return conds
    .map((c, i) => ({ c, i }))
    .sort((a, b) => order.indexOf(KIND_META[a.c.kind].group) - order.indexOf(KIND_META[b.c.kind].group) || a.i - b.i)
    .map(x => x.c)
}

const count = <T>(arr: T[], f: (x: T) => boolean): number => arr.reduce((a, x) => a + (f(x) ? 1 : 0), 0)
const p = (c: Condition, i: number): number => c.p[i] ?? 0
const between = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi

/** 單一條件對一組（已由小到大排、含隔期 / 值 / 位置）是否成立 */
export function checkCondition(c: Condition, combo: NumInfo[], prevNums: number[]): boolean {
  switch (c.kind) {
    case 'numSum':
      return between(combo.reduce((a, x) => a + x.n, 0), p(c, 0), p(c, 1))
    case 'rangeCount':
      return between(count(combo, x => between(x.n, p(c, 0), p(c, 1))), p(c, 2), p(c, 3))
    case 'minBelow':
      return (combo[0]?.n ?? 0) < p(c, 0)
    case 'zoneNot':
      return !(count(combo, x => x.n <= 13) === p(c, 0) && count(combo, x => x.n >= 14 && x.n <= 27) === p(c, 1) && count(combo, x => x.n >= 28) === p(c, 2))
    case 'evenCount':
      return between(count(combo, x => x.n % 2 === 0), p(c, 0), p(c, 1))
    case 'exclude':
      return !combo.some(x => (c.nums ?? []).includes(x.n))
    case 'config':
      return count(combo, x => x.gap <= 5) === p(c, 0) && count(combo, x => x.gap >= 6 && x.gap <= 9) === p(c, 1) && count(combo, x => x.gap >= 10) === p(c, 2)
    case 'gapSum':
      return between(combo.reduce((a, x) => a + x.gap, 0), p(c, 0), p(c, 1))
    case 'posGap': {
      const x = combo[p(c, 0) - 1]
      return x != null && between(x.gap, p(c, 1), p(c, 2))
    }
    case 'valueAboveCount':
      return between(count(combo, x => x.value > p(c, 0)), p(c, 1), p(c, 2))
    case 'valueCount':
      return between(count(combo, x => x.value === p(c, 0)), p(c, 1), p(c, 2))
    case 'firstY':
      return combo[0]?.y === p(c, 0)
    case 'yCount':
      return between(count(combo, x => x.y === p(c, 0)), p(c, 1), p(c, 2))
    case 'noY':
      return !combo.some(x => x.y === p(c, 0))
    case 'tailCount':
      return between(count(combo, x => x.n % 10 === p(c, 0)), p(c, 1), p(c, 2))
    case 'sameTailMax': {
      const prev = new Set(prevNums.map(n => n % 10))
      return new Set(combo.map(x => x.n % 10).filter(d => prev.has(d))).size <= p(c, 0)
    }
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
