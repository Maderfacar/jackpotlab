/**
 * /scan 八點（2026-10-11 使用者拍板的查找方向）逐期亮燈與成真。
 *
 * 每一點在第 s 期開完時：
 *   lit    — 這一點有沒有亮燈（條件成立）
 *   target — 亮燈時指的對象（例：第 2 顆、尾 3、值 2、號碼 07）
 *   hit    — 第 s+1 期它說的事有沒有成真（下一期還沒開 = null）
 *   base   — 「平常」：不看亮燈，同一件事本來發生的比例（只用第 s 期以前的資料算）
 * 全部只用第 s 期（含）以前的資料決定亮燈，不偷看未來。
 */
import { WARMUP } from '../scan'
import { hasTail, lowCount, pairTails, gapSumOf, type Row } from './rows'

export const POINT_KEYS = ['low', 'gapsum', 'value', 'pair', 'y', 'pos', 'chain', 'tail'] as const
export type PointKey = typeof POINT_KEYS[number]

export interface PointEval {
  lit: boolean
  /** 亮得比較強（例：隔期和連 3 次同方向） */
  strong: boolean
  target: string
  hit: boolean | null
  base: number | null
}

/** 第 1 點：0~5 每期都開 3 或 4 顆，連續幾期算徘徊（使用者：五期左右） */
export const LOW_RUN = 5
/** 第 2 點：隔期和跟前一期比連續同方向幾次開始觀察（連 3 次算連續） */
export const GAPSUM_WATCH = 2
export const GAPSUM_STRONG = 3
/** 第 3 點：某個值已經隔了「平均間隔 × 幾倍」以上沒出現，算到期 */
export const VALUE_DUE = 2
/** 第 5、6 點：同一顆連續幾期 */
export const POS_RUN = 2
/** 第 5 點：只看平常 y=1 過半的球位 */
export const Y1_MAJORITY = 0.5
/** 第 8 點：尾數隔期分組 0,1,2,3,4,5+；格子次數少於這個不拿來比 */
export const TAIL_GAP_CAP = 5
export const TAIL_MIN_N = 30

/** 第 3 點的值分組 */
export const VALUE_LEVELS = ['0', '1', '2', '3', '4', '5', '6~9', '10+'] as const
export const valueLevel = (v: number): number => (v <= 5 ? v : v <= 9 ? 6 : 7)

const NONE: PointEval = { lit: false, strong: false, target: '', hit: null, base: null }
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 從 0 開始的一般隔期計數器：記錄事件上次出現、間隔總和、出現次數 */
class Occ {
  last = -1
  intervalSum = 0
  intervals = 0
  hits = 0
  seen = 0
  add(s: number, occurred: boolean): void {
    this.seen++
    if (!occurred) return
    this.hits++
    if (this.last >= 0) {
      this.intervalSum += s - this.last
      this.intervals++
    }
    this.last = s
  }

  gapAt(s: number): number | null {
    return this.last < 0 ? null : s - this.last
  }

  get meanInterval(): number | null {
    return this.intervals ? this.intervalSum / this.intervals : null
  }

  get freq(): number | null {
    return this.seen ? this.hits / this.seen : null
  }
}

function hyperAny(k: number): number {
  // 39 取 5，指定 k 顆號碼至少開出 1 顆的機率
  let none = 1
  for (let i = 0; i < 5; i++) none *= (39 - k - i) / (39 - i)
  return 1 - none
}

