/**
 * 規律驗證 第二～四組（2026-10-08 使用者拍板）：
 *   第二組 偏差是否持續存在（區段尺度：這段偏多的號碼 / 指標，下一段是否還偏）
 *   第三組 連續性與相關性（逐期尺度：本期與下 1～5 期的指標、轉移、隔期分布、號碼接續）
 *   第四組 前後段重現：每一項都分「前段 / 後段」各算一次，兩段同方向超出才算「重現」
 *
 * 對照基準：只用同一批真實開獎號碼，把開出「順序」打亂後重算（固定種子、可重現）。
 * 為什麼不用「相隔很遠的期數」當基準：隔期 / 現值 / 位置是由前面各期推出來的，
 * 本身就帶有前後關聯（例：一期開出很多冷號 → 冷號變少 → 下期隔期和自然偏小），
 * 遠距對照會把這種「算法造成的規律」誤判成開獎規律；打亂順序後算法照跑，這部分會一起出現而抵消。
 */
import { computeFeatures } from './features'

export type Verdict = 'replicated' | 'partial' | 'normal'
export type Direction = 'high' | 'low' | null

export interface PartValues {
  all: number | null
  front: number | null
  back: number | null
}

export interface StatCell {
  id: string
  label: string
  /** 真實順序的值 */
  real: PartValues
  /** 打亂順序 2.5%～97.5% 範圍 */
  low: PartValues
  high: PartValues
  /** 打亂順序的平均 */
  mean: PartValues
  verdict: Verdict
  direction: Direction
}

export interface StatGroup {
  id: string
  title: string
  description: string
  /** 數值格式：r = 相關係數、p = 比例 */
  kind: 'r' | 'p'
  cells: StatCell[]
}

export interface PairItem {
  from: number
  to: number
  front: number
  frontExpected: number
  back: number
  backExpected: number
}

export interface PairSummary {
  /** 判定門檻：實際次數 ≥ ratio × 依資料本身推算的次數 */
  ratio: number
  pairsChecked: number
  realMore: number
  realLess: number
  shuffleMore: { mean: number, p95: number }
  shuffleLess: { mean: number, p95: number }
  more: PairItem[]
  less: PairItem[]
}

export interface DependenceResult {
  meta: {
    drawCount: number
    firstTerm: number
    firstDate: string
    lastTerm: number
    lastDate: string
    warmup: number
    front: { startTerm: number, endTerm: number, draws: number }
    back: { startTerm: number, endTerm: number, draws: number }
    shuffles: number
    seed: number
  }
  groups: StatGroup[]
  pairs: PairSummary
  calibration: {
    cells: number
    realReplicated: number
    shuffleReplicatedMean: number
    shuffleReplicatedP95: number
  }
}

export interface DependenceInput {
  drawTerm: number
  drawDate: string
  numbers: number[]
}

