/**
 * 偏差掃描用：從一段開獎紀錄（每期 5 顆）量出所有要檢定的計數。
 * 實際紀錄跟公平模擬都走同一個函式，檢定時兩邊才比得起來。
 * 隔期、值、位置用 computeFeatures（跟頁面同一套容器算法），前 60 期容器沒裝滿不算。
 */

import { computeFeatures } from '../../shared/lotto/patterns/features'
import { BALLS, PICK, SLOTS } from './container-sim'

export const SEG = 100
export const GAP_CATS = SLOTS + 1
export const VALUE_CAP = 20
export const SUM_BINS = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150] as const
export const ZONE = (x: number): number => (x <= 13 ? 0 : x <= 26 ? 1 : 2)
export const HEAD = (x: number): number => Math.floor(x / 10)
export const TAIL = (x: number): number => x % 10
export const zoneKey = (c: number[]): number => c[0]! * 36 + c[1]! * 6 + c[2]!
export const sumBin = (s: number): number => SUM_BINS.findIndex(b => s < b) < 0 ? SUM_BINS.length : SUM_BINS.findIndex(b => s < b)

/** 每期一個量的「實際 − 公平期望」與公平變異；拿來看長期有沒有往一邊漂 */
export interface Series { res: Float64Array, v: Float64Array }

export interface Measure {
  n: number
  counts: number[]
  /** segCounts[段][號碼] */
  segCounts: number[][]
  /** pairs[a * 40 + b]，a < b */
  pairs: Int32Array
  /** triples[(a * 40 + b) * 40 + c]，a < b < c */
  triples: Int32Array
  /** lag[a * 40 + b]：a 在這期、b 在下一期 */
  lag: Int32Array
  repeatHist: number[]
  neighbor: number
  gapHist: number[]
  valueHist: number[]
  yHist: number[]
  /** xyHist[x * 6 + y] */
  xyHist: number[]
  sumBins: number[]
  sumTotal: number
  oddHist: number[]
  zoneBall: number[]
  zonePattern: Map<number, number>
  headBall: number[]
  tailBall: number[]
  consecDraws: number
  consecPairsHist: number[]
  series: Record<string, Series>
}

/** 公平開獎下每期量的平均與變異（逐一列舉 C(39,5) 種組合算出） */
export interface Exact {
  sumMean: number
  sumVar: number
  sumBins: number[]
  oddMean: number
  oddVar: number
  oddDist: number[]
  zoneDist: Map<number, number>
  lowMean: number
  lowVar: number
  consecP: number
  consecPairsDist: number[]
  repeatDist: number[]
}

function consecPairs(c: number[]): number {
  let k = 0
  for (let i = 1; i < c.length; i++) if (c[i] === c[i - 1]! + 1) k++
  return k
}

