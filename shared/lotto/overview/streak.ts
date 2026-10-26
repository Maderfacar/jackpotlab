/**
 * 一頁總覽：拿一串座標狀態（每期一個）算「連 N 期之後怎麼走」「這個狀態等多久了」。
 * 全部只用最新一期以前的資料；最新一期自己不算進歷史次數。
 */

export type StateSeq = readonly (string | null)[]

/** 每個狀態幾次 */
export type Dist = Record<string, number>

export interface Run {
  state: string
  /** 連了幾期（含最新一期） */
  length: number
}

/** 最新一期的狀態連了幾期 */
export function currentRun(seq: StateSeq): Run | null {
  const last = seq.length - 1
  const state = seq[last]
  if (state == null) return null
  let i = last
  while (i - 1 >= 0 && seq[i - 1] === state) i -= 1
  return { state, length: last - i + 1 }
}

export interface RunStats {
  /** 以前（不含這次）這個狀態連到 ≥ length 期的次數 */
  reached: number
  /** 以前這個狀態總共出現過幾段 */
  runs: number
  /** 以前最長連幾期 */
  max: number
  /** 最長那段的最後一期索引（多段一樣長取最近的） */
  maxEnd: number
}

/** 這個狀態以前每一段連續的長度（不含還在連的這段） */
export function runStats(seq: StateSeq, run: Run): RunStats {
  const end = seq.length - run.length
  let reached = 0
  let runs = 0
  let max = 0
  let maxEnd = -1
  let len = 0
  for (let i = 0; i <= end; i++) {
    if (i < end && seq[i] === run.state) {
      len += 1
      continue
    }
    if (len > 0) {
      runs += 1
      if (len >= run.length) reached += 1
      if (len >= max) {
        max = len
        maxEnd = i - 1
      }
    }
    len = 0
  }
  return { reached, runs, max, maxEnd }
}

export interface LadderStep {
  /** 對最近幾期 */
  k: number
  /** 最近 k 期的狀態（舊 → 新） */
  pattern: string[]
  /** 以前出現同樣走法的最後一期索引（舊 → 新，不含最新一期） */
  hits: number[]
  /** 之後第 1、2、3 期各開出什麼（只算已經開出來的） */
  next: [Dist, Dist, Dist]
  /** 之後第 1、2、3 期有資料的次數 */
  nextCount: [number, number, number]
}

const AHEAD = 3

/**
 * 「樓梯」：只對最近 1 期、最近 2 期……一路往上對，直到以前沒出現過為止
 * （那一階也回傳，hits 為空 = 第一次出現）。
 */
export function ladder(seq: StateSeq, maxK = 8): LadderStep[] {
  const last = seq.length - 1
  const steps: LadderStep[] = []
  for (let k = 1; k <= maxK && k <= last + 1; k++) {
    const pattern = seq.slice(last - k + 1)
    if (pattern.some(s => s == null)) break
    const pat = pattern as string[]
    const hits: number[] = []
    for (let i = k - 1; i < last; i++) {
      let ok = true
      for (let j = 0; j < k; j++) {
        if (seq[i - k + 1 + j] !== pat[j]) {
          ok = false
          break
        }
      }
      if (ok) hits.push(i)
    }
    const next: [Dist, Dist, Dist] = [{}, {}, {}]
    const nextCount: [number, number, number] = [0, 0, 0]
    for (const i of hits) {
      for (let a = 0; a < AHEAD; a++) {
        const s = seq[i + 1 + a]
        if (i + 1 + a > last || s == null) continue
        next[a]![s] = (next[a]![s] ?? 0) + 1
        nextCount[a] = nextCount[a]! + 1
      }
    }
    steps.push({ k, pattern: pat, hits, next, nextCount })
    if (hits.length === 0) break
  }
  return steps
}

export interface Wait {
  state: string
  /** 歷史出現幾次（含最新一期） */
  count: number
  /** 已經幾期沒出現（最新一期就是它 = 0）；從沒出現過為 null */
  waited: number | null
  /** 以前每次出現之間平均隔幾期（下一次出現的期數差） */
  avgGap: number | null
  /** 以前隔最久幾期 */
  maxGap: number
  /** 以前隔到 ≥ 目前已等期數的次數（目前已等 0 時不算） */
  reachedNow: number
  /** 以前一共隔了幾次 */
  gaps: number
}

/** 每個狀態等多久了：期數差 = 下一次出現的期序 − 上一次出現的期序 */
export function waits(seq: StateSeq, states: string[]): Wait[] {
  const last = seq.length - 1
  return states.map((state) => {
    const idx: number[] = []
    seq.forEach((s, i) => {
      if (s === state) idx.push(i)
    })
    const diffs = idx.slice(1).map((v, i) => v - idx[i]!)
    const waited = idx.length ? last - idx.at(-1)! : null
    return {
      state,
      count: idx.length,
      waited,
      avgGap: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
      maxGap: diffs.length ? Math.max(...diffs) : 0,
      reachedNow: waited ? diffs.filter(d => d >= waited).length : 0,
      gaps: diffs.length
    }
  })
}

/** Dist 照次數多到少 */
export function sortedDist(d: Dist): [string, number][] {
  return Object.entries(d).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
