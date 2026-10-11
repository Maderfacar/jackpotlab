/**
 * /scan 八點各自的細節資料（選定第 t 期；只用 ≤ t 的資料）。元件只負責畫。
 */
import { tailPairEvents, WARMUP, type PairNext } from '../scan'
import {
  chainCandidates, GAPSUM_STRONG, LOW_RUN, stairs, TAIL_GAP_CAP, tailRatio, tripleRepeats, VALUE_LEVELS, valueLevel
} from './evaluate'
import { hyper, numbersWhere, probability, type NumberInfo } from './board-prob'
import { gapSumOf, hasTail, lowCount, pairTails, repeatCount, smallValueCount, y1Count, type Row } from './rows'
import { intervalStats, ledger, type IntervalStats } from './stats'

export const LEDGER_SIZE = 100
const RECENT = 30

export interface Rate {
  hit: number
  n: number
  /** 照那幾期盤面「本來該有」的次數加總（每期的盤面機率相加） */
  expect: number
}
const rate = (): Rate => ({ hit: 0, n: 0, expect: 0 })
const bump = (r: Rate, ok: boolean, p = 0) => {
  r.n++
  r.expect += p
  if (ok) r.hit++
}
const leq2 = (info: NumberInfo[]) => {
  const K = numbersWhere(info, x => x.gap != null && x.gap <= 5).length
  return hyper(K, 0) + hyper(K, 1) + hyper(K, 2)
}

// ---------- 第 1 點：0~5 開幾顆 ----------

export function lowDetail(rows: Row[], t: number, infos: NumberInfo[][]) {
  const dist = new Array<number>(6).fill(0)
  for (let s = WARMUP; s <= t; s++) dist[lowCount(rows[s]!)]!++
  // 連 k 期都開 3 或 4 顆之後（剛好 k 期），下一期開幾顆
  const runs = Array.from({ length: 7 }, (_, i) => ({ k: i + 1, next: new Array<number>(6).fill(0), n: 0, expect: 0 }))
  let run = 0
  const within2 = rate()
  for (let s = WARMUP; s < t; s++) {
    const l = lowCount(rows[s]!)
    run = l === 3 || l === 4 ? run + 1 : 0
    if (run >= 1) {
      const row = runs[Math.min(run, 7) - 1]!
      row.n++
      row.next[lowCount(rows[s + 1]!)]!++
      row.expect += leq2(infos[s]!)
    }
    if (run >= LOW_RUN && s + 2 <= t) bump(within2, lowCount(rows[s + 1]!) <= 2 || lowCount(rows[s + 2]!) <= 2)
  }
  let current = 0
  for (let s = t; s >= WARMUP; s--) {
    const l = lowCount(rows[s]!)
    if (l !== 3 && l !== 4) break
    current++
  }
  // 0~5 這段桶子目前裝幾顆 = 最近 6 期開過、之後沒再開走的號碼（每顆只算一次）
  const inLow = new Set<number>()
  for (let s = Math.max(0, t - 5); s <= t; s++) rows[s]!.nums.forEach(n => inLow.add(n))
  const recent = rows.slice(Math.max(WARMUP, t - RECENT + 1), t + 1).map(r => ({ issue: r.issue, value: lowCount(r) }))
  const each: { k: number, stats: IntervalStats }[] = [0, 1, 2, 3, 4, 5].map(k => ({ k, stats: intervalStats(t, s => lowCount(rows[s]!) === k) }))
  return {
    now: lowCount(rows[t]!),
    current,
    dist,
    runs,
    within2,
    boardLow: inLow.size,
    recent,
    each,
    ledger: ledger(rows, t, LEDGER_SIZE, r => lowCount(r))
  }
}

// ---------- 第 2 點：隔期和 ----------

