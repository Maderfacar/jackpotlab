/**
 * 隱藏模式切換用：類別型隱藏馬可夫模型（HMM），Baum-Welch 擬合、Viterbi 找每期最可能的模式。
 * 每期有好幾個觀察，各自是一個類別；同一個模式底下視為各自獨立。
 * tied = true：每期的觀察共用同一組類別比例（例如每期 5 顆各自從第幾格出來）。
 */

export interface HmmFit {
  k: number
  /** 對數概似：模型把這段紀錄解釋得多好（越大越好） */
  ll: number
  pi: number[]
  /** a[i][j]：這期是模式 i，下一期變成模式 j 的機會 */
  a: number[][]
  /** b[模式][觀察][類別]；tied 時只有 b[模式][0] */
  b: number[][][]
  /** 最後一期在各模式的機會 */
  last: number[]
  /** 每期最可能的模式 */
  path: number[]
}

export interface HmmOptions {
  /** 每個模式「下一期還是自己」的機會至少這麼多（平均至少待 1 / (1 − minStay) 期）；0 = 不限制 */
  minStay?: number
  /** 每期的觀察共用同一組類別比例 */
  tied?: boolean
  maxIter?: number
}

const FLOOR = 1e-6

function normalize(xs: number[]): number[] {
  const s = xs.reduce((a, b) => a + b, 0)
  return xs.map(x => x / s)
}

function marginals(obs: number[][], cats: number[], fi: (f: number) => number): number[][] {
  return cats.map((n, g) => {
    const acc = new Array<number>(n).fill(FLOOR)
    for (const o of obs) o.forEach((c, f) => {
      if (fi(f) === g) acc[c]! += 1
    })
    return normalize(acc)
  })
}

function emissions(obs: number[][], b: number[][][], k: number, fi: (f: number) => number): Float64Array {
  const e = new Float64Array(obs.length * k)
  obs.forEach((o, t) => {
    for (let s = 0; s < k; s++) e[t * k + s] = o.reduce((p, c, f) => p * b[s]![fi(f)]![c]!, 1)
  })
  return e
}

interface Pass { ll: number, gamma: Float64Array, xi: number[][] }

/** 前向後向（每期縮放避免下溢） */
function forwardBackward(n: number, pi: number[], a: number[][], e: Float64Array, k: number): Pass {
  const alpha = new Float64Array(n * k)
  const beta = new Float64Array(n * k)
  const c = new Float64Array(n)
  for (let t = 0; t < n; t++) {
    let sum = 0
    for (let j = 0; j < k; j++) {
      let prior = 0
      if (t === 0) prior = pi[j]!
      else for (let i = 0; i < k; i++) prior += alpha[(t - 1) * k + i]! * a[i]![j]!
      alpha[t * k + j] = prior * e[t * k + j]!
      sum += alpha[t * k + j]!
    }
    c[t] = sum
    for (let j = 0; j < k; j++) alpha[t * k + j] = alpha[t * k + j]! / sum
  }
  for (let j = 0; j < k; j++) beta[(n - 1) * k + j] = 1
  for (let t = n - 2; t >= 0; t--) {
    for (let i = 0; i < k; i++) {
      let s = 0
      for (let j = 0; j < k; j++) s += a[i]![j]! * e[(t + 1) * k + j]! * beta[(t + 1) * k + j]!
      beta[t * k + i] = s / c[t + 1]!
    }
  }
  const gamma = new Float64Array(n * k)
  for (let i = 0; i < n * k; i++) gamma[i] = alpha[i]! * beta[i]!
  const xi = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (let t = 0; t + 1 < n; t++) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) xi[i]![j]! += alpha[t * k + i]! * a[i]![j]! * e[(t + 1) * k + j]! * beta[(t + 1) * k + j]! / c[t + 1]!
    }
  }
  let ll = 0
  for (let t = 0; t < n; t++) ll += Math.log(c[t]!)
  return { ll, gamma, xi }
}