// ---------- 工具 ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]!
    my += ys[i]!
  }
  mx /= n
  my /= n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    const dy = ys[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

type Part = 'all' | 'front' | 'back'
const PARTS: Part[] = ['all', 'front', 'back']

interface Ranges {
  all: [number, number]
  front: [number, number]
  back: [number, number]
}

// ---------- 逐期指標 ----------

interface SeriesDef {
  id: string
  label: string
  fn: (numbers: number[], f: { gaps: (number | null)[], values: (number | null)[], xs: (number | null)[], ys: (number | null)[] }) => number
}

function seriesDefs(numberMax: number, n: number): SeriesDef[] {
  const half = Math.floor(numberMax / 2)
  return [
    { id: 'repeat', label: '重號數（隔期 0）', fn: (_, f) => f.gaps.filter(g => g === 0).length },
    { id: 'gapSum', label: '隔期和', fn: (_, f) => f.gaps.reduce<number>((s, g) => s + (g ?? n), 0) },
    { id: 'gapMax', label: '最大隔期', fn: (_, f) => Math.max(...f.gaps.map(g => g ?? n)) },
    { id: 'valueSum', label: '現值和', fn: (_, f) => f.values.reduce<number>((s, v) => s + (v ?? 0), 0) },
    { id: 'x1', label: '位置 x=1 個數', fn: (_, f) => f.xs.filter(x => x === 1).length },
    { id: 'y1', label: '位置 y=1 個數', fn: (_, f) => f.ys.filter(y => y === 1).length },
    { id: 'numSum', label: '號碼和', fn: nums => nums.reduce((s, x) => s + x, 0) },
    { id: 'odd', label: '奇數個數', fn: nums => nums.filter(x => x % 2 === 1).length },
    { id: 'big', label: `大號個數（${half + 1}以上）`, fn: nums => nums.filter(x => x > half).length },
    { id: 'tails', label: '尾數種類數', fn: nums => new Set(nums.map(x => x % 10)).size },
    {
      id: 'consec',
      label: '連號組數',
      fn: (nums) => {
        const s = [...nums].sort((a, b) => a - b)
        let c = 0
        for (let i = 1; i < s.length; i++) if (s[i]! - s[i - 1]! === 1) c++
        return c
      }
    }
  ]
}

const LAGS = [1, 2, 3, 4, 5]
const BLOCKS = [10, 20, 30, 50]
const BLOCK_SERIES = ['gapSum', 'repeat', 'numSum', 'odd']
const BLOCK_SERIES_SIZES = [10, 20]
const GAP_BINS: { label: string, test: (g: number) => boolean }[] = [
  ...Array.from({ length: 15 }, (_, k) => ({ label: `${k}`, test: (g: number) => g === k })),
  { label: '15–19', test: g => g >= 15 && g <= 19 },
  { label: '20–29', test: g => g >= 20 && g <= 29 },
  { label: '30 以上', test: g => g >= 30 }
]

interface Bucketer {
  id: string
  label: string
  series: string
  names: string[]
  bucket: (v: number) => number
}

// ---------- 一次計算（真實順序或打亂後順序） ----------

interface Context {
  numberMax: number
  n: number
  partRanges: Record<Part, [number, number]>
  defs: SeriesDef[]
  bucketers: Bucketer[]
  pairRatio: number
}

interface OneRun {
  stats: Map<string, PartValues>
  pairMore: number
  pairLess: number
  pairDetail?: { more: PairItem[], less: PairItem[] }
}

function runOnce(draws: number[][], ctx: Context, withDetail: boolean): OneRun {
  const feats = computeFeatures(draws, ctx.n)
  const series = new Map<string, number[]>()
  for (const def of ctx.defs) {
    series.set(def.id, draws.map((nums, t) => def.fn(nums, feats[t]!)))
  }
  const stats = new Map<string, PartValues>()
  const set = (id: string, part: Part, v: number | null) => {
    const cur = stats.get(id) ?? { all: null, front: null, back: null }
    cur[part] = v
    stats.set(id, cur)
  }

  for (const part of PARTS) {
    const [s, e] = ctx.partRanges[part]

    // 第三組 ① 自相關
    for (const def of ctx.defs) {
      const x = series.get(def.id)!
      for (const L of LAGS) {
        const a: number[] = []
        const b: number[] = []
        for (let t = s; t + L < e; t++) {
          a.push(x[t]!)
          b.push(x[t + L]!)
        }
        set(`ac:${def.id}:${L}`, part, pearson(a, b))
      }
    }

    // 第三組 ② 轉移：P(下期=b | 本期=a)
    for (const bk of ctx.bucketers) {
      const x = series.get(bk.series)!
      const k = bk.names.length
      const cnt = Array.from({ length: k }, () => new Array<number>(k).fill(0))
      const row = new Array<number>(k).fill(0)
      for (let t = s; t + 1 < e; t++) {
        const a = bk.bucket(x[t]!)
        const b = bk.bucket(x[t + 1]!)
        cnt[a]![b]!++
        row[a]!++
      }
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          set(`tr:${bk.id}:${a}:${b}`, part, row[a]! > 0 ? cnt[a]![b]! / row[a]! : null)
        }
      }
    }

    // 第三組 ③ 隔期分布
    const binCount = new Array<number>(GAP_BINS.length).fill(0)
    let total = 0
    for (let t = s; t < e; t++) {
      for (const g of feats[t]!.gaps) {
        const gg = g ?? ctx.n
        const i = GAP_BINS.findIndex(bin => bin.test(gg))
        if (i >= 0) binCount[i]!++
        total++
      }
    }
    GAP_BINS.forEach((_, i) => set(`gap:${i}`, part, total > 0 ? binCount[i]! / total : null))

    // 第二組 ① 號碼冷熱延續：相鄰區段的 1～N 號出現次數相關
    for (const B of BLOCKS) {
      const vecs: number[][] = []
      for (let st = s; st + B <= e; st += B) {
        const v = new Array<number>(ctx.numberMax).fill(0)
        for (let t = st; t < st + B; t++) for (const x of draws[t]!) v[x - 1]!++
        vecs.push(v)
      }
      const rs: number[] = []
      for (let i = 0; i + 1 < vecs.length; i++) {
        const r = pearson(vecs[i]!, vecs[i + 1]!)
        if (r != null) rs.push(r)
      }
      set(`blk:${B}`, part, rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null)
    }

    // 第二組 ② 指標偏差延續：相鄰區段平均值的相關
    for (const id of BLOCK_SERIES) {
      const x = series.get(id)!
      for (const B of BLOCK_SERIES_SIZES) {
        const means: number[] = []
        for (let st = s; st + B <= e; st += B) {
          let sum = 0
          for (let t = st; t < st + B; t++) sum += x[t]!
          means.push(sum / B)
        }
        set(`bs:${id}:${B}`, part, pearson(means.slice(0, -1), means.slice(1)))
      }
    }
  }

  // 第三組 ④ 號碼接續（i 本期 → j 下期），前後段都偏多 / 偏少才算
  const pairCounts = (part: Part) => {
    const [s, e] = ctx.partRanges[part]
    const M = ctx.numberMax
    const c = new Array<number>(M * M).fill(0)
    const A = new Array<number>(M).fill(0)
    const Bc = new Array<number>(M).fill(0)
    let trans = 0
    for (let t = s; t + 1 < e; t++) {
      trans++
      for (const i of draws[t]!) A[i - 1]!++
      for (const j of draws[t + 1]!) Bc[j - 1]!++
      for (const i of draws[t]!) for (const j of draws[t + 1]!) c[(i - 1) * M + (j - 1)]!++
    }
    const exp = (i: number, j: number) => (trans > 0 ? (A[i]! * Bc[j]!) / trans : 0)
    return { c, exp }
  }
  const fr = pairCounts('front')
  const bk = pairCounts('back')
  let pairMore = 0
  let pairLess = 0
  const more: PairItem[] = []
  const less: PairItem[] = []
  const M = ctx.numberMax
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const f = fr.c[i * M + j]!
      const fe = fr.exp(i, j)
      const b = bk.c[i * M + j]!
      const be = bk.exp(i, j)
      const item = { from: i + 1, to: j + 1, front: f, frontExpected: fe, back: b, backExpected: be }
      if (fe > 0 && be > 0 && f >= ctx.pairRatio * fe && b >= ctx.pairRatio * be) {
        pairMore++
        if (withDetail) more.push(item)
      }
      if (fe > 0 && be > 0 && f <= fe / ctx.pairRatio && b <= be / ctx.pairRatio) {
        pairLess++
        if (withDetail) less.push(item)
      }
    }
  }

  return { stats, pairMore, pairLess, pairDetail: withDetail ? { more, less } : undefined }
}