/** 每期 × 八點。前 WARMUP 期一律不亮（隔期表還沒填滿）。 */
export function evaluatePoints(rows: Row[]): Record<PointKey, PointEval[]> {
  const out = Object.fromEntries(POINT_KEYS.map(k => [k, [] as PointEval[]])) as Record<PointKey, PointEval[]>
  const next = (s: number) => rows[s + 1]

  // 累計器（只看到第 s 期）
  let lowRun = 0
  const lowLe2 = new Occ()
  let gsRun = 0
  let prevDir = 0
  let revN = 0
  let revHit = 0
  const valueOcc = VALUE_LEVELS.map(() => new Occ())
  const y1Occ = [0, 1, 2, 3, 4].map(() => new Occ())
  const yRun = [0, 0, 0, 0, 0]
  const lowPosOcc = [0, 1, 2, 3, 4].map(() => new Occ())
  const gRun = [0, 0, 0, 0, 0]
  const tailOcc = Array.from({ length: 10 }, () => new Occ())
  const tailCell = Array.from({ length: 10 }, () => Array.from({ length: TAIL_GAP_CAP + 1 }, () => ({ n: 0, hit: 0 })))
  const tailMasks: number[] = []

  for (let s = 0; s < rows.length; s++) {
    const r = rows[s]!
    const nx = next(s)
    const live = s >= WARMUP

    // ---- 更新累計（含第 s 期）----
    const low = lowCount(r)
    lowRun = low === 3 || low === 4 ? lowRun + 1 : 0
    if (s >= WARMUP) lowLe2.add(s, low <= 2)

    const dir = s > 0 ? Math.sign(gapSumOf(r) - gapSumOf(rows[s - 1]!)) : 0
    if (s > 1 && prevDir !== 0 && s >= WARMUP) {
      revN++
      if (dir === -prevDir) revHit++
    }
    gsRun = dir !== 0 && dir === prevDir ? gsRun + 1 : dir !== 0 ? 1 : 0
    prevDir = dir

    const levels = new Set(r.values.filter((v): v is number => v != null).map(valueLevel))
    if (s >= 1) valueOcc.forEach((o, L) => o.add(s, levels.has(L)))

    for (let p = 0; p < 5; p++) {
      const y = r.ys[p]
      const g = r.gaps[p]
      if (s >= 1) {
        y1Occ[p]!.add(s, y === 1)
        lowPosOcc[p]!.add(s, g != null && g <= 5)
      }
      yRun[p] = y !== 1 ? yRun[p]! + 1 : 0
      gRun[p] = g == null || g > 5 ? gRun[p]! + 1 : 0
    }

    // 尾數：先用「上一期開完時的隔期」把本期結果記進格子，再更新
    const mask = r.nums.reduce((m, n) => m | (1 << (n % 10)), 0)
    for (let d = 0; d < 10; d++) {
      const gap = tailOcc[d]!.gapAt(s - 1)
      if (gap != null && s >= WARMUP) {
        const cell = tailCell[d]![Math.min(gap, TAIL_GAP_CAP)]!
        cell.n++
        if (mask & (1 << d)) cell.hit++
      }
      tailOcc[d]!.add(s, (mask & (1 << d)) !== 0)
    }
    tailMasks.push(mask)

    if (!live) {
      POINT_KEYS.forEach(k => out[k].push(NONE))
      continue
    }

    // ---- 第 1 點：0~5 徘徊 → 下一期 0~5 只開 0～2 顆 ----
    {
      const lit = lowRun >= LOW_RUN
      out.low.push({
        lit,
        strong: false,
        target: lit ? `已連 ${lowRun} 期` : '',
        hit: lit && nx ? lowCount(nx) <= 2 : null,
        base: lit ? lowLe2.freq : null
      })
    }

    // ---- 第 2 點：隔期和連續同方向 → 下一期反轉 ----
    {
      const lit = gsRun >= GAPSUM_WATCH
      const nd = nx ? Math.sign(gapSumOf(nx) - gapSumOf(r)) : 0
      out.gapsum.push({
        lit,
        strong: gsRun >= GAPSUM_STRONG,
        target: lit ? `連 ${gsRun} 次${dir > 0 ? '變大' : '變小'}` : '',
        hit: lit && nx ? nd === -dir : null,
        base: revN ? revHit / revN : null
      })
    }

    // ---- 第 3 點：某個值到期 → 下一期開出這個值 ----
    {
      let best = -1
      let bestRatio = 0
      valueOcc.forEach((o, L) => {
        const gap = o.gapAt(s)
        const mean = o.meanInterval
        if (gap == null || mean == null || gap < 2) return
        const ratio = gap / mean
        if (ratio >= VALUE_DUE && ratio > bestRatio) {
          best = L
          bestRatio = ratio
        }
      })
      const lit = best >= 0
      out.value.push({
        lit,
        strong: false,
        target: lit ? `值 ${VALUE_LEVELS[best]}` : '',
        hit: lit && nx ? nx.values.some(v => v != null && valueLevel(v) === best) : null,
        base: lit ? valueOcc[best]!.freq : null
      })
    }

    // ---- 第 4 點：同尾對 → 下一期開出該尾 ----
    {
      const tails = pairTails(r.nums)
      const lit = tails.length > 0
      let base: number | null = null
      if (tails.length === 1) {
        base = tailOcc[tails[0]!]!.freq
      } else if (lit) {
        // 兩組同尾（少見）：逐期數「任一尾有開」
        const want = tails.reduce((m, d) => m | (1 << d), 0)
        let k = 0
        for (let q = 0; q <= s; q++) if ((tailMasks[q]! & want) !== 0) k++
        base = k / (s + 1)
      }
      out.pair.push({
        lit,
        strong: false,
        target: lit ? tails.map(d => `尾${d}`).join('、') : '',
        hit: lit && nx ? tails.some(d => hasTail(nx.nums, d)) : null,
        base
      })
    }

    // ---- 第 5 點：平常多半 y=1 的那幾顆（y=1 過半，實際是第 1、2 顆），連幾期 y≠1 → 下一期這顆 y=1 ----
    {
      const eligible = yRun.map((v, i) => ((y1Occ[i]!.freq ?? 0) >= Y1_MAJORITY ? v : 0))
      const p = argMaxRun(eligible)
      const lit = eligible[p]! >= POS_RUN
      out.y.push({
        lit,
        strong: false,
        target: lit ? `第 ${p + 1} 顆` : '',
        hit: lit && nx ? nx.ys[p] === 1 : null,
        base: lit ? y1Occ[p]!.freq : null
      })
    }

    // ---- 第 6 點：某顆連幾期隔期 > 5 → 下一期這顆隔期 0～5 ----
    {
      const p = argMaxRun(gRun)
      const lit = gRun[p]! >= POS_RUN
      out.pos.push({
        lit,
        strong: false,
        target: lit ? `第 ${p + 1} 顆` : '',
        hit: lit && nx ? (nx.gaps[p] != null && nx.gaps[p]! <= 5) : null,
        base: lit ? lowPosOcc[p]!.freq : null
      })
    }

    // ---- 第 7 點：連莊、梯型走到第 2 步 → 下一期走完第 3 步 ----
    {
      const cands = chainCandidates(rows[s - 1]!.nums, r.nums)
      const lit = cands.length > 0
      out.chain.push({
        lit,
        strong: false,
        target: lit ? cands.map(pad2).join('、') : '',
        hit: lit && nx ? cands.some(n => nx.nums.includes(n)) : null,
        base: lit ? hyperAny(cands.length) : null
      })
    }

    // ---- 第 8 點：排除尾數 —— 照目前隔期，下一期開出比例「比它自己平常低最多」的尾數 → 下一期沒開 ----
    // （2026-10-11 使用者同意改：原本直接比開出率，尾 0 只有 10/20/30 三顆、本來就少開，91% 期數都挑到尾 0）
    {
      let best = -1
      let bestRatio = Number.POSITIVE_INFINITY
      let bestOwn = 0
      for (let d = 0; d < 10; d++) {
        const gap = tailOcc[d]!.gapAt(s)
        if (gap == null) continue
        const r = tailRatio(tailCell[d]!, Math.min(gap, TAIL_GAP_CAP))
        if (r == null || r.ratio >= bestRatio) continue
        best = d
        bestRatio = r.ratio
        bestOwn = r.own
      }
      const lit = best >= 0
      out.tail.push({
        lit,
        strong: false,
        target: lit ? `尾${best}` : '',
        hit: lit && nx ? !hasTail(nx.nums, best) : null,
        base: lit ? 1 - bestOwn : null
      })
    }
  }
  return out
}