function viterbi(n: number, pi: number[], a: number[][], e: Float64Array, k: number): number[] {
  const score = new Float64Array(n * k)
  const from = new Int32Array(n * k)
  for (let j = 0; j < k; j++) score[j] = Math.log(pi[j]!) + Math.log(e[j]!)
  for (let t = 1; t < n; t++) {
    for (let j = 0; j < k; j++) {
      let best = -Infinity
      let arg = 0
      for (let i = 0; i < k; i++) {
        const v = score[(t - 1) * k + i]! + Math.log(a[i]![j]!)
        if (v > best) {
          best = v
          arg = i
        }
      }
      score[t * k + j] = best + Math.log(e[t * k + j]!)
      from[t * k + j] = arg
    }
  }
  const path = new Array<number>(n).fill(0)
  for (let j = 1; j < k; j++) if (score[(n - 1) * k + j]! > score[(n - 1) * k + path[n - 1]!]!) path[n - 1] = j
  for (let t = n - 1; t > 0; t--) path[t - 1] = from[t * k + path[t]!]!
  return path
}

/** 把每個模式「留在自己」的機會拉到至少 minStay，其餘照比例縮 */
function sticky(a: number[][], minStay: number): number[][] {
  return a.map((row, i) => {
    if (row[i]! >= minStay || row.length === 1) return row
    const off = 1 - row[i]!
    return row.map((x, j) => (j === i ? minStay : off > 0 ? x / off * (1 - minStay) : (1 - minStay) / (row.length - 1)))
  })
}

function fitOnce(obs: number[][], cats: number[], k: number, rng: () => number, opts: Required<HmmOptions>): HmmFit {
  const fi = (f: number): number => (opts.tied ? 0 : f)
  const n = obs.length
  const base = marginals(obs, cats, fi)
  let pi = new Array<number>(k).fill(1 / k)
  let a = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (k === 1 ? 1 : i === j ? 0.98 : 0.02 / (k - 1))))
  let b = Array.from({ length: k }, () => base.map(p => normalize(p.map(x => x * (0.6 + 0.8 * rng())))))
  let prev = -Infinity
  for (let it = 0; it < opts.maxIter; it++) {
    const pass = forwardBackward(n, pi, a, emissions(obs, b, k, fi), k)
    const g = pass.gamma
    pi = normalize(Array.from({ length: k }, (_, s) => g[s]! + FLOOR))
    a = sticky(pass.xi.map(row => normalize(row.map(x => x + FLOOR))), opts.minStay)
    b = Array.from({ length: k }, (_, s) => cats.map((size, grp) => {
      const acc = new Array<number>(size).fill(FLOOR)
      obs.forEach((o, t) => o.forEach((c, f) => {
        if (fi(f) === grp) acc[c]! += g[t * k + s]!
      }))
      return normalize(acc)
    }))
    if (pass.ll - prev < 1e-6) break
    prev = pass.ll
  }
  const e = emissions(obs, b, k, fi)
  const final = forwardBackward(n, pi, a, e, k)
  return {
    k,
    ll: final.ll,
    pi,
    a,
    b,
    last: Array.from({ length: k }, (_, s) => final.gamma[(n - 1) * k + s]!),
    path: viterbi(n, pi, a, e, k)
  }
}

/** 隨機起點擬合幾次，取對數概似最高的 */
export function fitHmm(obs: number[][], cats: number[], k: number, rng: () => number, restarts: number, opts: HmmOptions = {}): HmmFit {
  const full: Required<HmmOptions> = { minStay: 0, tied: false, maxIter: 200, ...opts }
  let best: HmmFit | null = null
  for (let r = 0; r < (k === 1 ? 1 : restarts); r++) {
    const fit = fitOnce(obs, cats, k, rng, full)
    if (!best || fit.ll > best.ll) best = fit
  }
  return best!
}
