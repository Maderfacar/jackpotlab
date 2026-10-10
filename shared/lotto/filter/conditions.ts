/**
 * 隔期篩選（/gapfilter）條件引擎：照使用者口述的條件，從某一期開完的盤面篩下一期的 5 顆組合。
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
  = | 'numSum' | 'rangeCount' | 'decadeCount' | 'minBelow' | 'zoneNot' | 'evenCount' | 'exclude'
    | 'config' | 'gapSum' | 'posGap' | 'ballGap'
    | 'valueAboveCount' | 'valueCount' | 'ballValue'
    | 'firstY' | 'yCount' | 'noY' | 'ballY'
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

/** 句子片段：字串照印（'\n' = 換行）、{ i } 是第 i 個數字參數的輸入格 */
export type Segment = string | { i: number, min: number, max: number }

const n5 = (i: number) => ({ i, min: 0, max: 5 })

/** 1-9 / 10-19 / 20-29 / 30-39 各有 a～b 顆 */
const DECADES: [number, number][] = [[1, 9], [10, 19], [20, 29], [30, 39]]

/** 第 1～5 顆各一組 a～b（由小到大排），參數依序 [第1顆 a, b, 第2顆 a, b, …] */
function perBall(max: number): Segment[] {
  return [0, 1, 2, 3, 4].flatMap(k => [
    ...(k === 0 ? [] : ['\n']),
    `第 ${k + 1} 顆`, { i: k * 2, min: 0, max }, '～', { i: k * 2 + 1, min: 0, max }
  ])
}

export const KIND_SPEC: Record<ConditionKind, Segment[]> = {
  numSum: ['五顆獎號總和介於', { i: 0, min: 15, max: 185 }, '～', { i: 1, min: 15, max: 185 }],
  rangeCount: ['號碼', { i: 0, min: 1, max: 39 }, '～', { i: 1, min: 1, max: 39 }, '有', n5(2), '～', n5(3), '顆'],
  decadeCount: ['號碼各段的顆數', ...DECADES.flatMap(([lo, hi], k) => ['\n', `${lo}-${hi} 有`, n5(k * 2), '～', n5(k * 2 + 1), '顆'])],
  minBelow: ['最小號碼小於', { i: 0, min: 1, max: 40 }],
  zoneNot: ['區間分佈不能是 1-13 有', n5(0), '顆、14-27 有', n5(1), '顆、28-39 有', n5(2), '顆'],
  evenCount: ['雙數有', n5(0), '～', n5(1), '顆'],
  exclude: ['排除號碼'],
  config: ['隔期 0～5 選', n5(0), '顆、6～9 選', n5(1), '顆、10 以上選', n5(2), '顆'],
  gapSum: ['五顆隔期和介於', { i: 0, min: 0, max: 300 }, '～', { i: 1, min: 0, max: 300 }],
  posGap: ['由小到大第', { i: 0, min: 1, max: 5 }, '顆的隔期介於', { i: 1, min: 0, max: 99 }, '～', { i: 2, min: 0, max: 99 }],
  ballGap: ['由小到大，每顆的隔期介於', '\n', ...perBall(59)],
  valueAboveCount: ['值大於', { i: 0, min: 0, max: 999 }, '的有', n5(1), '～', n5(2), '顆'],
  valueCount: ['值 =', { i: 0, min: 0, max: 999 }, '的有', n5(1), '～', n5(2), '顆'],
  ballValue: ['由小到大，每顆的值介於', '\n', ...perBall(999)],
  firstY: ['最小號碼的 y =', { i: 0, min: 1, max: 5 }],
  yCount: ['y =', { i: 0, min: 1, max: 5 }, '的有', n5(1), '～', n5(2), '顆'],
  noY: ['不能有 y =', { i: 0, min: 1, max: 5 }],
  ballY: ['由小到大，每顆的 y 介於', '\n', ...perBall(5)],
  tailCount: ['尾數', { i: 0, min: 0, max: 9 }, '的號碼有', n5(1), '～', n5(2), '顆'],
  sameTailMax: ['和上一期相同的尾數最多', n5(0), '個（數尾數）']
}