export function gapSumDetail(rows: Row[], t: number, infos: NumberInfo[][]) {
  const dirOf = (s: number) => (s > 0 ? Math.sign(gapSumOf(rows[s]!) - gapSumOf(rows[s - 1]!)) : 0)
  // 連 k 次同方向之後，下一期反轉
  const runs = Array.from({ length: 5 }, (_, i) => ({ k: i + 1, ...rate() }))
  let run = 0
  let prev = 0
  for (let s = WARMUP; s < t; s++) {
    const d = dirOf(s)
    run = d !== 0 && d === prev ? run + 1 : d !== 0 ? 1 : 0
    prev = d
    if (run >= 1) {
      const p = probability(infos[s]!, { kind: 'gapsum', cur: gapSumOf(rows[s]!), want: d > 0 ? 'lt' : 'gt' })
      bump(runs[Math.min(run, 5) - 1]!, dirOf(s + 1) === -d, p)
    }
  }
  let current = 0
  const dNow = dirOf(t)
  for (let s = t; s >= WARMUP && dNow !== 0 && dirOf(s) === dNow; s--) current++
  const recent = rows.slice(Math.max(WARMUP, t - RECENT + 1), t + 1).map((r, i, arr) => {
    const s = t - arr.length + 1 + i
    return { issue: r.issue, value: gapSumOf(r), dir: dirOf(s) }
  })
  return {
    now: gapSumOf(rows[t]!),
    dir: dNow,
    current,
    strong: current >= GAPSUM_STRONG,
    runs,
    recent,
    ledger: ledger(rows, t, LEDGER_SIZE, r => gapSumOf(r))
  }
}

// ---------- 第 3 點：值 ----------

/** 值分三類：小 0～1、中 2～9、大 10 以上 */
export const valueClass = (v: number): 0 | 1 | 2 => (v <= 1 ? 0 : v <= 9 ? 1 : 2)

