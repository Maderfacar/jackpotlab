/**
 * /scan 頁的整理層：把「選定期 t、統計範圍」下要看的東西一次算好，元件只負責畫。
 * 所有比例都附次數；需要下一期的統計只用 t 以前已開出的下一期（見 scan.ts）。
 */
import type { BoardState } from './board-states'
import {
  boardBuckets, conditional, configChecks, continueTable, dirOf, farCountTable, gapConfig, gapsOf, gapSum,
  lastK, numbersWithTail, recentValues, runStats, sharedTails, tailPairEvents, tailStreak, trailingCount,
  valueSum, valuesOf, WARMUP, windowIndices, yIntervals,
  type BucketView, type Dir, type GapConfig, type Rate, type ScanDraw, type TailPairEvent, type ValueItem
} from './scan'

export interface CondRate {
  cond: Rate
  base: Rate
}
export interface SeriesItem {
  s: number
  issue: string
  value: number
  dir: Dir | null
}
export interface ExtraRule {
  key: string
  label: string
  note?: string
  /** 只看「條件成立後」，不比平常（例：交替率） */
  noBase?: boolean
  rate: CondRate
  /** 選定期是否正好符合條件（null = 不適用） */
  now: boolean | null
}

const RECENT_SERIES = 30
const GRID_DRAWS = 20

export function buildScanView(draws: ScanDraw[], states: BoardState[], t: number, size: number | null, recentN: number) {
  const idx = windowIndices(draws, t, size, WARMUP)
  const draw = draws[t]!
  const g = (s: number) => gapsOf(draws[s]!)
  const v = (s: number) => valuesOf(draws[s]!)
  const gs = (s: number) => gapSum(draws[s]!)
  const vs = (s: number) => valueSum(draws[s]!)
  const inIdx = new Set(idx)
  const dirAt = (f: (s: number) => number, s: number): Dir | null => (inIdx.has(s) && inIdx.has(s - 1) ? dirOf(f(s - 1), f(s)) : null)
  const cr = (cond: (s: number) => boolean, outcome: (n: number) => boolean): CondRate => conditional(idx, t, cond, outcome)

  return {
    t,
    idx,
    draw,
    prev: t > 0 ? draws[t - 1]! : null,
    next: t + 1 < draws.length ? draws[t + 1]! : null,
    board: buildBoard(draws, states, idx, t, recentN, cr, g),
    gapSum: buildDirSection(idx, t, gs, s => dirAt(gs, s), draws),
    valueSum: buildValueSum(idx, t, draws, v, gs, vs, cr),
    streak: buildStreak(idx, t, draws, g, cr),
    yInt: buildY(idx, t, draws),
    tails: buildTails(idx, t, draws),
    extras: buildExtras(idx, t, draws, g, v, gs, vs, s => dirAt(vs, s), cr)
  }
}
export type ScanView = ReturnType<typeof buildScanView>

type CR = (cond: (s: number) => boolean, outcome: (n: number) => boolean) => CondRate

function buildBoard(draws: ScanDraw[], states: BoardState[], idx: number[], t: number, recentN: number, cr: CR, g: (s: number) => number[]) {
  const state = states[t]!
  const buckets: BucketView[] = boardBuckets(state)
  const far = buckets[3]!
  const recent: ValueItem[] = recentValues(draws, idx, t, recentN)
  const farNums = far.slots.flatMap(sl => sl.nums.map((num) => {
    const atLeast = recent.filter(r => r.value >= sl.value)
    return { num, gap: sl.gap, value: sl.value, atLeast: atLeast.length, latest: [...atLeast].sort((a, b) => b.s - a.s)[0] ?? null }
  }))
  const farCount = (s: number) => (states[s] ? boardBuckets(states[s]!)[3]!.count : 0)
  const config: GapConfig = gapConfig(g(t))
  const dist = { low: new Array<number>(6).fill(0), mid: new Array<number>(6).fill(0), high: new Array<number>(6).fill(0) }
  let lowOk = 0
  let midOk = 0
  let highOk = 0
  let allOk = 0
  for (const s of idx) {
    const c = gapConfig(g(s))
    dist.low[c.low]!++
    dist.mid[c.mid]!++
    dist.high[c.high]!++
    const ok = configChecks(c)
    if (ok.low) lowOk++
    if (ok.mid) midOk++
    if (ok.high) highOk++
    if (ok.low && ok.mid && ok.high) allOk++
  }
  const n = idx.length
  return {
    buckets,
    farNums,
    recentTop: recent.slice(0, 8),
    recentN,
    farTable: farCountTable(states, draws, idx, t, 20),
    farNow: far.count,
    far2: cr(s => farCount(s) >= 2, n1 => g(n1).some(x => x >= 20)),
    config,
    checks: configChecks(config),
    dist,
    normRates: { low: { hit: lowOk, n }, mid: { hit: midOk, n }, high: { hit: highOk, n }, all: { hit: allOk, n } }
  }
}