// ---------- 主函式 ----------

export function analyzeDependence(
  input: DependenceInput[],
  numberMax: number,
  options: { n?: number, backDraws?: number, shuffles?: number, seed?: number, pairRatio?: number } = {}
): DependenceResult {
  const n = options.n ?? 60
  const shuffles = options.shuffles ?? 200
  const seed = options.seed ?? 20261008
  const pairRatio = options.pairRatio ?? 1.5
  const N = input.length
  const backDraws = Math.min(options.backDraws ?? 200, Math.floor((N - n) / 2))
  const split = N - backDraws
  const partRanges: Record<Part, [number, number]> = { all: [n, N], front: [n, split], back: [split, N] }
  const draws = input.map(d => d.numbers)
  const defs = seriesDefs(numberMax, n)

  // 隔期和三等分的切點：用真實資料本身決定，打亂後沿用同一組切點
  const realFeats = computeFeatures(draws, n)
  const gapSums = draws.slice(n).map((nums, i) => defs[1]!.fn(nums, realFeats[i + n]!)).sort((a, b) => a - b)
  const q1 = quantile(gapSums, 1 / 3) ?? 0
  const q2 = quantile(gapSums, 2 / 3) ?? 0
  const bucketers: Bucketer[] = [
    { id: 'repeat', label: '重號數', series: 'repeat', names: ['0', '1', '2+'], bucket: v => Math.min(v, 2) },
    { id: 'odd', label: '奇數個數', series: 'odd', names: ['0–1', '2', '3', '4–5'], bucket: v => (v <= 1 ? 0 : v >= 4 ? 3 : v - 1) },
    { id: 'gapSum', label: '隔期和', series: 'gapSum', names: [`低（≤${Math.round(q1)}）`, '中', `高（>${Math.round(q2)}）`], bucket: v => (v <= q1 ? 0 : v <= q2 ? 1 : 2) }
  ]
  const ctx: Context = { numberMax, n, partRanges, defs, bucketers, pairRatio }

  const real = runOnce(draws, ctx, true)
  const rand = mulberry32(seed)
  const runs: OneRun[] = []
  for (let k = 0; k < shuffles; k++) {
    const p = draws.slice()
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = p[i]!
      p[i] = p[j]!
      p[j] = tmp
    }
    runs.push(runOnce(p, ctx, false))
  }

  // 每格的打亂範圍
  const ranges = new Map<string, Ranges>()
  const means = new Map<string, PartValues>()
  for (const id of real.stats.keys()) {
    const r = {} as Ranges
    const m: PartValues = { all: null, front: null, back: null }
    for (const part of PARTS) {
      const vals = runs.map(x => x.stats.get(id)?.[part]).filter((v): v is number => v != null).sort((a, b) => a - b)
      r[part] = [quantile(vals, 0.025) ?? Number.NaN, quantile(vals, 0.975) ?? Number.NaN]
      m[part] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }
    ranges.set(id, r)
    means.set(id, m)
  }

  const side = (v: number | null, [lo, hi]: [number, number]): Direction =>
    v == null || Number.isNaN(lo) ? null : v < lo ? 'low' : v > hi ? 'high' : null
  const judge = (vals: PartValues, r: Ranges): { verdict: Verdict, direction: Direction } => {
    const sf = side(vals.front, r.front)
    const sb = side(vals.back, r.back)
    if (sf != null && sf === sb) return { verdict: 'replicated', direction: sf }
    const sa = side(vals.all, r.all)
    if (sa != null || sf != null || sb != null) return { verdict: 'partial', direction: sa ?? sf ?? sb }
    return { verdict: 'normal', direction: null }
  }

  const cell = (id: string, label: string): StatCell => {
    const r = ranges.get(id)!
    const v = real.stats.get(id)!
    return {
      id,
      label,
      real: v,
      low: { all: r.all[0], front: r.front[0], back: r.back[0] },
      high: { all: r.all[1], front: r.front[1], back: r.back[1] },
      mean: means.get(id)!,
      ...judge(v, r)
    }
  }

  const groups: StatGroup[] = [
    {
      id: 'blocks',
      title: '第二組 ① 號碼冷熱延續',
      description: '把期數切成每段 B 期，統計每段 1～' + numberMax + ' 號各開幾次，看相鄰兩段的冷熱相似度（相關係數，1 = 完全一樣、0 = 無關、負 = 相反）。偏高代表這段偏熱的號碼下一段還偏熱。',
      kind: 'r',
      cells: BLOCKS.map(B => cell(`blk:${B}`, `每段 ${B} 期`))
    },
    {
      id: 'blockSeries',
      title: '第二組 ② 指標偏差延續',
      description: '每段 B 期取指標平均，看相鄰兩段平均值的相關。偏高代表這段偏高（偏低）的指標，下一段也延續。',
      kind: 'r',
      cells: BLOCK_SERIES.flatMap(id => BLOCK_SERIES_SIZES.map(B => cell(`bs:${id}:${B}`, `${defs.find(d => d.id === id)!.label} · 每段 ${B} 期`)))
    },
    {
      id: 'autocorr',
      title: '第三組 ① 本期與後面幾期的相關',
      description: '同一個指標，本期的值和相隔 1～5 期後的值的相關係數。',
      kind: 'r',
      cells: defs.flatMap(def => LAGS.map(L => cell(`ac:${def.id}:${L}`, `${def.label} · 相隔 ${L} 期`)))
    },
    {
      id: 'transition',
      title: '第三組 ② 本期 → 下期 轉移',
      description: '本期落在某一類時，下期落在各類的比例。',
      kind: 'p',
      cells: bucketers.flatMap(bk => bk.names.flatMap((a, ai) => bk.names.map((b, bi) => cell(`tr:${bk.id}:${ai}:${bi}`, `${bk.label} 本期 ${a} → 下期 ${b}`))))
    },
    {
      id: 'gaps',
      title: '第三組 ③ 隔期分布',
      description: '開出的號碼中，隔期為 k 的比例（隔期 0 = 上一期剛開過）。',
      kind: 'p',
      cells: GAP_BINS.map((bin, i) => cell(`gap:${i}`, `隔期 ${bin.label}`))
    }
  ]

  // 校正：打亂後的資料，平均有幾格也會被判成「重現」
  const allIds = groups.flatMap(g => g.cells.map(c => c.id))
  const falseCounts = runs.map(run => allIds.filter((id) => {
    const v = run.stats.get(id)
    return v != null && judge(v, ranges.get(id)!).verdict === 'replicated'
  }).length).sort((a, b) => a - b)
  const pairMoreSorted = runs.map(r => r.pairMore).sort((a, b) => a - b)
  const pairLessSorted = runs.map(r => r.pairLess).sort((a, b) => a - b)
  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const byStrength = (a: PairItem, b: PairItem) =>
    Math.min(b.front / b.frontExpected, b.back / b.backExpected) - Math.min(a.front / a.frontExpected, a.back / a.backExpected)

  return {
    meta: {
      drawCount: N,
      firstTerm: input[0]?.drawTerm ?? 0,
      firstDate: input[0]?.drawDate ?? '',
      lastTerm: input.at(-1)?.drawTerm ?? 0,
      lastDate: input.at(-1)?.drawDate ?? '',
      warmup: n,
      front: { startTerm: input[n]?.drawTerm ?? 0, endTerm: input[split - 1]?.drawTerm ?? 0, draws: split - n },
      back: { startTerm: input[split]?.drawTerm ?? 0, endTerm: input.at(-1)?.drawTerm ?? 0, draws: N - split },
      shuffles,
      seed
    },
    groups,
    pairs: {
      ratio: pairRatio,
      pairsChecked: numberMax * numberMax,
      realMore: real.pairMore,
      realLess: real.pairLess,
      shuffleMore: { mean: avg(pairMoreSorted), p95: quantile(pairMoreSorted, 0.95) ?? 0 },
      shuffleLess: { mean: avg(pairLessSorted), p95: quantile(pairLessSorted, 0.95) ?? 0 },
      more: (real.pairDetail?.more ?? []).sort(byStrength),
      less: (real.pairDetail?.less ?? []).sort((a, b) => (a.front / a.frontExpected + a.back / a.backExpected) - (b.front / b.frontExpected + b.back / b.backExpected))
    },
    calibration: {
      cells: allIds.length,
      realReplicated: groups.reduce((s, g) => s + g.cells.filter(c => c.verdict === 'replicated').length, 0),
      shuffleReplicatedMean: avg(falseCounts),
      shuffleReplicatedP95: quantile(falseCounts, 0.95) ?? 0
    }
  }
}