/** 每種條件屬於哪一類、能不能再加一條（再加時的預設數字） */
export const KIND_META: Record<ConditionKind, { group: GroupKey, repeatable?: number[] }> = {
  numSum: { group: 'number' },
  rangeCount: { group: 'number', repeatable: [1, 9, 0, 0] },
  decadeCount: { group: 'number' },
  minBelow: { group: 'number' },
  zoneNot: { group: 'number', repeatable: [2, 2, 1] },
  evenCount: { group: 'number' },
  exclude: { group: 'number' },
  config: { group: 'gap' },
  gapSum: { group: 'gap' },
  posGap: { group: 'gap', repeatable: [1, 0, 5] },
  ballGap: { group: 'gap' },
  valueAboveCount: { group: 'value' },
  valueCount: { group: 'value', repeatable: [2, 0, 5] },
  ballValue: { group: 'value' },
  firstY: { group: 'position' },
  yCount: { group: 'position', repeatable: [2, 0, 5] },
  noY: { group: 'position', repeatable: [4] },
  ballY: { group: 'position' },
  tailCount: { group: 'tail', repeatable: [1, 0, 5] },
  sameTailMax: { group: 'tail' }
}

/**
 * 2026-10-09 使用者在對話裡逐條加上的條件（第 115000244 期開完的盤面篩出 70 組）；獎號總和預設不勾。
 * 2026-10-10：「號碼 20～29 有 1～5 顆」改成四段各有幾顆、「第 2 顆隔期 0～5」併入每顆隔期（結果不變）；
 * 每顆的值 / y 預設不限、不勾。
 */