function buildDirSection(idx: number[], t: number, f: (s: number) => number, dirAt: (s: number) => Dir | null, draws: ScanDraw[]) {
  const dirs = idx.map(dirAt).filter((d): d is Dir => d != null)
  const recent: SeriesItem[] = idx.filter(s => s <= t).slice(-RECENT_SERIES).map(s => ({ s, issue: draws[s]!.issue, value: f(s), dir: dirAt(s) }))
  const runs = runStats(dirs)
  return {
    recent,
    now: f(t),
    prevValue: idx.includes(t - 1) ? f(t - 1) : null,
    current: runs.current,
    lengths: runs.lengths,
    table: continueTable(dirs, 4),
    flat: dirs.filter(d => d === '平').length,
    total: dirs.length
  }
}

function buildValueSum(idx: number[], t: number, draws: ScanDraw[], v: (s: number) => number[], gs: (s: number) => number, vs: (s: number) => number, cr: CR) {
  const big = (s: number) => v(s).some(x => x > 10)
  const recent = idx.filter(s => s <= t).slice(-RECENT_SERIES).map(s => ({ s, issue: draws[s]!.issue, value: vs(s), gap: gs(s), big: big(s) }))
  const less = idx.filter(s => vs(s) < gs(s)).length
  return {
    recent,
    now: vs(t),
    gapNow: gs(t),
    lessThanGap: { hit: less, n: idx.length },
    under10: cr(s => vs(s) < 10, big),
    noBig2: cr(s => lastK(idx, s, 2, q => !big(q)), big),
    noBig3: cr(s => lastK(idx, s, 3, q => !big(q)), big),
    noBigNow: trailingCount(idx, t, s => !big(s))
  }
}

const STREAK_RULES = [
  { k: 2, th: 5 }, { k: 3, th: 5 }, { k: 2, th: 10 }, { k: 3, th: 10 }
] as const

function buildStreak(idx: number[], t: number, draws: ScanDraw[], g: (s: number) => number[], cr: CR) {
  const grid = idx.filter(s => s <= t).slice(-GRID_DRAWS).map(s => ({ s, issue: draws[s]!.issue, gaps: g(s) }))
  const positions = [0, 1, 2, 3, 4].map(p => ({
    p,
    cur5: trailingCount(idx, t, s => g(s)[p]! > 5),
    cur10: trailingCount(idx, t, s => g(s)[p]! > 10),
    rules: STREAK_RULES.map(r => ({ ...r, rate: cr(s => lastK(idx, s, r.k, q => g(q)[p]! > r.th), n1 => g(n1)[p]! <= 5) }))
  }))
  const pooled = STREAK_RULES.map((r, i) => {
    const sum = (pick: (x: CondRate) => Rate) => positions.reduce((a, p) => ({ hit: a.hit + pick(p.rules[i]!.rate).hit, n: a.n + pick(p.rules[i]!.rate).n }), { hit: 0, n: 0 })
    return { ...r, rate: { cond: sum(x => x.cond), base: sum(x => x.base) } }
  })
  return { grid, positions, pooled }
}

function buildY(idx: number[], t: number, draws: ScanDraw[]) {
  return {
    ys: draws[t]!.ys,
    rows: [2, 3, 4, 5].map(y => ({
      y,
      whole: yIntervals(draws, idx, t, y, null),
      per: [0, 1, 2, 3, 4].map(p => yIntervals(draws, idx, t, y, p))
    }))
  }
}