export function exact(): Exact {
  let total = 0
  let s1 = 0
  let s2 = 0
  let o1 = 0
  let o2 = 0
  let l1 = 0
  let l2 = 0
  let consec = 0
  const sumBinsC = new Array<number>(SUM_BINS.length + 1).fill(0)
  const oddC = new Array<number>(PICK + 1).fill(0)
  const cpC = new Array<number>(PICK).fill(0)
  const zone = new Map<number, number>()
  const c = [0, 0, 0, 0, 0]
  for (c[0] = 1; c[0] <= BALLS; c[0]++) for (c[1] = c[0] + 1; c[1] <= BALLS; c[1]++) for (c[2] = c[1] + 1; c[2] <= BALLS; c[2]++)
    for (c[3] = c[2] + 1; c[3] <= BALLS; c[3]++) for (c[4] = c[3] + 1; c[4] <= BALLS; c[4]++) {
      total++
      const s = c[0] + c[1] + c[2] + c[3] + c[4]
      s1 += s
      s2 += s * s
      sumBinsC[sumBin(s)]! += 1
      const odd = c.filter(x => x % 2 === 1).length
      o1 += odd
      o2 += odd * odd
      oddC[odd]! += 1
      const z = [0, 0, 0]
      for (const x of c) z[ZONE(x)]! += 1
      l1 += z[0]!
      l2 += z[0]! * z[0]!
      zone.set(zoneKey(z), (zone.get(zoneKey(z)) ?? 0) + 1)
      const cp = consecPairs(c)
      cpC[cp]! += 1
      if (cp > 0) consec++
    }
  const choose = (n: number, k: number): number => {
    let r = 1
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1)
    return r
  }
  const sumMean = s1 / total
  const oddMean = o1 / total
  const lowMean = l1 / total
  return {
    sumMean,
    sumVar: s2 / total - sumMean * sumMean,
    sumBins: sumBinsC.map(x => x / total),
    oddMean,
    oddVar: o2 / total - oddMean * oddMean,
    oddDist: oddC.map(x => x / total),
    zoneDist: new Map([...zone].map(([k, v]) => [k, v / total])),
    lowMean,
    lowVar: l2 / total - lowMean * lowMean,
    consecP: consec / total,
    consecPairsDist: cpC.map(x => x / total),
    repeatDist: Array.from({ length: PICK + 1 }, (_, k) => choose(PICK, k) * choose(BALLS - PICK, PICK - k) / choose(BALLS, PICK))
  }
}

const series = (n: number): Series => ({ res: new Float64Array(n), v: new Float64Array(n) })