export function valueDetail(rows: Row[], t: number) {
  const levels = VALUE_LEVELS.map((label, L) => {
    const stats = intervalStats(t, s => rows[s]!.values.some(v => v != null && valueLevel(v) === L))
    const ratio = stats.mean && stats.current != null ? stats.current / stats.mean : null
    return { label, stats, ratio }
  })
  // 5 顆的小 / 中 / 大搭配
  const combos = new Map<string, number>()
  let allSmall = 0
  let allBig = 0
  let n = 0
  for (let s = WARMUP; s <= t; s++) {
    const vs = rows[s]!.values
    if (vs.some(v => v == null)) continue
    const c = [0, 0, 0]
    vs.forEach(v => c[valueClass(v!)]!++)
    const key = c.join('-')
    combos.set(key, (combos.get(key) ?? 0) + 1)
    if (c[0] === 5) allSmall++
    if (c[2] === 5) allBig++
    n++
  }
  const nowVals = rows[t]!.values
  const nowClass = [0, 0, 0]
  nowVals.forEach(v => v != null && nowClass[valueClass(v)]!++)
  return {
    values: nowVals,
    nowCombo: nowClass.join('-'),
    levels,
    combos: [...combos.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    n,
    allSmall,
    allBig,
    ledger: ledger(rows, t, LEDGER_SIZE, r => smallValueCount(r))
  }
}

// ---------- 第 4 點：同尾對 ----------

export function pairDetail(rows: Row[], t: number) {
  const idx: number[] = []
  for (let s = WARMUP; s <= t; s++) idx.push(s)
  const events = tailPairEvents(rows, idx, t)
  const done = events.filter(e => e.next != null)
  const count = (pred: (k: PairNext) => boolean) => done.filter(e => pred(e.next!)).length
  // 前 10 期內的同尾對，下一期有沒有帶出同尾（使用者的看法）
  const last10 = events.filter(e => e.s < t && e.s >= t - 10).map(e => ({ issue: rows[e.s]!.issue, tail: e.tail, nums: e.nums, next: e.next, skipHit: e.skipHit }))
  const now = pairTails(rows[t]!.nums).map(d => ({ tail: d, nums: rows[t]!.nums.filter(n => n % 10 === d), others: [d, d + 10, d + 20, d + 30].filter(n => n >= 1 && n <= 39 && !rows[t]!.nums.includes(n)) }))
  return {
    now,
    total: done.length,
    repeat: count(k => k === 'repeat'),
    other: count(k => k === 'other'),
    both: count(k => k === 'both'),
    none: count(k => k === 'none'),
    skip: { hit: done.filter(e => e.next === 'none' && e.skipHit).length, n: done.filter(e => e.next === 'none' && e.skipHit != null).length },
    last10: last10.reverse(),
    last10Hit: last10.filter(e => e.next != null && e.next !== 'none').length,
    last10N: last10.filter(e => e.next != null).length,
    ledger: ledger(rows, t, LEDGER_SIZE, r => pairTails(r.nums).length)
  }
}

// ---------- 第 5 點：位置 y ----------

export function yDetail(rows: Row[], t: number) {
  const positions = [0, 1, 2, 3, 4].map((p) => {
    const dist = new Array<number>(6).fill(0)
    for (let s = WARMUP; s <= t; s++) {
      const y = rows[s]!.ys[p]
      if (y != null) dist[Math.min(y, 5)]!++
    }
    let run = 0
    for (let s = t; s >= WARMUP && rows[s]!.ys[p] !== 1; s--) run++
    const each = [1, 2, 3, 4, 5].map(y => ({ y, stats: intervalStats(t, s => rows[s]!.ys[p] === y) }))
    const recent = rows.slice(Math.max(WARMUP, t - RECENT + 1), t + 1).map(r => r.ys[p] ?? null)
    return { p, now: rows[t]!.ys[p] ?? null, dist: dist.slice(1), run, each, recent }
  })
  return { positions, ledger: ledger(rows, t, LEDGER_SIZE, r => y1Count(r)) }
}

// ---------- 第 6 點：第 1～5 顆的隔期 ----------

/** 熱度圖欄數：隔期 0～29 各一欄，30 以上一欄 */
export const POS_GAP_COLS = 30

export function posDetail(rows: Row[], t: number, infos: NumberInfo[][]) {
  const grid = [0, 1, 2, 3, 4].map(() => new Array<number>(POS_GAP_COLS + 1).fill(0))
  const totals = [0, 0, 0, 0, 0]
  for (let s = WARMUP; s <= t; s++) {
    rows[s]!.gaps.forEach((g, p) => {
      grid[p]![g == null ? POS_GAP_COLS : Math.min(g, POS_GAP_COLS)]!++
      totals[p]!++
    })
  }
  const runs = [0, 1, 2, 3, 4].map((p) => {
    let k = 0
    for (let s = t; s >= WARMUP; s--) {
      const g = rows[s]!.gaps[p]
      if (g != null && g <= 5) break
      k++
    }
    return k
  })
  // 同一顆連 k 期隔期 > 5（剛好 k、5 以上併一格）之後，下一期這顆回到 0～5
  const rules = [0, 1, 2, 3, 4].map(() => Array.from({ length: 5 }, (_, i) => ({ k: i + 1, ...rate() })))
  const base = [0, 1, 2, 3, 4].map(() => rate())
  const run = [0, 0, 0, 0, 0]
  for (let s = WARMUP; s < t; s++) {
    const lowNums = numbersWhere(infos[s]!, x => x.gap != null && x.gap <= 5)
    for (let p = 0; p < 5; p++) {
      const g = rows[s]!.gaps[p]
      run[p] = g == null || g > 5 ? run[p]! + 1 : 0
      const ng = rows[s + 1]!.gaps[p]
      const back = ng != null && ng <= 5
      const prob = probability(infos[s]!, { kind: 'pos', pos: p, nums: lowNums })
      bump(base[p]!, back, prob)
      if (run[p]! >= 1) bump(rules[p]![Math.min(run[p]!, 5) - 1]!, back, prob)
    }
  }
  const recent = rows.slice(Math.max(WARMUP, t - RECENT + 1), t + 1).map(r => ({ issue: r.issue, gaps: r.gaps }))
  return {
    now: rows[t]!.gaps,
    grid,
    totals,
    runs,
    rules,
    base,
    recent
  }
}

/** 第 6 點存摺：第 pick 顆落在 0～5 */
export const posLedger = (rows: Row[], t: number, pick: number) =>
  ledger(rows, t, LEDGER_SIZE, r => (r.gaps[pick] != null && r.gaps[pick]! <= 5 ? 1 : 0))

// ---------- 第 7 點：連莊、梯型 ----------

export function chainDetail(rows: Row[], t: number) {
  const tri = (s: number) => (s >= 2 ? tripleRepeats(rows[s - 2]!.nums, rows[s - 1]!.nums, rows[s]!.nums) : [])
  const st = (s: number) => (s >= 2 ? stairs(rows[s - 2]!.nums, rows[s - 1]!.nums, rows[s]!.nums) : [])
  let both = 0
  let triN = 0
  let stairN = 0
  // 穿插或重疊：依時間排的事件序列裡，相鄰兩件是不同種（穿插）還是同種
  let switches = 0
  let sames = 0
  let lastKind: 'tri' | 'stair' | null = null
  for (let s = WARMUP; s <= t; s++) {
    const a = tri(s).length > 0
    const b = st(s).length > 0
    if (a) triN++
    if (b) stairN++
    if (a && b) both++
    const kinds: ('tri' | 'stair')[] = []
    if (a) kinds.push('tri')
    if (b) kinds.push('stair')
    for (const k of kinds) {
      if (lastKind) {
        if (k === lastKind) sames++
        else switches++
      }
      lastKind = k
    }
  }
  const timeline = rows.slice(Math.max(WARMUP, t - 119), t + 1).map((r, i, arr) => {
    const s = t - arr.length + 1 + i
    return { issue: r.issue, tri: tri(s), stair: st(s) }
  })
  return {
    candidates: t >= 1 ? chainCandidates(rows[t - 1]!.nums, rows[t]!.nums) : [],
    repeatsNow: t >= 1 ? rows[t]!.nums.filter(n => rows[t - 1]!.nums.includes(n)) : [],
    triStats: intervalStats(t, s => tri(s).length > 0),
    stairStats: intervalStats(t, s => st(s).length > 0),
    triN,
    stairN,
    both,
    switches,
    sames,
    timeline,
    ledger: ledger(rows, t, LEDGER_SIZE, r => repeatCount(r))
  }
}

// ---------- 第 8 點：尾數的隔期 ----------

export function tailDetail(rows: Row[], t: number) {
  const last = new Array<number>(10).fill(-1)
  const cells = Array.from({ length: 10 }, () => Array.from({ length: TAIL_GAP_CAP + 1 }, () => rate()))
  for (let s = 0; s <= t; s++) {
    for (let d = 0; d < 10; d++) {
      const has = hasTail(rows[s]!.nums, d)
      if (s >= WARMUP && last[d]! >= 0) bump(cells[d]![Math.min(s - 1 - last[d]!, TAIL_GAP_CAP)]!, has)
      if (has) last[d] = s
    }
  }
  const tails = Array.from({ length: 10 }, (_, d) => {
    const stats = intervalStats(t, s => hasTail(rows[s]!.nums, d))
    const ratio = stats.current == null ? null : tailRatio(cells[d]!, Math.min(stats.current, TAIL_GAP_CAP))
    const recent = rows.slice(Math.max(WARMUP, t - RECENT + 1), t + 1).map(r => hasTail(r.nums, d))
    return { d, stats, ratio, recent }
  })
  let excluded: number | null = null
  tails.forEach((x) => {
    if (x.ratio && (excluded == null || x.ratio.ratio < tails[excluded]!.ratio!.ratio)) excluded = x.d
  })
  return { tails, excluded }
}

/** 第 8 點存摺：尾數 pick 有沒有開 */
export const tailLedger = (rows: Row[], t: number, pick: number) =>
  ledger(rows, t, LEDGER_SIZE, r => (hasTail(r.nums, pick) ? 1 : 0))

/**
 * 第 8 點「你的看法」細節：每次出現同尾時，前面已經連續幾次「同尾之後下一期都帶出同尾」，
 * 這次下一期「不開這個尾數」的比例（連 0、1、2…6 次以上分開看），和平常不開的比例。
 */
export function tailStreakDetail(rows: Row[], t: number) {
  /** 這些尾數的號碼下一期一顆都不開的機率（照盤面：39 取 5） */
  const noneProb = (tails: number[]) => hyper(Array.from({ length: 39 }, (_, i) => i + 1).filter(n => tails.includes(n % 10)).length, 0)
  const rowsOut = Array.from({ length: 7 }, (_, k) => ({ k, hit: 0, n: 0, expect: 0 }))
  const outcomes: boolean[] = []
  for (let s = 0; s <= t; s++) {
    if (s >= 1) {
      const prev = pairTails(rows[s - 1]!.nums)
      if (prev.length) outcomes.push(prev.some(d => hasTail(rows[s]!.nums, d)))
    }
    const tails = pairTails(rows[s]!.nums)
    if (!tails.length) continue
    let streak = 0
    for (let i = outcomes.length - 1; i >= 0 && outcomes[i]; i--) streak++
    if (s < WARMUP || s >= t) continue
    const row = rowsOut[Math.min(streak, 6)]!
    row.n++
    if (!tails.some(d => hasTail(rows[s + 1]!.nums, d))) row.hit++
    row.expect += noneProb(tails)
  }
  const n = rowsOut.reduce((a, r) => a + r.n, 0)
  const base = n ? rowsOut.reduce((a, r) => a + r.expect, 0) / n : null
  // 目前：最近連續幾次同尾都帶出同尾（只算下一期已開出的）
  let current = 0
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i]; i--) current++
  const nowTails = pairTails(rows[t]!.nums)
  return { rows: rowsOut, base, current, nowTails }
}