function buildTails(idx: number[], t: number, draws: ScanDraw[]) {
  const counts = (s: number) => {
    const c = new Array<number>(10).fill(0)
    draws[s]!.nums.forEach(n => c[n % 10]!++)
    return c
  }
  const recent = idx.filter(s => s <= t).slice(-GRID_DRAWS).map(s => ({
    s,
    issue: draws[s]!.issue,
    nums: draws[s]!.nums,
    counts: counts(s),
    shared: s > 0 ? sharedTails(draws[s]!.nums, draws[s - 1]!.nums) : []
  }))
  const sharedDist = new Array<number>(6).fill(0)
  idx.forEach((s) => {
    if (s > 0 && s <= t) sharedDist[sharedTails(draws[s]!.nums, draws[s - 1]!.nums).length]!++
  })
  const presence = new Array<number>(10).fill(0)
  idx.forEach(s => new Set(draws[s]!.nums.map(n => n % 10)).forEach(d => presence[d]!++))
  const pTail = presence.map(c => (idx.length ? c / idx.length : 0))

  const events: TailPairEvent[] = tailPairEvents(draws, idx, t)
  const done = events.filter(e => e.next != null)
  const nextHit = done.filter(e => e.next !== 'none').length
  const noneEv = done.filter(e => e.next === 'none' && e.skipHit != null)
  const within3Ev = events.filter(e => e.s + 3 <= t)
  const within3Hit = within3Ev.filter(e => [1, 2, 3].some(q => draws[e.s + q]!.nums.some(n => n % 10 === e.tail))).length
  const expectedNext = done.length ? done.reduce((a, e) => a + pTail[e.tail]!, 0) / done.length : null

  const watchNow = events.filter(e => e.s === t).map(e => ({ tail: e.tail, nums: e.nums, others: numbersWithTail(e.tail).filter(n => !e.nums.includes(n)) }))
  const watchSkip = events.filter(e => e.s === t - 1 && e.next === 'none').map(e => ({ tail: e.tail, nums: e.nums, others: numbersWithTail(e.tail).filter(n => !e.nums.includes(n)) }))

  return {
    recent,
    streak: tailStreak(draws, idx, t),
    sharedDist,
    sharedNow: t > 0 ? sharedTails(drawAt(draws, t).nums, drawAt(draws, t - 1).nums) : [],
    pairs: {
      recent: events.slice(-10).reverse().map(e => ({ ...e, issue: draws[e.s]!.issue })),
      next: { hit: nextHit, n: done.length },
      repeat: done.filter(e => e.next === 'repeat' || e.next === 'both').length,
      other: done.filter(e => e.next === 'other' || e.next === 'both').length,
      skip: { hit: noneEv.filter(e => e.skipHit).length, n: noneEv.length },
      within3: { hit: within3Hit, n: within3Ev.length },
      expectedNext,
      watchNow,
      watchSkip
    }
  }
}
const drawAt = (draws: ScanDraw[], s: number): ScanDraw => draws[s]!

function buildExtras(
  idx: number[], t: number, draws: ScanDraw[], g: (s: number) => number[], v: (s: number) => number[],
  gs: (s: number) => number, vs: (s: number) => number, vDir: (s: number) => Dir | null, cr: CR
): ExtraRule[] {
  const big = (s: number) => v(s).some(x => x > 10)
  const reps = (s: number) => g(s).filter(x => x === 0).length
  const high = (s: number) => g(s).filter(x => x >= 10).length
  const altCond = (s: number) => vDir(s) != null && vDir(s) !== '平'
  const nowOf = (f: (s: number) => boolean) => (idx.includes(t) ? f(t) : null)
  const rules: { key: string, label: string, note?: string, noBase?: boolean, cond: (s: number) => boolean, out: (n: number) => boolean }[] = [
    { key: 'v-alt', label: '值和也是「大小交替」：這期方向跟上一期相反', noBase: true, cond: altCond, out: n => vDir(n) != null && vDir(n) !== '平' && vDir(n) !== vDir(n - 1) },
    { key: 'g-high', label: '隔期和 ≥ 45 → 下一期隔期和比本期小', note: '隔期和長期平均固定是 34，偏高之後下一期本來就容易變小', cond: s => gs(s) >= 45, out: n => gs(n) < gs(n - 1) },
    { key: 'g-low', label: '隔期和 ≤ 22 → 下一期隔期和比本期大', note: '同上，偏低之後容易回到 34 附近', cond: s => gs(s) <= 22, out: n => gs(n) > gs(n - 1) },
    { key: 'v-high', label: '值和 ≥ 40 → 下一期值和比本期小', note: '值和也有自己的平均，偏高之後容易變小', cond: s => vs(s) >= 40, out: n => vs(n) < vs(n - 1) },
    { key: 'nobig2', label: '連 2 期沒有單顆值 > 10 → 下一期出現單顆值 > 10', cond: s => lastK(idx, s, 2, q => !big(q)), out: big },
    { key: 'nobig3', label: '連 3 期沒有單顆值 > 10 → 下一期出現單顆值 > 10', cond: s => lastK(idx, s, 3, q => !big(q)), out: big },
    { key: 'high2', label: '本期隔期 10 以上開了 ≥ 2 顆 → 下一期隔期 10 以上只開 0～1 顆', cond: s => high(s) >= 2, out: n => high(n) <= 1 },
    { key: 'rep0', label: '本期沒有連莊（隔期 0）→ 下一期有連莊', note: '條件成立後跟平常差不多，這條看不出差別', cond: s => reps(s) === 0, out: n => reps(n) >= 1 }
  ]
  return rules.map(r => ({ key: r.key, label: r.label, note: r.note, noBase: r.noBase, rate: cr(r.cond, r.out), now: r.noBase ? null : nowOf(r.cond) }))
}