export function measure(draws: number[][], ex: Exact): Measure {
  const n = draws.length
  const p = PICK / BALLS
  const counts = new Array<number>(BALLS + 1).fill(0)
  const segCounts = Array.from({ length: Math.floor(n / SEG) }, () => new Array<number>(BALLS + 1).fill(0))
  const pairs = new Int32Array(40 * 40)
  const triples = new Int32Array(40 * 40 * 40)
  const lag = new Int32Array(40 * 40)
  const repeatHist = new Array<number>(PICK + 1).fill(0)
  const sumBinsC = new Array<number>(SUM_BINS.length + 1).fill(0)
  const oddHist = new Array<number>(PICK + 1).fill(0)
  const zoneBall = [0, 0, 0]
  const zonePattern = new Map<number, number>()
  const headBall = [0, 0, 0, 0]
  const tailBall = new Array<number>(10).fill(0)
  const consecPairsHist = new Array<number>(PICK).fill(0)
  const sr: Record<string, Series> = {
    sum: series(n), odd: series(n), low: series(n), consec: series(n), repeat: series(n), edge: series(n), y1: series(n)
  }
  const perNum = Array.from({ length: BALLS + 1 }, () => series(n))
  let neighbor = 0
  let consecDraws = 0
  let sumTotal = 0
  const repMean = PICK * PICK / BALLS
  const repVar = ex.repeatDist.reduce((s, q, k) => s + q * k * k, 0) - repMean * repMean
  draws.forEach((d, t) => {
    const seg = Math.floor(t / SEG)
    for (const x of d) {
      counts[x]! += 1
      if (seg < segCounts.length) segCounts[seg]![x]! += 1
      zoneBall[ZONE(x)]! += 1
      headBall[HEAD(x)]! += 1
      tailBall[TAIL(x)]! += 1
    }
    const inDraw = new Set(d)
    for (let x = 1; x <= BALLS; x++) {
      perNum[x]!.res[t] = (inDraw.has(x) ? 1 : 0) - p
      perNum[x]!.v[t] = p * (1 - p)
    }
    for (let i = 0; i < PICK; i++) for (let j = i + 1; j < PICK; j++) {
      pairs[d[i]! * 40 + d[j]!]! += 1
      for (let k = j + 1; k < PICK; k++) triples[(d[i]! * 40 + d[j]!) * 40 + d[k]!]! += 1
    }
    const s = d.reduce((a, b) => a + b, 0)
    sumTotal += s
    sumBinsC[sumBin(s)]! += 1
    sr.sum!.res[t] = s - ex.sumMean
    sr.sum!.v[t] = ex.sumVar
    const odd = d.filter(x => x % 2 === 1).length
    oddHist[odd]! += 1
    sr.odd!.res[t] = odd - ex.oddMean
    sr.odd!.v[t] = ex.oddVar
    const z = [0, 0, 0]
    for (const x of d) z[ZONE(x)]! += 1
    zonePattern.set(zoneKey(z), (zonePattern.get(zoneKey(z)) ?? 0) + 1)
    sr.low!.res[t] = z[0]! - ex.lowMean
    sr.low!.v[t] = ex.lowVar
    const cp = consecPairs(d)
    consecPairsHist[cp]! += 1
    if (cp > 0) consecDraws++
    sr.consec!.res[t] = (cp > 0 ? 1 : 0) - ex.consecP
    sr.consec!.v[t] = ex.consecP * (1 - ex.consecP)
    if (t > 0) {
      const prev = draws[t - 1]!
      let rep = 0
      for (const a of prev) for (const b of d) {
        lag[a * 40 + b]! += 1
        if (Math.abs(a - b) === 1) neighbor++
        if (a === b) rep++
      }
      repeatHist[rep]! += 1
      sr.repeat!.res[t] = rep - repMean
      sr.repeat!.v[t] = repVar
    }
  })

  const gapHist = new Array<number>(GAP_CATS).fill(0)
  const valueHist = new Array<number>(VALUE_CAP + 1).fill(0)
  const yHist = new Array<number>(PICK + 1).fill(0)
  const xyHist = new Array<number>(36).fill(0)
  computeFeatures(draws, SLOTS).forEach((f, t) => {
    if (t < SLOTS) return
    f.gaps.forEach((g, i) => {
      if (g == null) {
        gapHist[SLOTS]! += 1
        return
      }
      gapHist[g]! += 1
      valueHist[Math.min(f.values[i]!, VALUE_CAP)]! += 1
      const x = f.xs[i]!
      const y = f.ys[i]!
      yHist[y]! += 1
      xyHist[x * 6 + y]! += 1
      if (x >= 3) {
        sr.edge!.res[t] += (y === 1 || y === x ? 1 : 0) - 2 / x
        sr.edge!.v[t] += (2 / x) * (1 - 2 / x)
      }
      if (x >= 2) {
        sr.y1!.res[t] += (y === 1 ? 1 : 0) - 1 / x
        sr.y1!.v[t] += (1 / x) * (1 - 1 / x)
      }
    })
  })
  for (let x = 1; x <= BALLS; x++) sr[`n${x}`] = perNum[x]!
  return {
    n, counts, segCounts, pairs, triples, lag, repeatHist, neighbor, gapHist, valueHist, yHist, xyHist,
    sumBins: sumBinsC, sumTotal, oddHist, zoneBall, zonePattern, headBall, tailBall, consecDraws, consecPairsHist, series: sr
  }
}

/** 每 SEG 期一段的 z，和從頭累加的最大偏離（第幾期、標準化後多大） */
export function drift(s: Series): { segZ: number[], disp: number, cusum: number, at: number } {
  const n = s.res.length
  const segZ: number[] = []
  for (let a = 0; a + SEG <= n; a += SEG) {
    let r = 0
    let v = 0
    for (let t = a; t < a + SEG; t++) {
      r += s.res[t]!
      v += s.v[t]!
    }
    segZ.push(v > 0 ? r / Math.sqrt(v) : 0)
  }
  let tv = 0
  for (let t = 0; t < n; t++) tv += s.v[t]!
  let cum = 0
  let best = 0
  let at = 0
  for (let t = 0; t < n; t++) {
    cum += s.res[t]!
    if (Math.abs(cum) > Math.abs(best)) {
      best = cum
      at = t
    }
  }
  return { segZ, disp: segZ.reduce((a, z) => a + z * z, 0), cusum: tv > 0 ? best / Math.sqrt(tv) : 0, at }
}