export const DEFAULT_CONDITIONS: Condition[] = [
  { id: 'numSum', kind: 'numSum', enabled: false, p: [15, 185] },
  { id: 'decade', kind: 'decadeCount', enabled: true, p: [0, 5, 0, 5, 1, 5, 0, 5] },
  { id: 'minBelow', kind: 'minBelow', enabled: true, p: [10] },
  { id: 'zoneNot', kind: 'zoneNot', enabled: true, p: [2, 2, 1] },
  { id: 'even', kind: 'evenCount', enabled: true, p: [3, 5] },
  { id: 'exclude', kind: 'exclude', enabled: true, p: [], nums: [7] },
  { id: 'config', kind: 'config', enabled: true, p: [3, 1, 1] },
  { id: 'gapSum', kind: 'gapSum', enabled: true, p: [11, 29] },
  { id: 'ballGap', kind: 'ballGap', enabled: true, p: [0, 59, 0, 5, 0, 59, 0, 59, 0, 59] },
  { id: 'valueAbove', kind: 'valueAboveCount', enabled: true, p: [10, 1, 5] },
  { id: 'value0', kind: 'valueCount', enabled: true, p: [0, 1, 2] },
  { id: 'value1', kind: 'valueCount', enabled: true, p: [1, 1, 2] },
  { id: 'ballValue', kind: 'ballValue', enabled: false, p: [0, 999, 0, 999, 0, 999, 0, 999, 0, 999] },
  { id: 'firstY', kind: 'firstY', enabled: true, p: [1] },
  { id: 'y4', kind: 'yCount', enabled: true, p: [4, 1, 5] },
  { id: 'y1', kind: 'yCount', enabled: true, p: [1, 2, 5] },
  { id: 'noY5', kind: 'noY', enabled: true, p: [5] },
  { id: 'ballY', kind: 'ballY', enabled: false, p: [1, 5, 1, 5, 1, 5, 1, 5, 1, 5] },
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
/** 第 1～5 顆的某個欄位各自落在 [p(2k), p(2k+1)] */
const eachBall = (c: Condition, combo: NumInfo[], f: (x: NumInfo) => number): boolean =>
  combo.every((x, k) => between(f(x), p(c, k * 2), p(c, k * 2 + 1)))

/** 單一條件對一組（已由小到大排、含隔期 / 值 / 位置）是否成立 */
export function checkCondition(c: Condition, combo: NumInfo[], prevNums: number[]): boolean {
  switch (c.kind) {
    case 'numSum':
      return between(combo.reduce((a, x) => a + x.n, 0), p(c, 0), p(c, 1))
    case 'rangeCount':
      return between(count(combo, x => between(x.n, p(c, 0), p(c, 1))), p(c, 2), p(c, 3))
    case 'decadeCount':
      return DECADES.every(([lo, hi], k) => between(count(combo, x => between(x.n, lo, hi)), p(c, k * 2), p(c, k * 2 + 1)))
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
    case 'ballGap':
      return eachBall(c, combo, x => x.gap)
    case 'valueAboveCount':
      return between(count(combo, x => x.value > p(c, 0)), p(c, 1), p(c, 2))
    case 'valueCount':
      return between(count(combo, x => x.value === p(c, 0)), p(c, 1), p(c, 2))
    case 'ballValue':
      return eachBall(c, combo, x => x.value)
    case 'firstY':
      return combo[0]?.y === p(c, 0)
    case 'yCount':
      return between(count(combo, x => x.y === p(c, 0)), p(c, 1), p(c, 2))
    case 'noY':
      return !combo.some(x => x.y === p(c, 0))
    case 'ballY':
      return eachBall(c, combo, x => x.y)
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

/**
 * 列舉時用的快速判斷：每條條件先把數字參數取出來，編成兩個函式
 *   - full(5 顆)：和 checkCondition 同義（測試拿暴力列舉 + checkCondition 逐一比對）
 *   - prefix(前 d 顆)：確定後面怎麼補都不會過才回 false（只用「只會越加越多」的量、剩下空位補不補得到下限、已固定的第幾顆）
 */
interface Compiled {
  full: (combo: NumInfo[]) => boolean
  prefix: (pre: NumInfo[]) => boolean
}

function countIn(arr: NumInfo[], f: (x: NumInfo) => boolean): number {
  let k = 0
  for (let i = 0; i < arr.length; i++) if (f(arr[i]!)) k++
  return k
}

/** 符合 f 的顆數介於 lo～hi */
function countRule(f: (x: NumInfo) => boolean, lo: number, hi: number): Compiled {
  return {
    full: (combo) => {
      const k = countIn(combo, f)
      return k >= lo && k <= hi
    },
    prefix: (pre) => {
      const k = countIn(pre, f)
      return k <= hi && k + 5 - pre.length >= lo
    }
  }
}

/** 幾類各自的顆數介於 lo～hi；前幾顆時各類還差的顆數加起來要放得進剩下的空位 */
function bucketRule(buckets: { f: (x: NumInfo) => boolean, lo: number, hi: number }[]): Compiled {
  return {
    full: combo => buckets.every((b) => {
      const k = countIn(combo, b.f)
      return k >= b.lo && k <= b.hi
    }),
    prefix: (pre) => {
      let short = 0
      for (const b of buckets) {
        const k = countIn(pre, b.f)
        if (k > b.hi) return false
        short += Math.max(0, b.lo - k)
      }
      return short <= 5 - pre.length
    }
  }
}

/** 欄位總和介於 lo～hi（欄位都 ≥ 0，前幾顆只看上限） */
function sumRule(f: (x: NumInfo) => number, lo: number, hi: number): Compiled {
  const sum = (arr: NumInfo[]) => {
    let s = 0
    for (let i = 0; i < arr.length; i++) s += f(arr[i]!)
    return s
  }
  return {
    full: (combo) => {
      const s = sum(combo)
      return s >= lo && s <= hi
    },
    prefix: pre => sum(pre) <= hi
  }
}

/** 第 1～5 顆各自的欄位介於 [lo_k, hi_k]；前幾顆只要看最後加進來那顆 */
function eachBallRule(c: Condition, f: (x: NumInfo) => number): Compiled {
  const lo = [0, 1, 2, 3, 4].map(k => p(c, k * 2))
  const hi = [0, 1, 2, 3, 4].map(k => p(c, k * 2 + 1))
  return {
    full: combo => combo.every((x, k) => between(f(x), lo[k]!, hi[k]!)),
    prefix: (pre) => {
      const k = pre.length - 1
      return between(f(pre[k]!), lo[k]!, hi[k]!)
    }
  }
}

/** 和上一期相同的尾數（數尾數）最多 max 個 */
function sameTailRule(prevNums: number[], max: number): Compiled {
  const prevTail = new Array<boolean>(10).fill(false)
  prevNums.forEach((n) => {
    prevTail[n % 10] = true
  })
  const ok = (arr: NumInfo[]) => {
    let mask = 0
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i]!.n % 10
      if (prevTail[d]) mask |= 1 << d
    }
    let k = 0
    for (; mask; mask &= mask - 1) k++
    return k <= max
  }
  return { full: ok, prefix: ok }
}

/** 只看最小那顆（第 1 顆）的條件：前幾顆時也能直接判斷 */
function firstBallRule(ok: (x: NumInfo) => boolean): Compiled {
  const f = (arr: NumInfo[]) => ok(arr[0]!)
  return { full: f, prefix: f }
}

function compile(c: Condition, prevNums: number[]): Compiled {
  const v = p(c, 0)
  switch (c.kind) {
    case 'numSum':
      return sumRule(x => x.n, p(c, 0), p(c, 1))
    case 'gapSum':
      return sumRule(x => x.gap, p(c, 0), p(c, 1))
    case 'rangeCount': {
      const b = p(c, 1)
      return countRule(x => x.n >= v && x.n <= b, p(c, 2), p(c, 3))
    }
    case 'decadeCount':
      return bucketRule(DECADES.map(([a, b], k) => ({ f: (x: NumInfo) => x.n >= a && x.n <= b, lo: p(c, k * 2), hi: p(c, k * 2 + 1) })))
    case 'config':
      return bucketRule([
        { f: x => x.gap <= 5, lo: p(c, 0), hi: p(c, 0) },
        { f: x => x.gap >= 6 && x.gap <= 9, lo: p(c, 1), hi: p(c, 1) },
        { f: x => x.gap >= 10, lo: p(c, 2), hi: p(c, 2) }
      ])
    case 'minBelow':
      return firstBallRule(x => x.n < v)
    case 'firstY':
      return firstBallRule(x => x.y === v)
    case 'evenCount':
      return countRule(x => x.n % 2 === 0, p(c, 0), p(c, 1))
    case 'valueAboveCount':
      return countRule(x => x.value > v, p(c, 1), p(c, 2))
    case 'valueCount':
      return countRule(x => x.value === v, p(c, 1), p(c, 2))
    case 'yCount':
      return countRule(x => x.y === v, p(c, 1), p(c, 2))
    case 'tailCount':
      return countRule(x => x.n % 10 === v, p(c, 1), p(c, 2))
    case 'posGap': {
      const idx = v - 1
      const lo = p(c, 1)
      const hi = p(c, 2)
      return {
        full: combo => combo[idx] != null && between(combo[idx]!.gap, lo, hi),
        prefix: pre => pre[idx] == null || between(pre[idx]!.gap, lo, hi)
      }
    }
    case 'ballGap':
      return eachBallRule(c, x => x.gap)
    case 'ballValue':
      return eachBallRule(c, x => x.value)
    case 'ballY':
      return eachBallRule(c, x => x.y)
    case 'sameTailMax':
      return sameTailRule(prevNums, v)
    default:
      // zoneNot 等只能等 5 顆到齊再判斷
      return { full: combo => checkCondition(c, combo, prevNums), prefix: () => true }
  }
}

/** 通常最嚴、最便宜的先查，早點剪掉 */
const CHECK_ORDER: ConditionKind[] = ['firstY', 'minBelow', 'ballGap', 'config', 'ballY', 'ballValue', 'posGap', 'gapSum', 'numSum', 'decadeCount']
const rank = (c: Condition): number => {
  const i = CHECK_ORDER.indexOf(c.kind)
  return i < 0 ? CHECK_ORDER.length : i
}

const comb4 = (n: number): number => (n < 4 ? 0 : (n * (n - 1) * (n - 2) * (n - 3)) / 24)
const comb5 = (n: number): number => (n < 5 ? 0 : (n * (n - 1) * (n - 2) * (n - 3) * (n - 4)) / 120)

/** 列舉 1~39 選 5 的全部組合，套用啟用中的條件（前幾顆就不可能過的分支直接剪掉） */
export function runFilter(conds: Condition[], info: Map<number, NumInfo>, prevNums: number[], keep = 5000): FilterResult {
  const active = conds.filter(c => c.enabled)
  const noY = active.filter(c => c.kind === 'noY').map(c => p(c, 0))
  const excluded = new Set(active.filter(c => c.kind === 'exclude').flatMap(c => c.nums ?? []))
  // 單顆就能判斷的先排掉，少跑很多組合
  const pool = [...info.values()].filter(x => !excluded.has(x.n) && !noY.includes(x.y)).sort((a, b) => a.n - b.n)
  const rules = active
    .filter(c => c.kind !== 'noY' && c.kind !== 'exclude')
    .sort((a, b) => rank(a) - rank(b))
    .map(c => compile(c, prevNums))
  const m = pool.length
  const noRules = rules.length === 0
  const counts = new Array<number>(40).fill(0)
  const combos: NumInfo[][] = []
  // 沒有要逐組判斷的條件：組數與每顆出現次數直接用組合數算，清單只列前 keep 組
  let total = noRules ? comb5(m) : 0
  if (noRules) pool.forEach(x => (counts[x.n] = comb4(m - 1)))

  const pre: NumInfo[] = []
  const walk = (start: number): void => {
    for (let i = start; i <= m - (5 - pre.length); i++) {
      if (noRules && combos.length >= keep) return
      pre.push(pool[i]!)
      if (pre.length < 5) {
        if (rules.every(r => r.prefix(pre))) walk(i + 1)
      } else if (noRules) {
        combos.push([...pre])
      } else if (rules.every(r => r.full(pre))) {
        total++
        for (const x of pre) counts[x.n]!++
        if (combos.length < keep) combos.push([...pre])
      }
      pre.pop()
    }
  }
  walk(0)
  const gs = (x: NumInfo[]) => x.reduce((s, y) => s + y.gap, 0)
  const truncated = total > keep
  return { total, counts, combos: truncated ? combos : [...combos].sort((x, y) => gs(x) - gs(y)), truncated }
}
