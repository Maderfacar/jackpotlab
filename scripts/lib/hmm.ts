/**
 * 隱藏模式切換用：類別型隱藏馬可夫模型（HMM），Baum-Welch 擬合、Viterbi 找每期最可能的模式。
 * 每期有好幾個觀察（例如 0～5 幾顆、y=1 幾顆），各自是一個類別；同一個模式底下視為各自獨立。
 */

export interface HmmFit {
  k: number
  /** 對數概似：模型把這段紀錄解釋得多好（越大越好） */
  ll: number
  pi: number[]
  /** a[i][j]：這期是模式 i，下一期變成模式 j 的機會 */
  a: number[][]
  /** b[模式][觀察][類別] */
  b: number[][][]
  /** 最後一期在各模式的機會 */
  last: number[]
  /** 每期最可能的模式 */
  path: number[]
}

const FLOOR = 1e-6

function normalize(xs: number[]): number[] {
  const s = xs.reduce((a, b) => a + b, 0)
  return xs.map(x => x / s)
}

function marginals(obs: number[][], cats: number[]): number[][] {
  return cats.map((n, f) => normalize(Array.from({ length: n }, (_, c) => FLOOR + obs.filter(o => o[f] === c).length)))
}

function emissions(obs: number[][], b: number[][][], k: number): Float64Array {
  const e = new Float64Array(obs.length * k)
  obs.forEach((o, t) => {
    for (let s = 0; s < k; s++) e[t * k + s] = o.reduce((p, c, f) => p * b[s]![f]![c]!, 1)
  })
  return e
}

interface Pass { ll: number, gamma: Float64Array, xi: number[][] }

/** 前向後向（每期縮放避免下溢） */
function forwardBackward(obs: number[][], pi: number[], a: number[][], e: Float64Array, k: number): Pass {
  const n = obs.length
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

function viterbi(obs: number[][], pi: number[], a: number[][], e: Float64Array, k: number): number[] {
  const n = obs.length
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

/** 每個模式「下一期還是自己」的機會至少 minStay（平均至少待 1 / (1 − minStay) 期），只找慢慢換的模式 */
function sticky(a: number[][], minStay: number): number[][] {
  return a.map((row, i) => {
    if (row[i]! >= minStay || row.length === 1) return row
    const off = 1 - row[i]!
    return row.map((x, j) => (j === i ? minStay : off > 0 ? x / off * (1 - minStay) : (1 - minStay) / (row.length - 1)))
  })
}

function fitOnce(obs: number[][], cats: number[], k: number, rng: () => number, minStay: number, maxIter: number): HmmFit {
  const base = marginals(obs, cats)
  let pi = new Array<number>(k).fill(1 / k)
  let a = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (k === 1 ? 1 : i === j ? 0.98 : 0.02 / (k - 1))))
  let b = Array.from({ length: k }, () => base.map(p => normalize(p.map(x => x * (0.6 + 0.8 * rng())))))
  let prev = -Infinity
  let pass: Pass | null = null
  for (let it = 0; it < maxIter; it++) {
    pass = forwardBackward(obs, pi, a, emissions(obs, b, k), k)
    const g = pass.gamma
    pi = normalize(Array.from({ length: k }, (_, s) => g[s]! + FLOOR))
    a = sticky(pass.xi.map(row => normalize(row.map(x => x + FLOOR))), minStay)
    b = Array.from({ length: k }, (_, s) => cats.map((n, f) => {
      const acc = new Array<number>(n).fill(FLOOR)
      obs.forEach((o, t) => {
        acc[o[f]!]! += g[t * k + s]!
      })
      return normalize(acc)
    }))
    if (pass.ll - prev < 1e-6) break
    prev = pass.ll
  }
  const e = emissions(obs, b, k)
  const final = forwardBackward(obs, pi, a, e, k)
  const n = obs.length
  return {
    k,
    ll: final.ll,
    pi,
    a,
    b,
    last: Array.from({ length: k }, (_, s) => final.gamma[(n - 1) * k + s]!),
    path: viterbi(obs, pi, a, e, k)
  }
}

/** 隨機起點擬合幾次，取對數概似最高的；minStay = 0 不限制換的速度 */
export function fitHmm(obs: number[][], cats: number[], k: number, rng: () => number, restarts: number, minStay = 0, maxIter = 200): HmmFit {
  let best: HmmFit | null = null
  for (let r = 0; r < (k === 1 ? 1 : restarts); r++) {
    const fit = fitOnce(obs, cats, k, rng, minStay, maxIter)
    if (!best || fit.ll > best.ll) best = fit
  }
  return best!
}