/**
 * 第 8 點：某尾數「隔這麼久（第 bucket 格）時下一期開出比例」÷「它自己平常的開出比例」。
 * 平常 = 同一批期數（所有隔期格合計）的開出比例。格子次數少於 TAIL_MIN_N 不比（回 null）。
 */
export function tailRatio(cells: { n: number, hit: number }[], bucket: number): { rate: number, own: number, ratio: number } | null {
  const cell = cells[bucket]!
  if (cell.n < TAIL_MIN_N) return null
  const total = cells.reduce((a, c) => ({ n: a.n + c.n, hit: a.hit + c.hit }), { n: 0, hit: 0 })
  if (!total.hit) return null
  const rate = cell.hit / cell.n
  const own = total.hit / total.n
  return { rate, own, ratio: rate / own }
}

function argMaxRun(runs: number[]): number {
  let p = 0
  runs.forEach((v, i) => {
    if (v > runs[p]!) p = i
  })
  return p
}

/**
 * 第 7 點的候選號：
 *   連莊：上一期、這一期都開出的號碼 → 下一期再開就是連三期
 *   梯型：上一期 x、這一期 x±1（同方向）→ 下一期 x±2；12→13→12 這種不算
 */
export function chainCandidates(prev: number[], cur: number[]): number[] {
  const set = new Set<number>()
  for (const x of prev) {
    if (cur.includes(x)) set.add(x)
    for (const d of [1, -1]) {
      const third = x + 2 * d
      if (cur.includes(x + d) && third >= 1 && third <= 39) set.add(third)
    }
  }
  return [...set].sort((a, b) => a - b)
}

/** 已走完的連莊三期：同一號連三期都開 */
export function tripleRepeats(a: number[], b: number[], c: number[]): number[] {
  return c.filter(n => a.includes(n) && b.includes(n))
}

/** 已走完的梯型：x → x±1 → x±2（同方向），回傳第 3 步的號碼 */
export function stairs(a: number[], b: number[], c: number[]): number[] {
  const out: number[] = []
  for (const x of a) {
    for (const d of [1, -1]) {
      if (b.includes(x + d) && c.includes(x + 2 * d)) out.push(x + 2 * d)
    }
  }
  return [...new Set(out)].sort((p, q) => p - q)
}
